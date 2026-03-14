/**
 * AudioWorklet processor — runs on the audio rendering thread.
 *
 * Pipeline: Microphone → Browser native resample (48kHz→16kHz)
 *           → AudioWorklet (this file, audio thread)
 *           → postMessage (Int16 PCM) → main JS → IPC → Deepgram
 *
 * The AudioContext is created with sampleRate: 16000, so the browser's
 * native DSP pipeline handles the 48kHz → 16kHz resampling using high-quality
 * Sinc interpolation. This processor only needs to:
 * 1. Accumulate 128-sample frames into ~40ms chunks
 * 2. Convert Float32 → Int16 PCM
 * 3. Post to main thread
 *
 * NO manual downsampling — the browser does it better than we ever could.
 */

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    // At 16kHz, accumulate ~40ms of audio = 640 samples
    // 128 samples per frame × 5 frames = 640 samples per chunk
    this._framesPerChunk = 5
    this._frameCount = 0
    this._buffer = new Float32Array(128 * this._framesPerChunk)
    this._writePos = 0
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    if (!input || !input[0] || input[0].length === 0) return true

    const channelData = input[0]  // mono, 128 samples at 16kHz

    // Copy frame into pre-allocated buffer
    this._buffer.set(channelData, this._writePos)
    this._writePos += channelData.length
    this._frameCount++

    // When we have enough frames, convert and send
    if (this._frameCount >= this._framesPerChunk) {
      const len = this._writePos
      const int16 = new Int16Array(len)

      // Float32 [-1, 1] → Int16 [-32768, 32767]
      for (let i = 0; i < len; i++) {
        const s = this._buffer[i]
        int16[i] = s > 0.999 ? 32767 : s < -0.999 ? -32768 : (s * 32768) | 0
      }

      // Post to main thread with zero-copy transfer
      this.port.postMessage({
        type: 'audio',
        samples: int16.buffer,
        sampleRate: 16000,
      }, [int16.buffer])

      // Reset
      this._writePos = 0
      this._frameCount = 0
    }

    return true
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor)
