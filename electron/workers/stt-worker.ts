import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'
import { IpcBus, SessionConfig } from '../ipc-bus.js'

/**
 * STT Worker — System Audio Only (Interviewer)
 *
 * Transcribes only the system/speaker audio (what the interviewer says).
 * Mic audio is intentionally excluded — it is only used by VAD for silence detection.
 *
 * All transcripts are labeled as 'interviewer'.
 */

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000]

export class STTWorker {
  private ipcBus: IpcBus
  private connection: ReturnType<ReturnType<typeof createClient>['listen']['live']> | null = null
  private reconnectAttempt = 0
  private running = false
  private connected = false
  private detectedSampleRate: number | null = null
  private chunkCount = 0

  private sysHandler: ((chunk: Int16Array, sampleRate: number) => void) | null = null

  private config: SessionConfig | null = null

  constructor(ipcBus: IpcBus) {
    this.ipcBus = ipcBus
  }

  async start(config?: SessionConfig) {
    this.config = config || null
    const apiKey = process.env.DEEPGRAM_API_KEY
    if (!apiKey || apiKey === 'your_deepgram_api_key_here') {
      console.error('[STTWorker] DEEPGRAM_API_KEY not set or still placeholder')
      return
    }

    this.running = true

    // Only system audio (interviewer) — mic is used by VAD only, not STT
    this.sysHandler = (chunk: Int16Array, sampleRate: number) => this.handleAudio(chunk, sampleRate)
    this.ipcBus.on('audio:chunk:system', this.sysHandler)
  }

  private handleAudio(chunk: Int16Array, sampleRate: number) {
    if (!this.running) return

    if (this.detectedSampleRate !== sampleRate) {
      console.log(`[STTWorker] Sample rate: ${sampleRate}Hz`)
      this.detectedSampleRate = sampleRate
      this.connected = false
      try { this.connection?.finish() } catch { /* ignore */ }
      this.connection = null
      this.connect(sampleRate)
      return
    }

    if (!this.connected || !this.connection) return

    try {
      const ab = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
      this.connection.send(ab)
      this.chunkCount++
      if (this.chunkCount % 40 === 0) {
        console.log(`[STTWorker] ~${Math.round(this.chunkCount * (chunk.length / this.detectedSampleRate!))}s of audio sent`)
      }
    } catch { /* ignore */ }
  }

  private connect(sampleRate: number) {
    try {
      const deepgram = createClient(process.env.DEEPGRAM_API_KEY!)
      console.log(`[STTWorker] Connecting to Deepgram @ ${sampleRate}Hz (Mono / System Audio)...`)

      this.connection = deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        encoding: 'linear16',
        sample_rate: sampleRate,
        channels: 1,
        interim_results: true,
        punctuate: true,
        smart_format: true,
        endpointing: 300,
        utterance_end_ms: 1000,
      })

      this.connection.on(LiveTranscriptionEvents.Open, () => {
        this.connected = true
        this.reconnectAttempt = 0
        this.chunkCount = 0
        console.log(`[STTWorker] ✅ Deepgram connected @ ${sampleRate}Hz (Mono)`)
      })

      this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data?.channel?.alternatives?.[0]?.transcript
        if (!transcript?.trim()) return

        // All audio is system/speaker — always label as interviewer
        if (data.is_final) {
          console.log(`[STTWorker] Final (interviewer): "${transcript}"`)
          this.ipcBus.emit('stt:final', transcript, data.start, data.duration, 'interviewer')
        } else {
          this.ipcBus.emit('stt:partial', transcript, 'interviewer')
        }
      })

      const keepAlive = setInterval(() => {
        if (this.connected && this.connection) {
          try { (this.connection as any).keepAlive() } catch { /* ignore */ }
        }
      }, 10000)

      this.connection.on(LiveTranscriptionEvents.Close, (event: any) => {
        clearInterval(keepAlive)
        this.connected = false
        const reason = event?.reason || event?.code || '(no reason)'
        console.warn(`[STTWorker] Connection closed: ${JSON.stringify(reason)}`)
        if (this.running && this.detectedSampleRate) {
          const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt++, RECONNECT_DELAYS_MS.length - 1)]
          console.log(`[STTWorker] Reconnect in ${delay}ms (attempt ${this.reconnectAttempt})`)
          setTimeout(() => this.connect(this.detectedSampleRate!), delay)
        }
      })

      this.connection.on(LiveTranscriptionEvents.Error, (err: any) => {
        console.error(`[STTWorker] Error: ${JSON.stringify(err)}`)
      })

    } catch (err) {
      console.error('[STTWorker] Failed to connect:', err)
    }
  }

  stop() {
    this.running = false
    this.connected = false

    if (this.sysHandler) {
      this.ipcBus.removeListener('audio:chunk:system', this.sysHandler)
      this.sysHandler = null
    }

    try { this.connection?.finish() } catch { /* ignore */ }
    this.connection = null
    this.detectedSampleRate = null
    console.log('[STTWorker] Stopped')
  }
}

