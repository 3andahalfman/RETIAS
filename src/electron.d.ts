// Global type declarations for the Electron contextBridge API
// exposed via preload.ts

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
  analyseScreens: (images: string[]) => Promise<void>
  sendAudioChunk: (buffer: ArrayBuffer, sampleRate: number, source: 'mic' | 'system') => void

  // Answer streaming
  onToken: (cb: (token: string) => void) => void
  onAnswerDone: (cb: () => void) => void
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
  authGoogle: () => Promise<User>
  authRestore: (userId: string) => Promise<User | null>
  authLogout: () => void

  // CVs
  saveCv: (name: string, content: string) => Promise<CV>
  listCvs: () => Promise<CV[]>
  deleteCv: (cvId: string) => Promise<void>
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
