# LLM worker

| File | Role |
|---|---|
| `electron/workers/llm-worker.ts` | Single answer-streaming worker. Handles real-time interview answers, manual prompts, and multi-screenshot analysis. |

## Inputs (IPC events)

| Event | Payload |
|---|---|
| `context:ready` | Final prompt from ContextBuilder |
| `llm:manual-prompt` | Free-text prompt typed by the user |
| `screen:analyse-multi` | Array of base64 screenshots (Online Assessment) |
| `answer:regenerate` | Re-run the last completed answer with a fresh call |
| `session:started` | Sets active model from `config.aiModel` |
| `session:stopped` | Resets state |

## Outputs

| Event | Payload | Purpose |
|---|---|---|
| `llm:token` | string | Stream a token to the renderer |
| `llm:done` | — | Stream complete; SessionRecorder persists; ScreenshotStore writes if Online Assessment |
| `question:update` | (q, type) | Compound question continuation feedback |

## Model selection

- `activeModel` defaults to `DEFAULT_MODEL = 'claude-sonnet-4-6'`
- Overridden on `session:started` if `config.aiModel` is set
- Routing: `isOpenAIModel(model)` → OpenAI SDK; otherwise Anthropic SDK
- All multi-screenshot calls use vision-capable models — the worker passes images as base64 content blocks

## Cache

`AnswerCache` (sql.js) at `electron/lib/cache.ts` stores question → answer pairs keyed by SHA-256 of the normalized question text. On cache hit the worker emits tokens instantly (~100ms) without an API call. Used for Real and Mock interview flows. Bypassed for screen analysis.

## Online Assessment write-back

After a successful multi-screen analysis:
1. Worker appends to in-memory `conversationHistory` (cap MAX_HISTORY)
2. If `sessionTestType && sessionUserId && sessionUserEmail` are set, dynamically imports `screenshot-store.ts` and calls `storeOnlineTestCapture({ images, aiAnswer })` — uploads screenshots, scores them, inserts into `online_test_captures`.

The `screenshot-store` call uses Supabase via the renderer-issued JWT (passed at session start). On failure, errors are logged but the user-visible stream is not affected.

## How to extend

- **Add a new prompt path** — define a new IPC event (e.g. `llm:summarise-session`) and a method on `LLMWorker` that builds the prompt and calls the same streaming helper.
- **Add a new model family** — extend `isOpenAIModel` or add a new check; route to the appropriate SDK.
- **Per-question style controls** — accept extra fields on `context:ready` (`answerStyle`, `tone`) and weave into the system prompt via `prompt-builder.ts`.
- Pitfall: never block the stream waiting on a side effect (cache, recorder, etc.). Spawn them with `.then(...)` and let the stream finish first.

## Open ideas / not yet built

- Speculative streaming for the next likely question
- Tool use (calculator, code-runner) when the question demands it
- Per-session prompt cache, separate from answer cache
