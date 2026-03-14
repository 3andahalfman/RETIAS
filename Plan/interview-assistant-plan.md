# Real-Time AI Interview Assistant — Implementation Plan

## Context

Build a desktop application similar to Parakeet AI that listens to interview audio in real-time, detects questions, and displays AI-generated answers in a floating overlay window that is excluded from screen sharing. The system must achieve sub-1.5s latency using a concurrent multi-pipeline architecture with predictive question detection and token streaming.

---

## Architecture Overview

```
Mic + Loopback Audio
        ↓
  Audio Ring Buffer (10s circular, PortAudio)
        ↓               ↓
  STT Worker        VAD Worker
  (Deepgram)        (silence detect)
        ↓               ↓
    Transcript Aggregator
    (merge partials → clean sentences)
        ↓
  Question Predictor
  (early trigger on signal phrases + VAD silence)
        ↓
  Context Builder
  (resume + role + company + last 30s transcript)
        ↓
  LLM Worker (Claude claude-sonnet-4-6, streaming)
        ↓
  Overlay Renderer (screen-share excluded window)
```

All workers run as Electron Worker Threads communicating via an IPC event bus. No worker blocks another.

---

## Project Structure

```
interview-assistant/
├── electron/
│   ├── main.ts                        ← app entry, window creation
│   ├── ipc-bus.ts                     ← EventEmitter-based IPC router
│   ├── audio-ring-buffer.ts           ← PortAudio capture + circular buffer
│   ├── overlay-window.ts              ← transparent, always-on-top, screen-share excluded
│   └── workers/
│       ├── vad-worker.ts              ← @ricky0123/vad-web, emits speech-start/end
│       ├── stt-worker.ts              ← Deepgram WebSocket, 100ms chunks
│       ├── transcript-aggregator.ts   ← merge partials, strip fillers, rolling 30s window
│       ├── question-detector.ts       ← regex + VAD trigger, classify question type
│       ├── context-builder.ts         ← assemble Claude system prompt
│       └── llm-worker.ts              ← Claude streaming, SQLite cache lookup/store
├── src/
│   ├── components/
│   │   ├── Overlay.tsx                ← token streaming answer card
│   │   ├── Transcript.tsx             ← live rolling transcript display
│   │   └── Setup.tsx                  ← onboarding (resume, role, company, audio devices)
│   └── lib/
│       ├── deepgram.ts                ← Deepgram client wrapper
│       ├── claude.ts                  ← Anthropic SDK streaming wrapper
│       └── cache.ts                   ← SQLite hash-based answer cache
├── electron-builder.yml               ← Windows + Mac packaging config
└── package.json
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `electron` | Desktop shell, multi-process, overlay APIs |
| `naudiodon` | PortAudio Node bindings for mic + loopback |
| `@deepgram/sdk` | Streaming STT WebSocket client |
| `@anthropic-ai/sdk` | Claude streaming API |
| `@ricky0123/vad-web` | Local voice activity detection |
| `better-sqlite3` | SQLite for answer cache + session history |
| `react` + `tailwindcss` | Overlay + setup UI |
| `electron-builder` | Cross-platform packaging |

---

## Phase 1 — Audio Ring Buffer + Dual Capture

**Files:** `electron/audio-ring-buffer.ts`

- Initialize PortAudio via `naudiodon`
- Open two streams: microphone input + system loopback
  - Windows: WASAPI loopback device
  - Mac: BlackHole virtual audio device (guide user through install in onboarding)
- Implement a 10-second circular ring buffer in memory
- Allow multiple concurrent consumers to read from the buffer independently (STT worker, VAD worker, local recorder)
- On STT reconnect, replay last N seconds from buffer

---

## Phase 2 — VAD Worker + STT Worker (Concurrent)

**Files:** `electron/workers/vad-worker.ts`, `electron/workers/stt-worker.ts`

**VAD Worker**
- Run `@ricky0123/vad-web` locally (no network)
- Consume audio from ring buffer
- Emit events: `speech-start`, `speech-end`
- Trigger `generateAnswer()` after **1.4s of continuous silence**
- Apply RNNoise for background noise suppression

**STT Worker**
- Open persistent Deepgram Nova-2 WebSocket
- Push 100ms audio chunks from ring buffer continuously
- Receive `is_final: false` partials and `is_final: true` finals
- Forward all results to Transcript Aggregator via IPC bus
- Auto-reconnect with exponential backoff on drop

---

## Phase 3 — Transcript Aggregator

**Files:** `electron/workers/transcript-aggregator.ts`

- Buffer Deepgram partials until `is_final: true` is received
- Emit clean, complete sentences downstream
- Strip filler words: `um`, `uh`, `like`, `you know`, `sort of`
- Maintain a rolling 30-second context window (for context builder)
- Track speaker turns where possible (interviewer vs. candidate)

---

## Phase 4 — Predictive Question Detector

**Files:** `electron/workers/question-detector.ts`

- Apply regex patterns to partial transcripts for early triggering:
  - `"Can you explain..."` → trigger immediately
  - `"Tell me about..."` → trigger immediately
  - `"How would you design..."` → trigger immediately
  - `"What is your..."` → trigger immediately
  - `"Walk me through..."` → trigger immediately
- Also trigger on VAD `speech-end` + silence ≥ 1.4s (catch-all)
- Classify detected question:
  - `behavioral` → STAR method
  - `system-design` → clarify → scale → architecture → tradeoffs
  - `technical` → step-by-step with examples
  - `coding` → approach first, then implementation
- Check SQLite cache before firing LLM (hash lookup, ~100ms response)

---

## Phase 5 — Context Builder

**Files:** `electron/workers/context-builder.ts`

- Runs **during transcription** — prompt is ready before question finishes
- Assembles Claude system prompt from:
  - User resume (stored from onboarding)
  - Target role + company
  - Question type classification
  - Last 30 seconds of clean transcript
- Tailors instruction style per question type (STAR, bullet hints, etc.)
- Output format: compact bullet hints (not paragraphs), max 5 bullets

Example output format for overlay:
```
SYSTEM DESIGN — Rate Limiter
• Clarify: per-user? per-IP? global?
• Scale: 10k req/s → token bucket or sliding window log
• Storage: Redis sorted sets for distributed counters
• Tradeoffs: accuracy vs. memory vs. latency
```

---

## Phase 6 — LLM Worker (Claude Streaming)

**Files:** `electron/workers/llm-worker.ts`, `src/lib/claude.ts`

- Use `@anthropic-ai/sdk` with `stream: true` and model `claude-sonnet-4-6`
- Check SQLite cache first via SHA-256 hash of normalized question text
  - Cache hit → return instantly (~100ms), skip API call
  - Cache miss → call Claude, store result after completion
- Stream tokens via Electron IPC to renderer process as they arrive
- Pre-seed cache with 50 most common interview questions at first launch

---

## Phase 7 — Overlay Window

**Files:** `electron/overlay-window.ts`, `src/components/Overlay.tsx`

**Window config:**
```ts
new BrowserWindow({
  transparent: true,
  alwaysOnTop: true,
  frame: false,
  skipTaskbar: true,
  webPreferences: { nodeIntegration: false, contextIsolation: true }
})
```

**Screen-share exclusion:**
- Windows: `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` via native addon
- Mac: `mainWindow.setContentProtection(true)`

**UI features:**
- Tokens stream in as Claude generates them — no waiting for full response
- Compact bullet format for fast glancing
- Global hotkeys:
  - `Alt+H` — show/hide overlay
  - `Alt+R` — regenerate answer
  - `Alt+C` — copy answer to clipboard

---

## Phase 8 — SQLite Cache Layer

**Files:** `src/lib/cache.ts`

```
question text → normalize (lowercase, strip punctuation) → SHA-256 hash
     ↓
SQLite lookup (table: answers, key: hash + role_type)
     ↓ hit                    ↓ miss
instant answer (~100ms)   Claude API → store result
```

- Schema: `(id, hash, role_type, question_text, answer_text, created_at)`
- Pre-seed common questions: "Tell me about yourself", "Strengths/weaknesses", "Why this company", etc.
- Answers never expire (stable content)

---

## Phase 9 — Onboarding + Setup UI

**Files:** `src/components/Setup.tsx`

- Step 1: Paste resume → parsed and stored in local SQLite
- Step 2: Set target role, company name, interview type (SWE, PM, DS)
- Step 3: Audio device picker (select mic + loopback source)
- Step 4: 30-second audio test (confirm VAD + STT working)
- Practice mode: type questions manually, receive and rate AI answers
- Session history: review past Q&A with timestamps

---

## Phase 10 — IPC Event Bus

**Files:** `electron/ipc-bus.ts`

Central event router connecting all workers:

| Event | From → To |
|---|---|
| `audio:chunk` | Ring Buffer → VAD + STT workers |
| `stt:partial` | STT → Aggregator |
| `stt:final` | STT → Aggregator |
| `vad:silence` | VAD → Question Detector |
| `transcript:sentence` | Aggregator → Question Detector |
| `question:detected` | Detector → Context Builder |
| `context:ready` | Builder → LLM Worker |
| `llm:token` | LLM Worker → Renderer (IPC) |
| `llm:done` | LLM Worker → Renderer (IPC) |

---

## Latency Targets

| Stage | Target |
|---|---|
| Audio → STT partial | < 300ms |
| Question detected | < 100ms after trigger |
| First token from Claude | < 500ms |
| Cache hit answer | < 100ms |
| **Full answer visible** | **~1–1.5s** |

---

## Build Order (6 Weeks)

| Week | Deliverable |
|---|---|
| 1 | Ring buffer + dual audio capture + Deepgram streaming transcript in terminal |
| 2 | VAD worker + transcript aggregator + predictive question detector |
| 3 | Claude streaming + context builder + SQLite cache |
| 4 | Electron overlay + screen-share exclusion + IPC bus wiring |
| 5 | Onboarding UI, global hotkeys, RNNoise filtering, filler word stripping |
| 6 | Packaging (Windows + Mac installers), code signing, pre-seeded cache |

---

## API Costs (Estimated)

| Service | Rate | 1-hr interview |
|---|---|---|
| Deepgram Nova-2 streaming | $0.0043/min | ~$0.26 |
| Claude Sonnet 4.6 | ~$3/M input tokens | ~$0.10–0.20 |
| **Total** | | **< $0.50** |

---

## Verification

1. **Audio pipeline**: Run terminal script, speak into mic, confirm Deepgram transcript appears in < 300ms
2. **VAD**: Confirm `speech-end` fires reliably after 1.4s silence (test with stopwatch)
3. **Question detection**: Read 10 sample interview questions aloud, confirm all trigger correctly
4. **Cache**: Run same question twice, confirm second response is instant (< 100ms)
5. **Overlay exclusion**: Start a Zoom/Google Meet screen share, confirm overlay is invisible to shared view
6. **End-to-end latency**: Time from question end → first token visible in overlay (target < 500ms)
7. **Packaging**: Build Windows `.exe` and Mac `.dmg`, test cold start on clean machine
