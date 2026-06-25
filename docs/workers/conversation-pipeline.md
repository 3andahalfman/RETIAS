# Conversation pipeline

| Worker | File | Role |
|---|---|---|
| TranscriptAggregator | `electron/workers/transcript-aggregator.ts` | Collects STT partials/finals into sentences |
| QuestionDetector | `electron/workers/question-detector.ts` | Decides which sentences are real questions |
| ContextBuilder | `electron/workers/context-builder.ts` | Assembles the final LLM prompt with CV + JD + history |

## Inputs

| Event | From | Use |
|---|---|---|
| `stt:partial` | STT | Live "user is still talking" display |
| `stt:final` | STT | Commit a sentence chunk |
| `vad:silence` | VAD | Trigger end-of-sentence boundary |
| `transcript:sentence` | Aggregator | Hands sentences to QuestionDetector |
| `screen:card` | main (multi-screen) | Inject a pseudo-question for screen analyses |

## Outputs

| Event | To | Use |
|---|---|---|
| `transcript:update` | Renderer | Rolling transcript view |
| `transcript:sentence` | Detector | New sentence to consider |
| `question:detected` | Detector → Builder → Renderer | Spawns an answer card |
| `question:update` | Detector → Renderer | Updates last card when the sentence keeps growing |
| `conv:state` | Renderer (Toolbar badges) | Listening / Processing / Generating |
| `context:ready` | LLMWorker | Final prompt ready to send |

## TranscriptAggregator

Concatenates partials per channel, commits a sentence on either:
1. A `stt:final` event ending with `.?!`
2. A `vad:silence` event after sufficient gap

Emits `transcript:sentence` with `{ text, role: 'user' | 'interviewer' }`. Emits `transcript:update` continuously so the renderer can show the rolling buffer.

## QuestionDetector

Heuristics + small LLM call (configurable). Decides whether a sentence is a "real question". Filters out filler ("right?", "yeah", "uh-huh"). Tracks state machine:

```
IDLE → LISTENING_CONTEXT → QUESTION_CANDIDATE → QUESTION_CONFIRMED → ANSWER_IN_PROGRESS → IDLE
```

Emits `conv:state` on each transition so the Toolbar can show the right badge. Also emits `question:update` when the candidate sentence keeps growing.

## ContextBuilder

Reads:
- Session config (resume, JD, company, target role, extra context)
- Recent conversation history (last N QA pairs from the LLM worker)
- The newly detected question text

Calls `electron/lib/context-extractor.ts` once per session (prefetched on Setup → Next click via `prefetch-context` IPC) to summarise the resume + JD into a compact profile string. Builds the final prompt via `electron/lib/prompt-builder.ts`. Emits `context:ready` with the assembled prompt.

## How to extend

- **Change question detection heuristics** — tweak `QuestionDetector.evaluate(...)`.
- **Add a "user just clarified" event** — surface from STT and have the detector restart the candidate buffer.
- **Customise context budget** — change `MAX_HISTORY` constants in builder + LLM worker.
- Pitfall: emitting `question:detected` twice for the same sentence will create duplicate answer cards. Always check `lastEmittedHash` before emitting.

## Open ideas / not yet built

- Speaker diarisation (who said what)
- Detect compound questions ("Tell me about your background AND your weakness")
- Sentiment / pace detection (slow down, you're rambling)
