// Global type declarations for the Electron contextBridge API
// exposed via preload.ts

declare const __APP_VERSION__: string

interface SessionConfig {
  micDeviceId?: string
  loopbackDeviceId?: string
  resumeText?: string
  targetRole?: string
  company?: string
  jobDescription?: string
  interviewType?: 'SWE' | 'PM' | 'DS'
  language?: string
  extraContext?: string
  userId?: string
  testType?: string
  aiModel?: string
  sessionMode?: 'interview' | 'meeting' | 'online-test'
  meetingType?: 'standup' | 'general'
  meetingRole?: string
  meetingContext?: string
}

interface PastSession {
  session_id: string
  company: string
  target_role: string
  started_at: number
  ended_at: number | null
  qa_count: number
}

interface SessionQA {
  id: number
  session_id: string
  question: string
  question_type: string
  answer: string
  timestamp: number
}

interface SessionTranscriptLine {
  id: number
  session_id: string
  role: string
  text: string
  timestamp: number
}

interface SessionDetail extends PastSession {
  qa: SessionQA[]
  transcript: SessionTranscriptLine[]
}

interface ScrapeResult {
  success: boolean
  jobDescription?: string
  company?: string
  error?: string
}

interface DashboardMetrics {
  totalSessions: number
  totalQAs: number
  totalTranscriptLines: number
  avgDurationMins: number
  topCompany: string | null
  recentSessions: PastSession[]
}

interface User {
  id: string
  email: string
  display_name: string
  google_id: string | null
  created_at: number
  is_premium: boolean
  is_premium_plus: boolean
}

interface CV {
  id: string
  user_id: string
  name: string
  content: string
  created_at: number
}

interface ElectronAPI {
  startSession: (config: SessionConfig) => void
  stopSession: () => void
  getAudioDevices: () => Promise<any[]>
  getDesktopSources: () => Promise<Array<{ id: string; name: string }>>
  analyseScreen: () => Promise<void>
  captureScreen: () => Promise<string>
  extractInstructionsFromScreen: () => Promise<string>
  updateSessionExtraContext: (text: string) => void
  analyseScreens: (images: string[]) => Promise<void>
  sendManualPrompt: (text: string) => Promise<void>
  sendAudioChunk: (buffer: ArrayBuffer, sampleRate: number, source: 'mic' | 'system') => void

  // Answer streaming
  onToken: (cb: (token: string) => void) => void
  onAnswerDone: (cb: () => void) => () => void
  onQuestionDetected: (cb: (question: string, type: string) => void) => void
  onQuestionUpdate: (cb: (question: string, type: string) => void) => void
  onConvState: (cb: (state: string) => void) => void

  // Transcript
  onTranscript: (cb: (text: string, isFinal: boolean) => void) => void

  // Clipboard
  copyAnswer: (text: string) => void
  regenerateAnswer: () => void

  // Window control
  dockWindow: () => void
  undockWindow: () => void
  minimizeWindow: () => void
  closeWindow: () => void
  resizeWindow: (width: number, height: number, animated?: boolean) => void
  snapWindow: (position: 'tl' | 'tm' | 'tr' | 'bl' | 'bm' | 'br') => void
  setIgnoreMouseEvents: (ignore: boolean) => void
  setWindowOpacity?: (opacity: number) => void
  setAlwaysOnTop?: (value: boolean) => void
  setStealthMode?: (enabled: boolean) => void

  // Past sessions
  getPastSessions: () => Promise<PastSession[]>
  getSessionDetail: (sessionId: string) => Promise<SessionDetail | null>
  deleteSession: (sessionId: string) => Promise<void>
  getDashboardMetrics: () => Promise<DashboardMetrics>

  // Job scraping
  scrapeJobUrl: (url: string) => Promise<ScrapeResult>

  // Context prefetch
  prefetchContext: (config: { resumeText?: string; jobDescription?: string; company?: string; extraContext?: string }) => Promise<void>

  // Mock interview — generate job description from resume
  generateMockJD: (resumeText: string) => Promise<string>

  // Extract plain text from PDF/DOCX buffer
  extractResumeText?: (buffer: ArrayBuffer, filename: string) => Promise<string>

  // Open URL in default browser
  openExternal?: (url: string) => void

  // Cleanup
  removeAllListeners: (channel: string) => void

  // Auth
  authRegister: (email: string, password: string, displayName: string) => Promise<User>
  authLogin: (email: string, password: string) => Promise<User>
  authGoogleAvailable?: () => Promise<boolean>
  authDeviceOwner?: () => Promise<string | null>
  authGoogle: () => Promise<User>
  authRestore: (userId: string) => Promise<User | null>
  authLogout: () => void
  authRefresh?: () => Promise<User | null>
  authGetSession?: () => Promise<{ access_token: string; refresh_token: string } | null>

  // Paraphrase / humanise solved-assessment answers
  paraphraseGenerateVariants?: (answer: string) => Promise<string[]>
  paraphrasePersonalize?: (payload: { questionId: string; variants: string[]; fallbackAnswer: string }) => Promise<string | null>
  paraphraseSelection?: (payload: { text: string; mode: 'paraphrase' | 'humanize' | 'humanize-strong' }) => Promise<string | null>
  authCheckUsername?: (displayName: string) => Promise<boolean>
  updateDisplayName?: (displayName: string) => Promise<void>

  // CVs
  saveCv: (name: string, content: string) => Promise<CV>
  listCvs: () => Promise<CV[]>
  deleteCv: (cvId: string) => Promise<void>

  // Solved Assessment bank (Premium Plus browse)
  listSolvedQuestions?: () => Promise<Array<{
    id: string
    platform: string
    assessment_type: string
    question: string
    answer: string
    answer_variants: string[] | null
    paraphrase_enabled?: boolean
    source_url: string | null
    created_at: string
  }>>

  // Auto-updater
  getUpdateCheckStatus?: () => Promise<{
    status: 'skipped' | 'checking' | 'up-to-date' | 'available' | 'error'
    version?: string | null
    downloadPhase?: 'idle' | 'downloading' | 'ready'
  }>
  onUpdateCheckStatus?: (cb: (result: {
    status: 'skipped' | 'checking' | 'up-to-date' | 'available' | 'error'
    version?: string | null
    downloadPhase?: 'idle' | 'downloading' | 'ready'
  }) => void) => () => void
  retryUpdateCheck?: () => Promise<{
    status: 'skipped' | 'checking' | 'up-to-date' | 'available' | 'error'
    version?: string | null
    downloadPhase?: 'idle' | 'downloading' | 'ready'
  }>
  onUpdateAvailable?: (cb: (version: string) => void) => () => void
  onUpdateProgress?: (cb: (percent: number) => void) => () => void
  onUpdateDownloaded?: (cb: () => void) => () => void
  downloadUpdate?: () => void
  installUpdate?: () => Promise<{ ok: boolean; error?: string }>

  // Auto-Typer
  autoTypeStart?: (opts: {
    text: string
    wpm: number
    jitterPct: number
    countdownMs: number
    typoRate?: number
  }) => Promise<{ ok: boolean }>
  autoTypePause?: () => void
  autoTypeResume?: () => void
  autoTypeStop?: () => void
  autoTypeUpdatePace?: (opts: { wpm?: number; jitterPct?: number; typoRate?: number }) => void
  onAutoTypeStatus?: (cb: (status: AutoTypeStatus) => void) => void
  onAutoTypeCountdown?: (cb: (payload: { secondsLeft: number; totalSeconds: number }) => void) => void
}

interface AutoTypeStatus {
  state: 'idle' | 'countdown' | 'typing' | 'paused' | 'done' | 'error'
  charsTyped: number
  totalChars: number
  remainingMs: number
  error?: string
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
  interface User {
    id: string
    email: string
    display_name: string
    google_id: string | null
    created_at: number
    is_premium: boolean
  }
  interface CV {
    id: string
    user_id: string
    name: string
    content: string
    created_at: number
  }
}

export {}
