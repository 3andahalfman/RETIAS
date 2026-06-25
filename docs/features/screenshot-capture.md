# Screenshot capture & Online Assessment

| Files | Purpose |
|---|---|
| `electron/main.ts` (`screen:capture`, `screen:analyse-multi`) | Captures via `desktopCapturer`, primary-display lock, multi-screen analysis routing |
| `electron/lib/screenshot-store.ts` | Uploads PNGs to Supabase storage, scores via Claude, inserts into `online_test_captures` |
| `electron/workers/llm-worker.ts` | Multi-screen LLM call that drives the answer + scoring callback |
| `src/components/AnswerPanel.tsx` | Renderer: capture button, queue UI, Analyse All |
| `src/components/AdminScreenshotDashboard.tsx` | Admin review tool |

## Primary-display lock

When the user has multiple monitors, only the **primary display** is captured. The code calls `screen.getPrimaryDisplay()`, then finds the matching `desktopCapturer` source by `display_id`. Falls back to `sources[0]` if no match. This lets users keep the AI panel on a secondary monitor — capture stays clean.

Three places enforce this:
1. Initial cache at app startup (`createOverlayWindow` ready hook)
2. `screen:capture` IPC handler
3. `setDisplayMediaRequestHandler` (for system audio loopback)

## Online Assessment capture flow

1. User starts an Online Assessment session.
2. Mic is auto-muted (`setMicActive(false)`), `isStarted = true`, `isOnlineTest = true`.
3. Each click of the camera icon in `AnswerPanel` calls `electronAPI.captureScreen()` → base64 PNG → pushed into `captureQueue` (cap 5).
4. User clicks "Analyse All" — `electronAPI.analyseScreens(images)` fires `screen:analyse-multi` IPC.
5. `LLMWorker` runs a vision call with all images as content blocks. Streams `llm:token` to the renderer.
6. On `llm:done`, the worker dynamically imports `screenshot-store.ts` and calls `storeOnlineTestCapture({ images, aiAnswer, ... })` — fully async, doesn't block the stream.

## screenshot-store.ts

```ts
storeOnlineTestCapture({ userId, userEmail, sessionId, testType, images, aiAnswer })
```

Concurrently:
- Uploads each PNG to `online-test-screenshots` storage bucket at `userId/captureId/N.png`
- Calls `scoreCapture(images, aiAnswer, testType)` — Claude vision call that returns `{ accuracy, completeness, overall, notes, questions, detected_test_type, detected_platform, source_url }`

Then inserts one row into `online_test_captures` with all the metadata. If no screenshots upload successfully, the row is skipped to avoid orphaned scores.

## Scoring prompt

The scoring call extracts five things in one round-trip:
1. Source URL (from any address bar / window title visible)
2. Detected platform (canonical brand name: HackerRank, Codility, Outlier, etc.)
3. Extracted questions (preserving numbering, MCQ options, code blocks)
4. Detected test type (coding / mcq / behavioural / etc.)
5. Scores: accuracy / completeness / overall / one-sentence notes

Returns plain JSON. The store parses and clamps numeric scores to 0–100.

## Solved Assessment promotion

The admin Screenshot Library lets admins push a capture into the curated `solved_questions` table. The flow:

1. Admin opens the modal, edits Platform / Assessment Type / Questions / Answer
2. On Send, the renderer first calls `paraphraseGenerateVariants(answer)` (QuillBot + Claude — see [paraphrase docs](./paraphrase.md))
3. Splits questions on blank lines, inserts one `solved_questions` row per question with the variants attached
4. Premium Plus users see these in Solve Assessment with per-user humanization

## Schema

```sql
CREATE TABLE online_test_captures (
  id, user_id, user_email, session_id,
  test_type, screenshot_paths, screenshot_count,
  ai_answer,
  score_accuracy, score_completeness, score_overall, score_notes,
  extracted_questions, detected_test_type, detected_platform, source_url,
  created_at
);
```

RLS: users INSERT their own; admin SELECT/DELETE all. Storage policy mirrors this.

## How to extend

- **Lift the 5-image cap** — bump `captureQueue.length >= 5` check in `App.tsx.handleCapture`.
- **Capture from a secondary monitor on purpose** — add a per-session opt-in flag and use a different display lookup in the IPC handler.
- **Better OCR before LLM** — pre-process images locally (tesseract.js) and inject text into the prompt to reduce vision token cost.
- Pitfall: never store the screenshot bytes in DB; always go through the storage bucket.

## Open ideas / not yet built

- Click-to-redact regions of a screenshot before sending to LLM
- "Replay" view that scrolls through the captures + answer side-by-side
- Auto-detect a test timer in the screenshot and surface time-pressure cues to the user
