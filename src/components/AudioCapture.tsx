import { useEffect, useRef } from 'react'

/**
 * AudioCapture — Dual Stream Architecture (Hardware Diarization)
 *
 * Captures 2 separate streams to perfectly separate Candidate vs Interviewer:
 * 1. Microphone (Candidate)
 * 2. System Audio (Interviewer)
 *
 * Both are processed through parallel 16kHz AudioContexts for high-quality
 * native browser Sinc resampling, then sent via AudioWorklets to the IPC Bus
 * labeled with their respective source type.
 */

interface Props {
  active: boolean
}

export default function AudioCapture({ active }: Props) {
  const micCtxRef = useRef<AudioContext | null>(null)
  const sysCtxRef = useRef<AudioContext | null>(null)
  const micWorkletRef = useRef<AudioWorkletNode | null>(null)
  const sysWorkletRef = useRef<AudioWorkletNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const sysStreamRef = useRef<MediaStream | null>(null)
  // When system audio is unavailable, mic chunks are re-labelled 'system' so the
  // STT worker can still transcribe speech (testing / headphone scenarios).
  const sysAudioActiveRef = useRef(false)

  const startedRef = useRef(false)

  useEffect(() => {
    if (!active) {
      stopCapture()
      return
    }
    if (!startedRef.current) {
      startedRef.current = true
      startCapture()
    }
    return () => {
      stopCapture()
      startedRef.current = false
      sysAudioActiveRef.current = false
    }
  }, [active])

  async function startCapture() {
    try {
      // 1. Capture Microphone (Candidate)
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        video: false,
      })
      micStreamRef.current = micStream

      // 2. Capture System/Screen Audio (Interviewer) via getDisplayMedia
      // Electron intercepts this via setDisplayMediaRequestHandler in main.ts,
      // auto-selecting the primary screen with WASAPI loopback audio (no picker dialog).
      let sysStream: MediaStream | null = null
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
        // Stop the video track — we only need the loopback audio track
        displayStream.getVideoTracks().forEach((t) => t.stop())
        if (displayStream.getAudioTracks().length > 0) {
          sysStream = displayStream
          sysStreamRef.current = sysStream
          sysAudioActiveRef.current = true
          console.log('[AudioCapture] System audio (loopback) captured ✓')
        } else {
          console.warn('[AudioCapture] getDisplayMedia returned no audio tracks — mic fallback active')
        }
      } catch (sysErr: any) {
        console.warn('[AudioCapture] System audio unavailable:', sysErr.message)
      }

      // 3. Setup Processing Pipelines
      await setupPipeline(micStream, 'mic')
      if (sysStream) {
        await setupPipeline(sysStream, 'system')
      } else {
        console.warn('[AudioCapture] No system audio — mic-only mode.')
      }

      console.log('[AudioCapture] ✅ Dual-stream capture started')
    } catch (err: any) {
      console.error('[AudioCapture] Error:', err.message)
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

      // Send to Electron main via IPC, tagged with source.
      // If this is mic audio and no system audio was captured (loopback unavailable),
      // re-label it as 'system' so the STT worker picks it up as interviewer speech.
      const effectiveSource: 'mic' | 'system' =
        source === 'mic' && !sysAudioActiveRef.current ? 'system' : source

      const copy = new Uint8Array(int16.byteLength)
      copy.set(new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength))
      window.electronAPI?.sendAudioChunk(copy.buffer, sampleRate, effectiveSource)
    }

    sourceNode.connect(workletNode)
  }

  function stopCapture() {
    try {
      micWorkletRef.current?.port.close()
      sysWorkletRef.current?.port.close()
      micWorkletRef.current?.disconnect()
      sysWorkletRef.current?.disconnect()
      
      micStreamRef.current?.getTracks().forEach((t) => t.stop())
      sysStreamRef.current?.getTracks().forEach((t) => t.stop())
      
      micCtxRef.current?.close()
      sysCtxRef.current?.close()
    } catch { /* ignore */ }
    
    micWorkletRef.current = null
    sysWorkletRef.current = null
    micStreamRef.current = null
    sysStreamRef.current = null
    micCtxRef.current = null
    sysCtxRef.current = null
    
    console.log('[AudioCapture] Stopped dual-stream')
  }

  return null
}
