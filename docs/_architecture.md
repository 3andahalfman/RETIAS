# Architecture

The big picture. Read this before touching workers or IPC.

## Processes

```
┌────────────────────────────┐     ┌──────────────────────────────┐
│  Renderer (React + Vite)   │     │  Main (Electron + Node)      │
│                            │ IPC │                              │
│  • App.tsx state machine   │ ←→  │  • IpcBus + worker classes   │
│  • View components         │     │  • Supabase session          │
│  • AudioCapture (mic + WA) │     │  • Anthropic / Deepgram SDKs │
│  • SettingsState in        │     │  • naudiodon (system audio)  │
│    localStorage            │     │  • sql.js (in-memory cache)  │
└────────────────────────────┘     └──────────────────────────────┘
            │                                     │
            └──── 1 overlay BrowserWindow ────────┘
            └──── 1 hidden QuillBot BrowserWindow (Premium login) ─┘
```

- **Main process:** entry `electron/main.ts`, creates the overlay window, registers IPC handlers, owns all background workers, owns the Supabase auth session (encrypted via `safeStorage` in `electron/lib/supabase.ts`).
- **Renderer (overlay):** Vite-built React app in `src/`. Single window in dev (`http://localhost:5173`) or packaged HTML in prod. Hosts every view including the live session UI.
- **QuillBot BrowserWindow:** owned by `electron/lib/quillbot-paraphrase.ts`. Stays hidden except during admin login.

## View state machine (`src/App.tsx`)

```ts
type View = 'dashboard' | 'setup' | 'mock-interview'
          | 'past-sessions' | 'session'
          | 'online-test-entry' | 'online-test' | 'solve-test'
          | 'cv-manager' | 'settings' | 'admin-screenshots' | 'pricing'
```

Transitions are local `setView` calls. There is no router — App.tsx is one big switch over `view`. Each view is rendered with either the sidebar shell (`page-layout > Sidebar + page-main`) or full-page mode (`app-root > component`). See each view doc for which.

**Gates done at the state-machine level:**
- Auth gate at the top of `App.tsx` — without `user`, renders `LoginPage` and ignores `view`.
- `isDocked` short-circuit renders the tiny docked logo instead of the view.
- `view === 'session'` always renders Toolbar + panels regardless of dock state (except docked).

## IPC bus

`electron/ipc-bus.ts` extends `EventEmitter`. It is the single shared event channel for the main process. Workers all hold a reference and `.emit` / `.on` events. The bus also forwards selected events to the renderer over `webContents.send`.

**Key event names** (full list inside the bus file):

| Event | Producer → Consumer |
|---|---|
| `session:started` | IpcBus → all workers |
| `session:stopped` | IpcBus → all workers |
| `audio:chunk` | Renderer → Ring buffer → VAD + STT |
| `stt:partial` / `stt:final` | STT → TranscriptAggregator |
| `vad:silence` | VAD → QuestionDetector |
| `transcript:sentence` | Aggregator → QuestionDetector |
| `question:detected` | Detector → ContextBuilder + Renderer |
| `context:ready` | Builder → LLMWorker |
| `llm:token` | LLM → Renderer |
| `llm:done` | LLM → Renderer + ScreenshotStore (if Online Assessment) |
| `conv:state` | Detector → Renderer (drives Listening/Processing/Generating badges) |
| `transcript:update` | Aggregator → Renderer |
| `screen:card` | main.ts (multi-screen analyse) → Renderer (creates empty answer card) |

Worker classes:
- `VADWorker` — voice activity detection (`@ricky0123/vad-web`)
- `STTWorker` — Deepgram streaming
- `TranscriptAggregator` — partial → sentence boundaries
- `QuestionDetector` — sentence + silence → question candidate
- `ContextBuilder` — assembles the LLM prompt
- `LLMWorker` — Anthropic / OpenAI streaming
- `SessionRecorder` — persists QA + transcript rows to Supabase

All workers are instantiated on `session:start` and destroyed on `session:stop` (see `IpcBus.startSession` / `stopSession`). No worker outlives a session.

## Live session pipeline (chained events)

```
Mic + System audio (renderer Web Audio)
       │ (16k PCM chunks via 'audio:chunk' IPC)
       ▼
Ring Buffer (electron/audio-ring-buffer.ts)
       │
       ├──→ VAD worker  ──→ 'vad:silence'
       └──→ STT worker  ──→ 'stt:partial' / 'stt:final'
                                  │
                                  ▼
                         TranscriptAggregator
                                  │
                                  ├──→ 'transcript:update' → Renderer
                                  └──→ 'transcript:sentence' → QuestionDetector
                                                                       │
                                                  + 'vad:silence' ─────┤
                                                                       ▼
                                                            'question:detected' → ContextBuilder
                                                                       │
                                                                       ▼
                                                                 'context:ready' → LLMWorker
                                                                                       │
                                                                                       ├──→ 'llm:token' stream → Renderer
                                                                                       └──→ 'llm:done' → SessionRecorder
```

In Online Assessment mode the LLM input bypasses STT/VAD and comes from screenshots instead (`screen:analyse-multi` IPC).

## Renderer state (App.tsx)

| State | Lifetime |
|---|---|
| `user` | App session — restored from `retias_user_id` localStorage on boot |
| `view` | App session |
| `sessionActive` / `isStarted` | One live session |
| `sessionConfig` | One live session (includes `aiModel` used by Toolbar's badge) |
| `convState` | Continuously updated by `conv:state` IPC |
| `isDocked` | Toggleable any time |
| `captureQueue` | Online Assessment only — max 5 base64 screenshots before "Analyse All" |
| `cvs` | Reloaded whenever the user changes |

Persistent state lives in:
- **Supabase** — auth, past sessions, transcript, QA, CVs, online_test_captures, solved_questions, subscriptions
- **localStorage** — `retias_user_id`, `retias-settings`, `retias_tutorial_seen`, `answer-font-size-idx`
- **Electron userData** — encrypted Supabase session blob (`sb-session.enc`)

## Build + dev scripts (`package.json`)

| Script | What it does |
|---|---|
| `dev` | Vite + tsc + spawn Electron (with `dev-electron.cjs` so env vars are clean) |
| `build` | Bakes env vars into `electron/_env_generated.ts`, builds Vite, compiles main TS |
| `package:win` | Builds + `electron-builder --win` (signed if CSC env set) |
| `publish:win` | Same + uploads release artefacts via `scripts/publish-win.js` |

## Where things live

```
electron/
  main.ts                 - app entry, IPC registration, window mgmt
  preload.ts              - contextBridge surface (window.electronAPI)
  ipc-bus.ts              - EventEmitter + worker orchestration
  overlay-window.ts       - main overlay BrowserWindow factory
  audio-ring-buffer.ts    - PCM ring buffer fed by 'audio:chunk'
  workers/                - VAD, STT, Aggregator, Detector, ContextBuilder, LLM, Recorder
  lib/
    supabase.ts           - encrypted file storage Supabase client
    auth-store.ts         - User mapping + auth methods
    quillbot-paraphrase.ts- hidden BrowserWindow automation
    paraphrase.ts         - QuillBot first, Claude fallback (5 variants + personalize)
    screenshot-store.ts   - Online Assessment capture upload + scoring
    cv-store.ts, session-store.ts, profile-store.ts, prompt-builder.ts ...

src/
  App.tsx                 - view state machine, top-level renders
  components/             - one file per view + shared atoms (Sidebar, Toolbar, ...)
  lib/
    supabase.ts           - browser Supabase client (used by renderer-side queries)
    admin.ts              - isAdminEmail() helper
  electron.d.ts           - global types for window.electronAPI + User + CV
  index.css               - all styles
```

## Anti-patterns to avoid

- **Don't import `electron` at the top of `electron/lib/supabase.ts`** with a hard property access — use the lazy `getTokenPath()` check. The same module is imported in worker contexts where `app` is undefined.
- **Don't call `setView('online-test-entry')` and then immediately render outside the auth gate.** The `if (!user)` short-circuit must run first.
- **Don't add a new view without listing it in the docked-state short-circuit.** If you do, docking on that view will render the entire page UI underneath the docked content.
- **Don't call Anthropic / Deepgram from the renderer.** Keys live in main process env only.
- **Don't fire LLM calls outside the IpcBus pipeline.** Manual prompts use the `llm:manual-prompt` IPC, not a direct `LLMWorker` reference.
