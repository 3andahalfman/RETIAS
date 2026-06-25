# Audio capture pipeline

| Files | Purpose |
|---|---|
| `src/components/AudioCapture.tsx` | Renderer — captures mic + system audio via Web Audio + getDisplayMedia, streams PCM chunks over IPC |
| `electron/audio-ring-buffer.ts` | Main — circular PCM buffer fed by `audio:chunk` IPC, sliced for VAD + STT |
| `electron/workers/vad-worker.ts` | Main — voice activity detection on the buffer |
| `electron/workers/stt-worker.ts` | Main — Deepgram streaming transcription on the buffer |

## Flow

```
Mic (getUserMedia)                System audio (getDisplayMedia + loopback)
       │                                        │
       └────────── Web Audio mixing ────────────┘
                          │
                          ▼
                 Float32 frames → 16k PCM
                          │ 'audio:chunk' IPC
                          ▼
                   Ring buffer (main)
                     │            │
              VADWorker         STTWorker
                 │                  │
        'vad:silence' ──┐  ┌── 'stt:partial' / 'stt:final'
                        ▼  ▼
                       Aggregator + Detector (see conversation pipeline)
```

## AudioCapture (renderer)

Active only when `isStarted && sessionActive && micActive`. Uses:

- `navigator.mediaDevices.getUserMedia({ audio: true })` for the mic
- `navigator.mediaDevices.getDisplayMedia({ audio: true })` for system audio (the displayMediaRequestHandler in main process auto-selects a screen + loopback)
- A `ScriptProcessorNode` (deprecated but works) to read PCM, downsamples to 16k, sends 250ms chunks via `electronAPI.sendAudioChunk(buffer, sampleRate, source)` where `source` is `'mic' | 'system'`

When the user mutes the mic mid-session the renderer stops sending mic chunks but keeps the system audio stream alive.

## Ring buffer (main)

A naive circular Float32Array per source. New chunks overwrite the oldest. Both VAD and STT subscribe to chunks; one buffer = one shared source of truth.

## VAD worker

`@ricky0123/vad-web` runs the model in a worker_threads context (browser-style API). Emits `vad:silence` after configurable silence threshold. Used by QuestionDetector to decide when a sentence boundary is "really a question".

## STT worker

Deepgram streaming WebSocket. Emits `stt:partial` (interim) and `stt:final` (committed) for both mic and system channels. Source label routes downstream (e.g. interviewer vs candidate).

## Failure modes

- **Deepgram key missing or expired** — STT silently no-ops; transcript stays empty. Logged in main console.
- **No system audio device** — main's `setDisplayMediaRequestHandler` falls back to the first screen source. Pre-cached at startup to avoid races with `setContentProtection`.
- **High DPI / HDR display** — DXGI errors appear in the console (format 10) but are benign; capture still works.

## How to extend

- **Swap STT engine** — implement a new STT worker that emits the same events; swap the `new STTWorker(this)` call in IpcBus.
- **Multi-language STT** — pass `language` from the session config (already wired) and forward to Deepgram model selection.
- **Local fallback STT** (Whisper) — would need an offline model bundle; non-trivial.
- Pitfall: never down-sample the audio twice. The renderer already emits 16k PCM; the worker should consume it as-is.

## Open ideas / not yet built

- Replace ScriptProcessorNode with AudioWorklet (already shipped a worklet file in `public/audio-worklet-processor.js`)
- Visualise mic level in the docked logo (already partial)
