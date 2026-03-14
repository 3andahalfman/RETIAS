# AI Interview Assistant - Architecture & Pipeline Summary

This document outlines the architecture, data flow, and processing pipeline of the AI Interview Assistant.

## 1. High-Level Architecture
The application is built using Electron + React + Vite.
- **Renderer Process (React UI):** A single floating overlay window. It captures audio, displays the live transcript, and streams AI answers in a two-panel layout (Transcript on the left, AI Answer on the right). It is frameless, transparent, strictly `alwaysOnTop`, and protected from screen recording.
- **Main Process (Node.js):** Orchestrates window management, secure API key loading, and the entirely decoupled worker pipeline for processing audio and inferencing.
- **IPC Bus:** A central Event Emitter (`ipc-bus.ts`) that handles all pub/sub messaging between the components.

## 2. The Processing Pipeline (Workers)
All heavy lifting is divided into specialized worker classes running in the Main Process. The pipeline is fully event-driven.

### Phase 1: Audio Capture (Renderer -> Main)
- The React UI requests microphone permissions and uses the Web Audio API. 
- An `AudioWorklet` captures raw audio chunks, downsamples them to 16kHz, converts them to Int16 PCM, and streams them over IPC (`audio:chunk`) to the Main Process.

### Phase 2: Speech-to-Text (`STTWorker`) & Voice Activity (`VADWorker`)
- **STTWorker:** Listens to `audio:chunk`. Streams raw PCM data to Deepgram (Nova-2 model) via WebSockets. Emits `stt:partial` and `stt:final` events.
- **VADWorker:** Analyzes the RMS volume of the incoming audio chunks. If the volume drops below a threshold for more than 0.8 seconds after speech is detected, it emits a `vad:silence` event.

### Phase 3: Transcript Aggregation (`TranscriptAggregator`)
- Listens for `stt:partial` and `stt:final`.
- For UI display, it forwards the exact raw transcript to the renderer (`transcript:update`).
- For the AI pipeline, it cleans the final transcripts (removing filler words like "um", "uh") and saves them into a rolling 30-second context window.
- Emits `transcript:sentence` containing the cleaned sentence and the last 30s of context.

### Phase 4: Question Detection & Normalization (`QuestionDetector`)
- Uses dual triggers:
  1. **Early Trigger (Regex):** Analyzes partials in real-time. If it spots a common question pattern (e.g., "describe a time when", "how would you design"), it triggers immediately.
  2. **VAD Catch-All:** If speech abruptly stops (via `vad:silence`), it analyzes the last spoken words to see if it represents a question.
- **Normalization:** Before emitting the question, it strips fillers, trims stuttered/repeated words, standardizes punctuation, and lowercases text to create a hash. If the exact same question hash was triggered recently, it ignores it (deduplication).
- Emits `question:detected` with the normalized text and question category (e.g., behavioral, system-design).

### Phase 5: Prompt Assembly (`ContextBuilder`)
- Actively listens to transcription.
- The moment `question:detected` fires, it binds the user's Resume, job description, recent conversation context from Phase 3, and the detected question into a specialized Anthropic system prompt tailored to the specific question category.
- Emits `context:ready`.

### Phase 6: LLM Generation (`LLMWorker`)
- Listens for `context:ready`.
- **Caching:** Hashes the exact question. If it was already answered recently, it streams the cached response instantly from an in-memory or SQLite cache.
- **Generation:** If there's no cache hit, it opens a streaming connection to Anthropic's Claude 3.5 Haiku. 
- Streams tokens back to the Renderer process (`llm:token`) for real-time typewriter display in the Answer Panel.

## 3. The UI Overlay State
The UI is built to be un-intrusive and resilient:
- **Setup View:** A preliminary wizard to gather resume and target role contexts before a session starts.
- **Active Session:** A two-panel floating display.
- **Docked Mode (Mini Logo):** Collapses the entire application into a minimal 50x50px draggable logo widget, ensuring the user can see their interview screen while the pipeline runs entirely in the background.

## Summary of IPC Events Flow
1. `audio:chunk` (Renderer -> Main)
2. `stt:partial` / `stt:final` (STT Worker -> Aggregator)
3. `vad:silence` (VAD Worker -> Question Detector)
4. `transcript:sentence` (Aggregator -> Question Detector & Context Builder)
5. `question:detected` (Question Detector -> Context Builder & Renderer)
6. `context:ready` (Context Builder -> LLM Worker)
7. `llm:token` / `llm:done` (LLM Worker -> Renderer)
