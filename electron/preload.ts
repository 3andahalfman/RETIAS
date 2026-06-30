import { contextBridge, ipcRenderer } from 'electron'

function createIpcFanout(channel: string) {
  const handlers = new Set<(...args: any[]) => void>()
  ipcRenderer.on(channel, (_event, ...args) => {
    handlers.forEach((handler) => {
      try {
        handler(...args)
      } catch (err) {
        console.error(`[preload] ${channel} handler error:`, err)
      }
    })
  })
  return {
    subscribe(cb: (...args: any[]) => void) {
      handlers.add(cb)
      return () => { handlers.delete(cb) }
    },
    clear() {
      handlers.clear()
    },
  }
}

const llmDoneFanout = createIpcFanout('llm:done')
const updateAvailableFanout = createIpcFanout('update:available')
const updateProgressFanout = createIpcFanout('update:progress')
const updateDownloadedFanout = createIpcFanout('update:downloaded')

// Expose safe IPC bridge to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Session control
  startSession: (config: SessionConfig) => ipcRenderer.send('session:start', config),
  stopSession: () => ipcRenderer.send('session:stop'),

  // Audio
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  analyseScreen: () => ipcRenderer.invoke('screen:analyse'),
  captureScreen: (): Promise<string> => ipcRenderer.invoke('screen:capture'),
  analyseScreens: (images: string[]): Promise<void> => ipcRenderer.invoke('screen:analyse-multi', images),
  sendManualPrompt: (text: string): Promise<void> => ipcRenderer.invoke('llm:manual-prompt', text),
  sendAudioChunk: (buffer: ArrayBuffer, sampleRate: number, source: 'mic' | 'system') =>
    ipcRenderer.send('audio:chunk', buffer, sampleRate, source),

  // Answer events from LLM
  // removeAllListeners guard prevents duplicate tokens if the component re-registers
  onToken: (cb: (token: string) => void) => {
    ipcRenderer.removeAllListeners('llm:token')
    ipcRenderer.on('llm:token', (_e, token) => cb(token))
  },
  onAnswerDone: (cb: () => void) => llmDoneFanout.subscribe(cb),
  onQuestionDetected: (cb: (question: string, type: string) => void) => {
    ipcRenderer.removeAllListeners('question:detected')
    ipcRenderer.on('question:detected', (_e, question, type) => cb(question, type))
  },
  onQuestionUpdate: (cb: (question: string, type: string) => void) => {
    ipcRenderer.removeAllListeners('question:update')
    ipcRenderer.on('question:update', (_e, question, type) => cb(question, type))
  },
  onConvState: (cb: (state: string) => void) =>
    ipcRenderer.on('conv:state', (_e, state) => cb(state)),

  // Transcript
  onTranscript: (cb: (text: string, isFinal: boolean) => void) =>
    ipcRenderer.on('transcript:update', (_e, text, isFinal) => cb(text, isFinal)),

  // Clipboard
  copyAnswer: (text: string) => ipcRenderer.send('copy-answer', text),

  // Answer regenerate
  regenerateAnswer: () => ipcRenderer.send('answer:regenerate'),

  // Window control
  setWindowOpacity: (opacity: number) => ipcRenderer.send('window:set-opacity', opacity),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.send('window:set-always-on-top', value),
  setStealthMode: (enabled: boolean) => ipcRenderer.send('window:set-stealth-mode', enabled),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  clearAllSessions: (): Promise<void> => ipcRenderer.invoke('data:clear-all-sessions'),
  updateDisplayName: (displayName: string): Promise<void> => ipcRenderer.invoke('auth:update-display-name', displayName),
  dockWindow: () => ipcRenderer.send('window:dock'),
  undockWindow: () => ipcRenderer.send('window:undock'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  resizeWindow: (width: number, height: number, animated = true) =>
    ipcRenderer.send('window:resize', width, height, animated),
  snapWindow: (position: 'tl' | 'tm' | 'tr' | 'bl' | 'bm' | 'br') =>
    ipcRenderer.send('window:snap', position),
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send('window:set-ignore-mouse', ignore),

  // Past sessions
  getPastSessions: () => ipcRenderer.invoke('get-past-sessions'),
  getSessionDetail: (sessionId: string) => ipcRenderer.invoke('get-session-detail', sessionId),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('delete-session', sessionId),
  getDashboardMetrics: () => ipcRenderer.invoke('get-dashboard-metrics'),

  // Job scraping
  scrapeJobUrl: (url: string) => ipcRenderer.invoke('scrape-job-url', url),

  // Context prefetch — warms up profile extraction before interview starts
  prefetchContext: (config: { resumeText?: string; jobDescription?: string; company?: string; extraContext?: string }) =>
    ipcRenderer.invoke('prefetch-context', config),

  // Mock interview — generate job description from resume
  generateMockJD: (resumeText: string) => ipcRenderer.invoke('generate-mock-jd', resumeText),

  // Extract plain text from PDF/DOCX buffer
  extractResumeText: (buffer: ArrayBuffer, filename: string) => ipcRenderer.invoke('extract-resume-text', buffer, filename),

  // Open URL in default browser
  openExternal: (url: string) => ipcRenderer.send('open-external', url),

  // Cleanup
  removeAllListeners: (channel: string) => {
    if (channel === 'llm:done') {
      llmDoneFanout.clear()
      return
    }
    ipcRenderer.removeAllListeners(channel)
  },

  // Auth
  authCheckUsername: (displayName: string) => ipcRenderer.invoke('auth:check-username', displayName),
  authRegister: (email: string, password: string, displayName: string) => ipcRenderer.invoke('auth:register', email, password, displayName),
  authLogin: (email: string, password: string) => ipcRenderer.invoke('auth:login', email, password),
  authGoogleAvailable: () => ipcRenderer.invoke('auth:google-available'),
  authDeviceOwner: () => ipcRenderer.invoke('auth:device-owner') as Promise<string | null>,
  authGoogle: () => ipcRenderer.invoke('auth:google'),
  authRestore: (userId: string) => ipcRenderer.invoke('auth:restore', userId),
  authLogout: () => ipcRenderer.send('auth:logout'),
  authRefresh: () => ipcRenderer.invoke('auth:refresh'),
  authGetSession: () => ipcRenderer.invoke('auth:get-session'),

  // Paraphrase / humanise solved-assessment answers
  paraphraseGenerateVariants: (answer: string) =>
    ipcRenderer.invoke('paraphrase:generate-variants', answer),
  paraphrasePersonalize: (payload: { questionId: string; variants: string[]; fallbackAnswer: string }) =>
    ipcRenderer.invoke('paraphrase:personalize', payload),
  paraphraseSelection: (payload: { text: string; mode: 'paraphrase' | 'humanize' | 'humanize-strong' }) =>
    ipcRenderer.invoke('paraphrase:selection', payload),

  // CVs
  saveCv: (name: string, content: string) => ipcRenderer.invoke('cv:save', name, content),
  listCvs: () => ipcRenderer.invoke('cv:list'),
  deleteCv: (cvId: string) => ipcRenderer.invoke('cv:delete', cvId),

  listSolvedQuestions: () => ipcRenderer.invoke('solved:list-questions'),

  // Auto-updater
  getUpdateCheckStatus: () => ipcRenderer.invoke('update:get-check-status'),
  onUpdateCheckStatus: (cb: (result: { status: string; version?: string | null }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, result: { status: string; version?: string | null }) => cb(result)
    ipcRenderer.on('update:check-status', handler)
    return () => ipcRenderer.removeListener('update:check-status', handler)
  },
  retryUpdateCheck: () => ipcRenderer.invoke('update:retry-check'),
  onUpdateAvailable: (cb: (version: string) => void) => updateAvailableFanout.subscribe(cb),
  onUpdateProgress: (cb: (percent: number) => void) => updateProgressFanout.subscribe(cb),
  onUpdateDownloaded: (cb: () => void) => updateDownloadedFanout.subscribe(cb),
  downloadUpdate: () => ipcRenderer.send('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),

  // Window position (for draggable dock)
  getWindowPosition: () => ipcRenderer.invoke('window:get-position'),
  setWindowPosition: (x: number, y: number) => ipcRenderer.send('window:set-position', x, y),

  // Auto-Typer
  autoTypeStart: (opts: { text: string; wpm: number; jitterPct: number; countdownMs: number; typoRate?: number }) =>
    ipcRenderer.invoke('autotype:start', opts),
  autoTypePause: () => ipcRenderer.send('autotype:pause'),
  autoTypeResume: () => ipcRenderer.send('autotype:resume'),
  autoTypeStop: () => ipcRenderer.send('autotype:stop'),
  autoTypeUpdatePace: (opts: { wpm?: number; jitterPct?: number; typoRate?: number }) =>
    ipcRenderer.send('autotype:update-pace', opts),
  onAutoTypeStatus: (cb: (status: AutoTypeStatusPayload) => void) => {
    ipcRenderer.removeAllListeners('autotype:status')
    ipcRenderer.on('autotype:status', (_e, status) => cb(status))
  },
  onAutoTypeCountdown: (cb: (payload: { secondsLeft: number; totalSeconds: number }) => void) => {
    ipcRenderer.removeAllListeners('autotype:countdown')
    ipcRenderer.on('autotype:countdown', (_e, payload) => cb(payload))
  },
})

interface AutoTypeStatusPayload {
  state: 'idle' | 'countdown' | 'typing' | 'paused' | 'done' | 'error'
  charsTyped: number
  totalChars: number
  remainingMs: number
  error?: string
}

interface SessionConfig {
  micDeviceId?: string
  loopbackDeviceId?: string
  resumeText?: string
  targetRole?: string
  company?: string
  jobDescription?: string
  interviewType?: 'SWE' | 'PM' | 'DS'
  language?: string
  aiModel?: string
  extraContext?: string
  autoGenerate?: boolean
  jobUrl?: string
  userId?: string
  testType?: string
  sessionMode?: 'interview' | 'meeting' | 'online-test'
  meetingType?: 'standup' | 'general'
  meetingRole?: string
  meetingContext?: string
}
