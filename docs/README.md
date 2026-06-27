# RETIAS Desktop — Documentation

This folder is the **source of truth** for the RETIAS Windows desktop app. Read the relevant doc *before* editing a view, worker, or feature; update it *after* your change lands. Docs that drift from code are worse than no docs — keep them honest.

## How to use these docs

| When you… | Do this |
|---|---|
| Build a new feature in a view | Open the view doc → check Data sources / IPC → make the change → update *Features* and *Copy* |
| Touch a worker | Read [`_architecture.md`](./_architecture.md) first, then the specific worker doc. Workers are tightly chained — surprise side effects are common. |
| Add a new IPC channel | Update [`_conventions.md`](./_conventions.md) and the relevant view doc |
| Add a new view (state machine entry) | Copy `_template.md`, register the new `View` in `src/App.tsx`, add to index below |
| Change the auth flow | See [`features/auth.md`](./features/auth.md) and the related view docs |

## Start here

- [`_architecture.md`](./_architecture.md) — processes, IPC bus, worker pipeline, view state machine. **Read this first.**
- [`_conventions.md`](./_conventions.md) — design tokens, IPC patterns, gating, env vars.
- [`_template.md`](./_template.md) — copy for new docs.

## Views (state machine in `src/App.tsx`)

| # | Doc | View id | File |
|---|---|---|---|
| 00 | [Login](./views/00-login.md) | (gate) | `src/components/LoginPage.tsx` |
| 01 | [Dashboard](./views/01-dashboard.md) | `dashboard` | `src/components/Dashboard.tsx` |
| 02 | [Real Interview setup](./views/02-setup-real-interview.md) | `setup` | `src/components/SetupWizard.tsx` |
| 03 | [Mock Interview setup](./views/03-setup-mock-interview.md) | `mock-interview` | `src/components/MockInterviewSetup.tsx` |
| 04 | [Online Assessment — entry choice](./views/04-online-assessment-entry.md) | `online-test-entry` | `src/components/OnlineTestEntry.tsx` |
| 05 | [Online Assessment — setup](./views/05-online-assessment-setup.md) | `online-test` | `src/components/OnlineTestSetup.tsx` |
| 06 | [Solve Assessment](./views/06-solve-assessment.md) | `solve-test` | `src/components/SolvedTestPage.tsx` |
| 07 | [Live session](./views/07-live-session.md) | `session` | `Toolbar` + `Transcript` + `AnswerPanel` + `ManualPromptBar` |
| 08 | [Past sessions](./views/08-past-sessions.md) | `past-sessions` | `src/components/PastSessions.tsx` |
| 09 | [CV Manager](./views/09-cv-manager.md) | `cv-manager` | `src/components/CvManager.tsx` |
| 10 | [Settings](./views/10-settings.md) | `settings` | `src/components/Settings.tsx` |
| 11 | [Screenshot Library (admin)](./views/11-admin-screenshot-library.md) | `admin-screenshots` | `src/components/AdminScreenshotDashboard.tsx` |
| 12 | [Pricing](./views/12-pricing.md) | `pricing` | `src/components/PricingPage.tsx` |

## Worker pipelines (Electron main process)

| Doc | Files |
|---|---|
| [Audio capture pipeline](./workers/audio-pipeline.md) | `electron/workers/{vad,stt}-worker.ts` + `electron/audio-ring-buffer.ts` + `src/components/AudioCapture.tsx` |
| [Conversation pipeline](./workers/conversation-pipeline.md) | `electron/workers/{transcript-aggregator,question-detector,context-builder}.ts` |
| [LLM worker](./workers/llm.md) | `electron/workers/llm-worker.ts` |
| [Session recorder](./workers/session-recorder.md) | `electron/workers/session-recorder.ts` |

## Cross-cutting features

| Doc | Covers |
|---|---|
| [Auth](./features/auth.md) | Supabase email + Google OAuth, IPC, JWT refresh |
| [Paraphrase](./features/paraphrase.md) | QuillBot hidden BrowserWindow + Claude fallback |
| [Screenshot capture & scoring](./features/screenshot-capture.md) | Primary-display capture, Online Assessment, scoring, Solved Assessment bank |
| [Paystack + auto-updater](./features/paystack-and-updater.md) | Subscription flow + electron-updater |

## Update protocol

1. Edit code.
2. Open the corresponding doc(s).
3. Update *Layout & sections*, *Features*, *Copy*, *Data sources/IPC* — whichever moved.
4. If you added a new IPC channel: register it in [`_conventions.md`](./_conventions.md).
5. If you added a new view: also register in [`_architecture.md`](./_architecture.md) state-machine list and in `App.tsx` view-type union.
6. **If the feature should appear on the website:** add a row to [`RETIAS-Web/docs/FEATURE_REGISTRY.md`](../RETIAS-Web/docs/FEATURE_REGISTRY.md) and update landing/pricing when ready.
