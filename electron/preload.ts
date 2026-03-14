import { contextBridge, ipcRenderer } from 'electron'

// Expose safe IPC bridge to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Session control
  startSession: (config: SessionConfig) => ipcRenderer.send('session:start', config),
  stopSession: () => ipcRenderer.send('session:stop'),

  // Audio
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  sendAudioChunk: (buffer: ArrayBuffer, sampleRate: number, source: 'mic' | 'system') =>
    ipcRenderer.send('audio:chunk', buffer, sampleRate, source),

  // Answer events from LLM
  onToken: (cb: (token: string) => void) =>
    ipcRenderer.on('llm:token', (_e, token) => cb(token)),
  onAnswerDone: (cb: () => void) =>
    ipcRenderer.on('llm:done', () => cb()),
  onQuestionDetected: (cb: (question: string, type: string) => void) =>
    ipcRenderer.on('question:detected', (_e, question, type) => cb(question, type)),
  onQuestionUpdate: (cb: (question: string, type: string) => void) =>
    ipcRenderer.on('question:update', (_e, question, type) => cb(question, type)),
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
  dockWindow: () => ipcRenderer.send('window:dock'),
  undockWindow: () => ipcRenderer.send('window:undock'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  resizeWindow: (width: number, height: number, animated = true) =>
    ipcRenderer.send('window:resize', width, height, animated),
  snapWindow: (position: 'tl' | 'tm' | 'tr' | 'bl' | 'bm' | 'br') =>
    ipcRenderer.send('window:snap', position),

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
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),

  // Auth
  authRegister: (email: string, password: string, displayName: string) => ipcRenderer.invoke('auth:register', email, password, displayName),
  authLogin: (email: string, password: string) => ipcRenderer.invoke('auth:login', email, password),
  authGoogleAvailable: () => ipcRenderer.invoke('auth:google-available'),
  authGoogle: () => ipcRenderer.invoke('auth:google'),
  authRestore: (userId: string) => ipcRenderer.invoke('auth:restore', userId),
  authLogout: () => ipcRenderer.send('auth:logout'),

  // CVs
  saveCv: (name: string, content: string) => ipcRenderer.invoke('cv:save', name, content),
  listCvs: () => ipcRenderer.invoke('cv:list'),
  deleteCv: (cvId: string) => ipcRenderer.invoke('cv:delete', cvId),

  // Auto-updater
  onUpdateAvailable: (cb: (version: string) => void) => ipcRenderer.on('update:available', (_e, version) => cb(version)),
  onUpdateProgress: (cb: (percent: number) => void) => ipcRenderer.on('update:progress', (_e, percent) => cb(percent)),
  onUpdateDownloaded: (cb: () => void) => ipcRenderer.on('update:downloaded', () => cb()),
  downloadUpdate: () => ipcRenderer.send('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),

  // Window position (for draggable dock)
  getWindowPosition: () => ipcRenderer.invoke('window:get-position'),
  setWindowPosition: (x: number, y: number) => ipcRenderer.send('window:set-position', x, y),
})

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
}
