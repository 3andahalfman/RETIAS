import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { VADWorker } from './workers/vad-worker.js'
import { STTWorker } from './workers/stt-worker.js'
import { TranscriptAggregator } from './workers/transcript-aggregator.js'
import { QuestionDetector } from './workers/question-detector.js'
import { ContextBuilder } from './workers/context-builder.js'
import { LLMWorker } from './workers/llm-worker.js'
import { SessionRecorder } from './workers/session-recorder.js'

/**
 * Central IPC event bus + worker orchestrator.
 * All inter-worker communication flows through here.
 * Workers are created on session:start and torn down on session:stop.
 *
 * Event map:
 *   audio:chunk          Ring Buffer → VAD + STT workers
 *   stt:partial          STT → Aggregator
 *   stt:final            STT → Aggregator
 *   vad:silence          VAD → Question Detector
 *   transcript:sentence  Aggregator → Question Detector
 *   question:detected    Detector → Context Builder
 *   context:ready        Builder → LLM Worker
 *   llm:token            LLM Worker → Renderer (IPC)
 *   llm:done             LLM Worker → Renderer (IPC)
 *   overlay:regenerate   Hotkey → LLM Worker
 */
export class IpcBus extends EventEmitter {
  private overlayWindow: BrowserWindow
  private mainWindow: BrowserWindow | null = null
  private sessionActive = false

  // Workers — created fresh each session
  private vadWorker: VADWorker | null = null
  private sttWorker: STTWorker | null = null
  private aggregator: TranscriptAggregator | null = null
  private questionDetector: QuestionDetector | null = null
  private contextBuilder: ContextBuilder | null = null
  private llmWorker: LLMWorker | null = null
  private sessionRecorder: SessionRecorder | null = null

  constructor(overlayWindow: BrowserWindow, mainWindow?: BrowserWindow) {
    super()
    this.setMaxListeners(100)
    this.overlayWindow = overlayWindow
    this.mainWindow = mainWindow ?? null
    this.wireRendererForwarding()
  }

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win
  }

  /** Forward key events to the renderer processes */
  private wireRendererForwarding() {
    // LLM tokens → overlay
    this.on('llm:token', (token: string) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('llm:token', token)
      }
    })

    this.on('llm:done', () => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('llm:done')
      }
    })

    // Detected question → overlay (auto-shows it)
    this.on('question:detected', (question: string, type: string) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('question:detected', question, type)
        this.overlayWindow.showInactive()
      }
    })

    // Compound question update → overlay (replaces last generating answer)
    this.on('question:update', (question: string, type: string) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('question:update', question, type)
      }
    })

    // Transcript updates → the overlay window (single window)
    this.on('transcript:update', (text: string, isFinal: boolean) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('transcript:update', text, isFinal)
      }
    })

    // Conversation state changes → renderer (drives Listening/Processing badges)
    this.on('conv:state', (state: string) => {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('conv:state', state)
      }
    })
  }

  async startSession(config: SessionConfig) {
    if (this.sessionActive) this.stopSession()

    console.log('[IpcBus] Starting session:', config)
    this.sessionActive = true

    // Instantiate workers first so they can register their session:started listeners
    // (Audio comes from renderer's Web Audio API via audio:chunk IPC)
    this.vadWorker = new VADWorker(this)
    this.sttWorker = new STTWorker(this)
    this.aggregator = new TranscriptAggregator(this)
    this.questionDetector = new QuestionDetector(this)
    this.contextBuilder = new ContextBuilder(this)
    this.llmWorker = new LLMWorker(this)
    this.sessionRecorder = new SessionRecorder(this)

    // Emit after workers are ready so all workers catch the event
    this.emit('session:started', config)

    try {
      await this.sttWorker.start(config)
      console.log('[IpcBus] All workers started ✓')
    } catch (err) {
      console.error('[IpcBus] Failed to start workers:', err)
    }
  }

  stopSession() {
    if (!this.sessionActive) return
    this.sessionActive = false
    this.emit('session:stopped')

    this.sttWorker?.stop()
    this.vadWorker?.stop()
    this.aggregator?.stop()
    this.questionDetector?.stop()
    this.contextBuilder?.stop()
    this.llmWorker?.stop()
    this.sessionRecorder?.stop()

    this.vadWorker = null
    this.sttWorker = null
    this.aggregator = null
    this.questionDetector = null
    this.contextBuilder = null
    this.llmWorker = null
    this.sessionRecorder = null

    console.log('[IpcBus] Session stopped, all workers destroyed')
  }

  destroy() {
    this.stopSession()
    this.removeAllListeners()
  }
}

export interface SessionConfig {
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
