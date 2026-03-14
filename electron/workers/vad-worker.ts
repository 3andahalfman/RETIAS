import { IpcBus } from '../ipc-bus.js'

/**
 * VAD Worker — Phase 2
 *
 * Detects voice activity locally (no network round-trip).
 * Emits 'vad:silence' after 0.8s of continuous silence —
 * this is the catch-all trigger for question detection.
 *
 * Uses energy-based detection as a lightweight fallback
 * until @ricky0123/vad-web is wired in Phase 2 full implementation.
 */

const SILENCE_THRESHOLD = 0.01 // RMS amplitude
const SILENCE_TRIGGER_MS = 700  // 0.7 seconds — fast response; compound continuations handled by question:update
const SAMPLE_RATE = 16000

export class VADWorker {
  private ipcBus: IpcBus
  private silenceTimer: NodeJS.Timeout | null = null
  private isSpeaking = false
  private audioHandler: ((chunk: Float32Array) => void) | null = null

  constructor(ipcBus: IpcBus) {
    this.ipcBus = ipcBus

    // Store reference for proper cleanup
    this.audioHandler = (chunk: Float32Array) => {
      this.processChunk(chunk)
    }
    this.ipcBus.on('audio:chunk:float32', this.audioHandler)
  }

  private processChunk(chunk: Float32Array) {
    const rms = this.computeRMS(chunk)
    const speechDetected = rms > SILENCE_THRESHOLD

    if (speechDetected) {
      if (!this.isSpeaking) {
        this.isSpeaking = true
        this.ipcBus.emit('vad:speech-start')
        console.log('[VAD] Speech started')
      }
      // Reset silence timer
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer)
        this.silenceTimer = null
      }
    } else {
      if (this.isSpeaking && !this.silenceTimer) {
        // Start counting silence
        this.silenceTimer = setTimeout(() => {
          this.isSpeaking = false
          this.silenceTimer = null
          this.ipcBus.emit('vad:silence')
          console.log('[VAD] Silence detected — triggering question check')
        }, SILENCE_TRIGGER_MS)
      }
    }
  }

  private computeRMS(chunk: Float32Array): number {
    let sum = 0
    for (let i = 0; i < chunk.length; i++) {
      sum += chunk[i] * chunk[i]
    }
    return Math.sqrt(sum / chunk.length)
  }

  stop() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    // Remove only our own handler on the CORRECT channel
    if (this.audioHandler) {
      this.ipcBus.removeListener('audio:chunk:float32', this.audioHandler)
      this.audioHandler = null
    }
  }
}

