import crypto from 'node:crypto'
import { IpcBus, SessionConfig } from '../ipc-bus.js'
import { qaCategoryType } from '../lib/assessment-types.js'
import { MEETING_ASSIST_COMPANY } from '../lib/meeting-types.js'
import { createSession, endSession, addTranscriptLine, addQA } from '../lib/session-store.js'

/**
 * SessionRecorder — captures every session's transcript and Q&A pairs to SQLite.
 *
 * Listens to:
 *   session:started   → creates a new session row
 *   stt:final         → saves each final transcript line (interviewer + candidate)
 *   context:ready     → notes the current question being answered
 *   llm:token         → accumulates answer text
 *   llm:done          → flushes accumulated Q&A pair to DB
 *
 * Stopped by IpcBus.stopSession() which calls stop(), ending the session row.
 */
export class SessionRecorder {
  private ipcBus: IpcBus
  private sessionId: string | null = null
  /** Session-level assessment type (online test setup); overrides per-question LLM types. */
  private sessionTestType: string | null = null

  // Q&A accumulation
  private currentQuestion = ''
  private currentQuestionType = ''
  private currentAnswer = ''
  private questionTimestamp = 0

  private sessionHandler: ((config: SessionConfig) => void) | null = null
  private transcriptHandler: ((text: string, start: number, duration: number, role: 'candidate' | 'interviewer') => void) | null = null
  private contextHandler: ((systemPrompt: string, userMessage: string, question: string, type: string) => void) | null = null
  private screenCardHandler: ((question: string, type: string) => void) | null = null
  private tokenHandler: ((token: string) => void) | null = null
  private doneHandler: (() => void) | null = null

  constructor(ipcBus: IpcBus) {
    this.ipcBus = ipcBus

    this.sessionHandler = (config: SessionConfig) => {
      const id = crypto.randomUUID()
      this.sessionId = id
      this.sessionTestType = config.testType ?? null
      this.currentQuestion = ''
      this.currentAnswer = ''
      let company = config.testType ? 'Online Test' : (config.company || '')
      let targetRole = config.testType ? config.testType : (config.targetRole || '')
      if (config.sessionMode === 'meeting') {
        company = MEETING_ASSIST_COMPANY
        const typeLabel = config.meetingType === 'standup' ? 'Standup' : 'General Meeting'
        targetRole = config.meetingRole ? `${config.meetingRole} — ${typeLabel}` : typeLabel
      }
      createSession(id, company, targetRole, config.userId).catch(console.error)
      this.ipcBus.emit('session:id', id)
      console.log(`[SessionRecorder] Session started: ${id}${config.testType ? ` (${config.testType})` : ''}`)
    }

    this.transcriptHandler = (text: string, _start: number, _duration: number, role: 'candidate' | 'interviewer') => {
      if (!this.sessionId || !text.trim()) return
      addTranscriptLine(this.sessionId, role, text, Date.now()).catch(console.error)
    }

    this.contextHandler = (_sys: string, _user: string, question: string, type: string) => {
      this.currentQuestion = question
      this.currentQuestionType = qaCategoryType(this.sessionTestType, type)
      this.currentAnswer = ''
      this.questionTimestamp = Date.now()
    }

    // Screen capture / manual prompts bypass context-builder — still persist Q&A for online tests
    this.screenCardHandler = (question: string, type: string) => {
      this.currentQuestion = question
      this.currentQuestionType = qaCategoryType(this.sessionTestType, type)
      this.currentAnswer = ''
      this.questionTimestamp = Date.now()
    }

    this.tokenHandler = (token: string) => {
      this.currentAnswer += token
    }

    this.doneHandler = () => {
      if (!this.sessionId || !this.currentQuestion || !this.currentAnswer) return
      addQA(
        this.sessionId,
        this.currentQuestion,
        this.currentQuestionType,
        this.currentAnswer,
        this.questionTimestamp
      ).catch(console.error)
      this.currentQuestion = ''
      this.currentAnswer = ''
    }

    this.ipcBus.on('session:started', this.sessionHandler)
    this.ipcBus.on('stt:final', this.transcriptHandler)
    this.ipcBus.on('context:ready', this.contextHandler)
    this.ipcBus.on('screen:card', this.screenCardHandler)
    this.ipcBus.on('llm:token', this.tokenHandler)
    this.ipcBus.on('llm:done', this.doneHandler)
  }

  stop() {
    if (this.sessionId) {
      endSession(this.sessionId).catch(console.error)
      this.sessionId = null
    }
    this.sessionTestType = null
    if (this.sessionHandler) {
      this.ipcBus.removeListener('session:started', this.sessionHandler)
      this.sessionHandler = null
    }
    if (this.transcriptHandler) {
      this.ipcBus.removeListener('stt:final', this.transcriptHandler)
      this.transcriptHandler = null
    }
    if (this.contextHandler) {
      this.ipcBus.removeListener('context:ready', this.contextHandler)
      this.contextHandler = null
    }
    if (this.screenCardHandler) {
      this.ipcBus.removeListener('screen:card', this.screenCardHandler)
      this.screenCardHandler = null
    }
    if (this.tokenHandler) {
      this.ipcBus.removeListener('llm:token', this.tokenHandler)
      this.tokenHandler = null
    }
    if (this.doneHandler) {
      this.ipcBus.removeListener('llm:done', this.doneHandler)
      this.doneHandler = null
    }
  }
}
