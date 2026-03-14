import { IpcBus } from './ipc-bus.js'

/**
 * Audio Ring Buffer — Phase 1
 *
 * Captures mic audio via naudiodon (PortAudio).
 * Stores last 10 seconds in a circular buffer.
 * Emits Int16 audio:chunk events for VAD + STT workers.
 *
 * Uses SampleFormat16Bit to get Int16 PCM directly —
 * this is what Deepgram expects, no conversion needed.
 */

const SAMPLE_RATE = 16000       // 16kHz — Deepgram optimal
const CHANNELS = 1              // Mono
const BUFFER_SECONDS = 10       // 10s ring buffer
const CHUNK_MS = 100            // 100ms chunks
const SAMPLES_PER_CHUNK = Math.floor((SAMPLE_RATE * CHUNK_MS) / 1000)  // 1600 samples
const BUFFER_SIZE = SAMPLE_RATE * BUFFER_SECONDS  // 160000 samples

export class AudioRingBuffer {
  private buffer: Int16Array
  private writeHead = 0
  private ipcBus: IpcBus
  private micStream: any = null
  private isCapturing = false

  constructor(ipcBus: IpcBus) {
    this.ipcBus = ipcBus
    this.buffer = new Int16Array(BUFFER_SIZE)
  }

  async start(micDeviceId?: number) {
    if (this.isCapturing) return

    try {
      const naudiodon = require('naudiodon')

      // List devices for debug
      const devices: any[] = naudiodon.getDevices()
      const inputDevices = devices.filter((d: any) => d.maxInputChannels > 0)
      console.log('[AudioRingBuffer] Available input devices:')
      inputDevices.forEach((d: any) => console.log(`  [${d.id}] ${d.name}`))

      this.micStream = new naudiodon.AudioIO({
        inOptions: {
          channelCount: CHANNELS,
          sampleFormat: naudiodon.SampleFormat16Bit,  // Int16 PCM directly
          sampleRate: SAMPLE_RATE,
          deviceId: micDeviceId ?? -1,                // -1 = default mic
          closeOnError: false,
        },
      })

      this.micStream.on('data', (chunk: Buffer) => {
        this.writeChunk(chunk)
      })

      this.micStream.on('error', (err: Error) => {
        console.error('[AudioRingBuffer] Mic stream error:', err.message)
      })

      this.micStream.start()
      this.isCapturing = true
      console.log('[AudioRingBuffer] ✅ Mic capture started at 16kHz Int16 mono')

    } catch (err: any) {
      console.error('[AudioRingBuffer] Could not start capture:', err.message)
      console.error('[AudioRingBuffer] Make sure a microphone is connected and accessible')
      throw err
    }
  }

  private writeChunk(chunk: Buffer) {
    // chunk is raw Int16 PCM (2 bytes per sample)
    const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2)

    // Write into ring buffer
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writeHead] = samples[i]
      this.writeHead = (this.writeHead + 1) % BUFFER_SIZE
    }

    // Emit Int16Array chunk directly — STT worker sends this straight to Deepgram
    this.ipcBus.emit('audio:chunk', samples)

    // Also emit Float32 for VAD (energy-based detection)
    const float32 = new Float32Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
      float32[i] = samples[i] / 32768.0
    }
    this.ipcBus.emit('audio:chunk:float32', float32)
  }

  /** Returns the last N seconds of audio as Int16 (for STT reconnect replay) */
  readLastSeconds(seconds: number): Int16Array {
    const count = Math.min(SAMPLE_RATE * seconds, BUFFER_SIZE)
    const result = new Int16Array(count)
    let head = (this.writeHead - count + BUFFER_SIZE) % BUFFER_SIZE
    for (let i = 0; i < count; i++) {
      result[i] = this.buffer[head]
      head = (head + 1) % BUFFER_SIZE
    }
    return result
  }

  stop() {
    try {
      if (this.micStream) {
        this.micStream.quit()
        this.micStream = null
      }
    } catch (e) { /* ignore cleanup error */ }
    this.isCapturing = false
    console.log('[AudioRingBuffer] Capture stopped')
  }

  static async listDevices(): Promise<AudioDevice[]> {
    try {
      const naudiodon = require('naudiodon')
      return naudiodon.getDevices().filter((d: any) => d.maxInputChannels > 0)
    } catch {
      return []
    }
  }
}

export interface AudioDevice {
  id: number
  name: string
  maxInputChannels: number
  maxOutputChannels: number
  defaultSampleRate: number
}

export { SAMPLE_RATE, SAMPLES_PER_CHUNK }
