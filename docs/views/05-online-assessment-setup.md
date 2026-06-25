# Online Assessment — type picker

| Attribute | Value |
|---|---|
| **View id** | `online-test` |
| **File** | `src/components/OnlineTestSetup.tsx` |
| **Auth gate** | Premium |
| **Wrapped by sidebar?** | No (full-page) |
| **Status** | Live |

## Purpose

Pick the type of assessment (English / Coding / MCQ / Numerical / AI-ML / Technical / Onboarding) before starting a live capture-driven session.

## Layout & sections

1. **Topbar** — breadcrumb "← Back" (goes to `online-test-entry`) + window controls.
2. **Header** — "🧪 Online Assessment & Onboarding" + subtitle about the AI analysing the screen.
3. **Assessment-type grid** — labeled cards driven by `TEST_TYPES`.
4. **Footer** — Back · Start Assessment.

`Role-Based Expert` section was previously below — **removed**. Don't reintroduce without the user's say-so.

## Components used

Self-contained.

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `electronAPI.snapWindow / dockWindow / closeWindow` | send | Window chrome |
| Renderer `loadSettings()` | localStorage | `aiModel` is read in App.tsx and passed to `startSession` |

When the user clicks Start: `App.tsx.handleCreateOnlineTest(testType)` calls `startSession({ testType, aiModel })`. The renderer immediately sets `setIsStarted(true)` and `setMicActive(false)` — Online Assessment runs mic-off.

## Features

- Pick from a fixed grid of assessment types
- Persists no per-session config (other than `testType` + global `aiModel`)
- Premium gate enforced at Dashboard click + at session-start IPC

## Copy (verbatim)

> **Header:** 🧪 Online Assessment & Onboarding
> **Sub:** Select the type of assessment you're taking. The AI will analyse your screen and provide targeted answers.
> **Section label:** Assessment Types
> **Footer CTAs:** ← Back · Start Assessment →

### TEST_TYPES (current)

| Icon | Label | Description |
|---|---|---|
| ✍️ | English | English language test (grammar, comprehension) |
| 💻 | Coding | Programming challenges |
| ❓ | MCQ | Multiple choice questions |
| 🔢 | Numerical | Maths, stats, quant reasoning |
| 🤖 | AI / ML | Machine learning, model design |
| 🏗️ | Technical | Broader technical assessments |
| 🏢 | Onboarding / Compliance | Company policy, H&S & e-learning |

(See the file for the canonical icons and copy.)

## How to extend

- **Add an assessment type** — append to `TEST_TYPES`. Keep grid at 3 columns by reflowing.
- **Remove a type** — delete and also ensure no in-flight code references its id (search for `testType ===`).
- **Bring back Role-Based Expert** — only if the user explicitly requests; the constants and JSX were removed.

## Open ideas / not yet built

- Per-type tips overlay
- Time budget input ("I have 45 min for this whole test")
