import { IpcBus } from '../ipc-bus.js'

/**
 * Question Detector — Phase 4
 *
 * Employs a conversational state machine to definitively identify questions vs statements:
 * IDLE -> LISTENING_CONTEXT -> QUESTION_CANDIDATE -> QUESTION_CONFIRMED -> ANSWER_IN_PROGRESS
 */

type QuestionType = 'behavioral' | 'system-design' | 'technical' | 'coding' | 'general'

type ConvState = 'IDLE' | 'LISTENING_CONTEXT' | 'QUESTION_CANDIDATE' | 'QUESTION_CONFIRMED' | 'ANSWER_IN_PROGRESS'

interface DetectedQuestion {
  text: string
  type: QuestionType
}

// Short filler phrases that end with '?' but are NOT real interview questions
const FILLER_QUESTIONS = new Set([
  'okay', 'ok', 'right', 'alright', 'yes', 'no', 'really', 'oh',
  'so', 'and', 'hmm', 'interesting', 'good', 'great', 'sure', 'cool',
  'got it', 'i see', 'makes sense', 'fair enough', 'understood', 'nice',
])

// Strong signals (Interrogative words)
const STRONG_SIGNALS = [
  /^(how|why|what|when|where)/i,
  /^(can you|could you|would you)/i
]

// Medium signals (Rising clause structures)
const MEDIUM_SIGNALS = [
  /walk me through/i,
  /tell me about/i,
  /describe a time/i
]

/**
 * Extracts only the question sentence(s) from a block of accumulated speech.
 * Non-question preamble ("I guess you thought about...", "Okay. Interesting.") is stripped
 * from the displayed question but still passed as context to the LLM.
 */
function extractQuestionSentences(text: string): string {
  // Split on sentence-ending punctuation followed by whitespace
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)

  const questionSentences = sentences.filter(s => isQuestion(s))

  if (questionSentences.length > 0) {
    return questionSentences.join(' ')
  }

  // Fallback: if no sentence individually passes, use the last sentence
  // (interviewers often end their preamble with the actual question)
  return sentences[sentences.length - 1] || text.trim()
}

// Determine if a raw sentence classifies as a question based on linguistic heuristics
function isQuestion(text: string): boolean {
  const cleaned = text.trim()
  if (!cleaned) return false

  const lower = cleaned.toLowerCase().replace(/[?!.]+$/, '').trim()

  // Reject known filler acknowledgments even when they end with '?'
  if (FILLER_QUESTIONS.has(lower)) return false

  // Reject short phrases (< 4 words) ending with '?' that lack a strong interrogative signal
  if (cleaned.endsWith('?') && cleaned.split(/\s+/).length < 4) {
    if (!STRONG_SIGNALS.some(r => r.test(lower))) return false
  }

  // 1. Punctuation parity (Deepgram provides this natively via punctuate: true)
  if (cleaned.endsWith('?')) return true

  const lower2 = cleaned.toLowerCase()

  // 2. Strong signals
  for (const regex of STRONG_SIGNALS) {
    if (regex.test(lower2)) return true
  }

  // 3. Medium signals
  for (const regex of MEDIUM_SIGNALS) {
    if (regex.test(lower2)) return true
  }

  return false
}

// Classifies the general domain of the question
function classifyDomain(text: string): QuestionType {
  const t = text.toLowerCase()
  if (t.includes('design') || t.includes('scale') || t.includes('architect')) return 'system-design'
  if (t.includes('code') || t.includes('function') || t.includes('algorithm') || t.includes('implement')) return 'coding'
  if (t.includes('tell me about') || t.includes('describe a time') || t.includes('experience')) return 'behavioral'
  if (t.includes('difference') || t.includes('tradeoff') || t.includes('pros and cons')) return 'technical'
  return 'general'
}

export class QuestionDetector {
  private ipcBus: IpcBus

  private state: ConvState = 'IDLE'
  private currentInterviewerSpeech = ''
  private lastQuestionHash = ''
  private lastFireTime = 0  // ms timestamp of last question:detected or question:update fire

  // Fallback timer: fires if vad:silence never arrives (e.g. candidate on headphones,
  // mic doesn't pick up interviewer voice, so VAD never transitions to isSpeaking)
  private vadFallbackTimer: NodeJS.Timeout | null = null

  // Compound question buffer: after silence is detected, wait before firing to LLM
  // so follow-on sub-questions ("and what has your experience been?") get merged in
  private compoundBufferTimer: NodeJS.Timeout | null = null
  private readonly COMPOUND_BUFFER_MS = 2500

  // Stored handler references for proper cleanup
  private partialHandler: ((text: string, role: 'candidate' | 'interviewer') => void) | null = null
  private silenceHandler: (() => void) | null = null
  private sentenceHandler: ((text: string, contextWindow: string, role: 'candidate' | 'interviewer') => void) | null = null
  private llmDoneHandler: (() => void) | null = null

  constructor(ipcBus: IpcBus) {
    this.ipcBus = ipcBus

    this.partialHandler = (text: string, role: 'candidate' | 'interviewer') => {
      if (role === 'candidate') return

      // Shift to LISTENING_CONTEXT
      if (this.state === 'IDLE' && text.length > 3) {
        this.transition('LISTENING_CONTEXT')
      }

      // If we see strong interrogative partials, shift to QUESTION_CANDIDATE
      if (this.state === 'LISTENING_CONTEXT' && isQuestion(text)) {
        this.transition('QUESTION_CANDIDATE')
      }
    }

    this.sentenceHandler = (text: string, _contextWindow: string, role: 'candidate' | 'interviewer') => {
      if (role === 'candidate') return

      this.currentInterviewerSpeech += ' ' + text

      // Upgrade state on completed sentence if it matches heuristics
      if (isQuestion(text)) {
        this.transition('QUESTION_CANDIDATE')
        // New speech arrived — reset compound buffer so it doesn't fire prematurely
        this.clearCompoundBuffer()
        // Schedule fallback: if vad:silence doesn't arrive (mic not detecting interviewer),
        // trigger detection 500ms after the final transcript lands
        this.scheduleVadFallback()
      } else if (this.state === 'IDLE') {
        this.transition('LISTENING_CONTEXT')
      }
    }

    // Trailing pause acts as our confirmation trigger
    this.silenceHandler = () => {
      // Cancel the fallback timer — real VAD fired, no need for fallback
      this.clearVadFallback()
      this.triggerSilence()
    }

    // Unlock state when LLM finishes
    this.llmDoneHandler = () => {
      this.transition('IDLE')
    }

    this.ipcBus.on('stt:partial', this.partialHandler)
    this.ipcBus.on('transcript:sentence', this.sentenceHandler)
    this.ipcBus.on('vad:silence', this.silenceHandler)
    this.ipcBus.on('llm:done', this.llmDoneHandler)
  }

  /** Core silence-trigger logic — called by both vad:silence and the fallback timer */
  private triggerSilence() {
    const speech = this.currentInterviewerSpeech.trim()

    // While LLM is generating: if there's new speech that's a question, fire an update
    if (this.state === 'ANSWER_IN_PROGRESS') {
      if (speech && isQuestion(speech)) {
        console.log('[QuestionDetector] Continuation question detected mid-generation — firing update')
        this.fireUpdate(speech)
      }
      return
    }

    if (!speech) {
      this.transition('IDLE')
      return
    }

    // If LLM finished recently (<4s ago) and new speech arrived, treat as continuation
    if (this.state === 'IDLE' && Date.now() - this.lastFireTime < 4000) {
      if (isQuestion(speech)) {
        console.log('[QuestionDetector] Continuation speech after recent answer — firing update')
        this.fireUpdate(speech)
        return
      }
    }

    // Check if the accumulated speech is definitively a question
    // Schedule compound buffer instead of firing immediately — allows follow-on
    // sub-questions ("and what has your experience been?") to be merged in
    if (this.state === 'QUESTION_CANDIDATE' || isQuestion(speech)) {
      if (this.state !== 'QUESTION_CANDIDATE') this.transition('QUESTION_CANDIDATE')
      this.scheduleCompoundFire()
    } else {
      console.log(`[QuestionDetector] Statement detected -> saving to context: "${speech}"`)
      this.currentInterviewerSpeech = ''
      this.transition('IDLE')
    }
  }

  private scheduleCompoundFire() {
    this.clearCompoundBuffer()
    this.compoundBufferTimer = setTimeout(() => {
      this.compoundBufferTimer = null
      if (this.state === 'QUESTION_CANDIDATE') {
        const speech = this.currentInterviewerSpeech.trim()
        if (speech) {
          this.transition('QUESTION_CONFIRMED', speech)
        } else {
          this.transition('IDLE')
        }
      }
    }, this.COMPOUND_BUFFER_MS)
  }

  private clearCompoundBuffer() {
    if (this.compoundBufferTimer) {
      clearTimeout(this.compoundBufferTimer)
      this.compoundBufferTimer = null
    }
  }

  private scheduleVadFallback() {
    this.clearVadFallback()
    this.vadFallbackTimer = setTimeout(() => {
      this.vadFallbackTimer = null
      if (this.state === 'QUESTION_CANDIDATE') {
        console.log('[QuestionDetector] VAD fallback fired (mic may not detect interviewer audio)')
        this.triggerSilence()
      }
    }, 500)
  }

  private clearVadFallback() {
    if (this.vadFallbackTimer) {
      clearTimeout(this.vadFallbackTimer)
      this.vadFallbackTimer = null
    }
  }

  private transition(newState: ConvState, payload?: string) {
    if (this.state === newState) return
    console.log(`[QuestionDetector] State: ${this.state} -> ${newState}`)
    this.state = newState
    this.ipcBus.emit('conv:state', newState)

    if (newState === 'QUESTION_CONFIRMED' && payload) {
      this.fireQuestion(payload)
    }
  }

  private normalizeQuestion(text: string) {
    let cleaned = text.trim()
    
    // Ensure terminal punctuation if it's missing but matches heuristics
    if (cleaned.length > 0 && !cleaned.match(/[?!.]$/)) {
      cleaned += '?'
    }

    const hashable = cleaned.toLowerCase().replace(/[^\w\s]/g, '')
    return { normalized: cleaned, hashable }
  }

  private fireQuestion(rawText: string) {
    // We only answer if we aren't already answering something safely
    this.transition('ANSWER_IN_PROGRESS')

    // Extract only the question sentence(s) for display — strip preamble/statements
    const questionOnly = extractQuestionSentences(rawText)
    const { normalized, hashable } = this.normalizeQuestion(questionOnly)

    if (this.lastQuestionHash === hashable) {
      console.log(`[QuestionDetector] Skipping duplicate: ${hashable}`)
      this.transition('IDLE')
      return
    }

    this.lastQuestionHash = hashable
    const type = classifyDomain(normalized)
    this.lastFireTime = Date.now()

    console.log(`[QuestionDetector] Confirmed Question: [${type}] ${normalized}`)

    // normalized = clean question text (displayed + used for cache key)
    // rawText    = full interviewer speech (passed as context for richer LLM answers)
    this.ipcBus.emit('question:detected', normalized, type, rawText.trim())

    // Clear the active buffer so we don't re-fire
    this.currentInterviewerSpeech = ''
  }

  /** Fire a question:update — replaces the last generating answer with fresh context */
  private fireUpdate(rawText: string) {
    const questionOnly = extractQuestionSentences(rawText)
    const { normalized } = this.normalizeQuestion(questionOnly)
    const type = classifyDomain(normalized)
    this.lastFireTime = Date.now()

    console.log(`[QuestionDetector] Update Question: [${type}] ${normalized}`)
    this.ipcBus.emit('question:update', normalized, type, rawText.trim())
    this.currentInterviewerSpeech = ''
  }

  stop() {
    this.clearCompoundBuffer()
    this.clearVadFallback()
    if (this.partialHandler) {
      this.ipcBus.removeListener('stt:partial', this.partialHandler)
      this.partialHandler = null
    }
    if (this.sentenceHandler) {
      this.ipcBus.removeListener('transcript:sentence', this.sentenceHandler)
      this.sentenceHandler = null
    }
    if (this.silenceHandler) {
      this.ipcBus.removeListener('vad:silence', this.silenceHandler)
      this.silenceHandler = null
    }
    if (this.llmDoneHandler) {
      this.ipcBus.removeListener('llm:done', this.llmDoneHandler)
      this.llmDoneHandler = null
    }
  }
}
