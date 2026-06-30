import { useEffect, useRef } from 'react'

/**
 * AudioCapture — Dual Stream Architecture (Hardware Diarization)
 *
 * Captures up to 2 separate streams:
 * 1. Microphone (Candidate)
 * 2. System Audio (Interviewer / meeting participants)
 *
 * Both are processed through parallel 16kHz AudioContexts for high-quality
 * native browser Sinc resampling, then sent via AudioWorklets to the IPC Bus
 * labeled with their respective source type.
 */

interface Props {
  /** Master enable — when false, all capture stops */
  active: boolean
  /** Capture microphone (default: true when active) */
  micEnabled?: boolean
  /** Capture system/loopback audio (default: true when active) */
  systemEnabled?: boolean
}

export default function AudioCapture({
  active,
  micEnabled = true,
  systemEnabled = true,
}: Props) {
  const micCtxRef = useRef<AudioContext | null>(null)
  const sysCtxRef = useRef<AudioContext | null>(null)
  const micWorkletRef = useRef<AudioWorkletNode | null>(null)
  const sysWorkletRef = useRef<AudioWorkletNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const sysStreamRef = useRef<MediaStream | null>(null)
  // When system audio is unavailable, mic chunks are re-labelled 'system' so the
  // STT worker can still transcribe speech (testing / headphone scenarios).
  const sysAudioActiveRef = useRef(false)

  const micRunningRef = useRef(false)
  const sysRunningRef = useRef(false)

  useEffect(() => {
    if (!active) {
      stopMicCapture()
      stopSystemCapture()
      return
    }

    if (systemEnabled && !sysRunningRef.current) {
      startSystemCapture()
    } else if (!systemEnabled && sysRunningRef.current) {
      stopSystemCapture()
    }

    if (micEnabled && !micRunningRef.current) {
      startMicCapture()
    } else if (!micEnabled && micRunningRef.current) {
      stopMicCapture()
    }

    return () => {
      stopMicCapture()
      stopSystemCapture()
    }
  }, [active, micEnabled, systemEnabled])

  async function startMicCapture() {
    if (micRunningRef.current) return
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        video: false,
      })
      micStreamRef.current = micStream
      await setupPipeline(micStream, 'mic')
      micRunningRef.current = true
      console.log('[AudioCapture] Microphone capture started ✓')
    } catch (err: any) {
      console.error('[AudioCapture] Mic error:', err.message)
    }
  }

  async function startSystemCapture() {
    if (sysRunningRef.current) return
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })
      displayStream.getVideoTracks().forEach((t) => t.stop())
      if (displayStream.getAudioTracks().length > 0) {
        sysStreamRef.current = displayStream
        await setupPipeline(displayStream, 'system')
        sysAudioActiveRef.current = true
        sysRunningRef.current = true
        console.log('[AudioCapture] System audio (loopback) captured ✓')
      } else {
        console.warn('[AudioCapture] getDisplayMedia returned no audio tracks — mic fallback active')
      }
    } catch (sysErr: any) {
      console.warn('[AudioCapture] System audio unavailable:', sysErr.message)
    }
  }

  async function setupPipeline(stream: MediaStream, source: 'mic' | 'system') {
    const ctx = new AudioContext({ sampleRate: 16000 })
    if (source === 'mic') micCtxRef.current = ctx
    else sysCtxRef.current = ctx

    await ctx.resume()
    await ctx.audioWorklet.addModule('./audio-worklet-processor.js')

    const sourceNode = ctx.createMediaStreamSource(stream)
    const workletNode = new AudioWorkletNode(ctx, 'audio-capture-processor')

    if (source === 'mic') micWorkletRef.current = workletNode
    else sysWorkletRef.current = workletNode

    workletNode.port.onmessage = (event) => {
      const { type, samples, sampleRate } = event.data
      if (type !== 'audio') return

      const int16 = new Int16Array(samples)
      if (int16.length === 0) return

      const effectiveSource: 'mic' | 'system' =
        source === 'mic' && !sysAudioActiveRef.current ? 'system' : source

      const copy = new Uint8Array(int16.byteLength)
      copy.set(new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength))
      window.electronAPI?.sendAudioChunk(copy.buffer, sampleRate, effectiveSource)
    }

    sourceNode.connect(workletNode)
  }

  function stopMicCapture() {
    try {
      micWorkletRef.current?.port.close()
      micWorkletRef.current?.disconnect()
      micStreamRef.current?.getTracks().forEach((t) => t.stop())
      micCtxRef.current?.close()
    } catch { /* ignore */ }
    micWorkletRef.current = null
    micStreamRef.current = null
    micCtxRef.current = null
    micRunningRef.current = false
  }

  function stopSystemCapture() {
    try {
      sysWorkletRef.current?.port.close()
      sysWorkletRef.current?.disconnect()
      sysStreamRef.current?.getTracks().forEach((t) => t.stop())
      sysCtxRef.current?.close()
    } catch { /* ignore */ }
    sysWorkletRef.current = null
    sysStreamRef.current = null
    sysCtxRef.current = null
    sysRunningRef.current = false
    sysAudioActiveRef.current = false
  }

  return null
}
