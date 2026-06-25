# Live session

| Attribute | Value |
|---|---|
| **View id** | `session` |
| **Files** | `src/App.tsx` (assembles), `src/components/Toolbar.tsx`, `Transcript.tsx`, `AnswerPanel.tsx`, `ManualPromptBar.tsx`, `AudioCapture.tsx` |
| **Auth gate** | Signed-in (Premium for screen analysis + manual prompts) |
| **Wrapped by sidebar?** | No — full-page custom layout |
| **Status** | Live |

## Purpose

The actual in-interview UI. Capturing audio + screen, streaming AI answers, recording the transcript, all visible while the user is talking to a real or mock interviewer.

## Layout & sections

1. **Toolbar (top)** — logo + session label + status badges + Start button (pre-start) + Timer (countdown for free users; count-up for premium) + Model badge + Mic toggle + End Session + Snap / Dock / Close.
2. **Panels (centre, draggable divider)** — split between `TranscriptPanel` (left) and `AnswerPanel` (right). Width persisted only for the current session via CSS variable `--panel-split`.
3. **Manual prompt bar (bottom)** — Premium-only text input that fires `electronAPI.sendManualPrompt`.
4. **Audio capture (invisible)** — `AudioCapture` component runs only when `isStarted && sessionActive && micActive`.

When docked, the entire UI collapses to a 60×60 floating logo that pulses with mic activity.

## Components used

- `Toolbar` (`components/Toolbar.tsx`)
- `TranscriptPanel` (`components/Transcript.tsx`)
- `AnswerPanel` (`components/AnswerPanel.tsx`)
- `ManualPromptBar` (`components/ManualPromptBar.tsx`)
- `AudioCapture` (`components/AudioCapture.tsx`)

## Data sources & IPC

This is the IPC-heaviest view. The full event flow is documented in [`../_architecture.md`](../_architecture.md). Quick reference:

| Channel | Used here |
|---|---|
| `audio:chunk` | `AudioCapture` sends mic + system audio to ring buffer |
| `transcript:update` | TranscriptPanel listens, renders the rolling transcript |
| `question:detected` / `question:update` | AnswerPanel creates / updates an answer card |
| `llm:token` / `llm:done` | AnswerPanel streams the answer into the active card |
| `conv:state` | Toolbar renders Listening / Processing / Generating badge |
| `screen:capture` / `screen:analyse-multi` | AnswerPanel captures screenshots (queue up to 5) and Analyse All |
| `llm:manual-prompt` | ManualPromptBar |
| `answer:regenerate` | Re-runs the last LLM call |
| `copy-answer` | Toolbar / AnswerPanel copy-to-clipboard |

## Features

- Real-time transcript scroll with auto-scroll-to-bottom while listening
- AI answer card per detected question; streams tokens live
- Manual prompt bar — Premium only
- Screen analysis (capture up to 5 screenshots → Analyse All) — Premium only
- Mic mute toggle (visual feedback in toolbar + docked logo bars)
- Drag the panel divider to resize transcript vs answer
- Dock to a 60×60 click-through logo that stays on top
- Auto-dock on certain transitions (see `App.tsx.handleStop`)
- Snap layout (top-left, top-mid, ... bottom-right) via the snap dropdown
- Free-tier 10-minute countdown timer (Mock + Real interview only; Online Assessment exempt)

## Copy (verbatim)

> **Status badges (Toolbar):** Listening… · Processing… · Generating…
> **Live pill:** Live
> **Free countdown tag:** FREE
> **Timer warning thresholds:** ≤3 min amber · ≤1 min red + pulse
> **End Session:** End Session
> **Model badge:** {Sonnet 4.6 / Opus 4.5 / Haiku 4.5 / GPT 4.1 mini}

## How to extend

- **Add a new conversation state** — extend `conv:state` event vocabulary in `QuestionDetector` and add a badge in Toolbar.
- **Add per-card actions** — answer regenerate is already wired; replicate the IPC pattern for "Make shorter" / "Add example".
- **Persist the panel split** — currently per-session via `--panel-split`. Save to localStorage if users complain.
- **New screen-capture flow** — extend `screen:capture` IPC behaviour; primary-display lock is in `electron/main.ts` (see [`../features/screenshot-capture.md`](../features/screenshot-capture.md)).
- Pitfall: never call the LLM directly from the renderer. Always go through the IPC bus.

## Open ideas / not yet built

- Per-question "skip" / "ask follow-up" buttons
- Whisper-style local transcription as a Deepgram fallback
- Click-to-replay short audio snippet from the transcript
