# Session recorder

| File | Role |
|---|---|
| `electron/workers/session-recorder.ts` | Persists session metadata, transcript lines, and Q&A pairs to Supabase as they happen. |

## Inputs

| Event | Payload |
|---|---|
| `session:started` | `SessionConfig` |
| `transcript:update` | Rolling text (only writes the deltas it hasn't seen) |
| `question:detected` | `{ question, type }` |
| `llm:done` | Last token stream complete — pairs the latest question with the accumulated answer |
| `session:stopped` | Close out the session row (sets `ended_at`) |

## Outputs

Writes to Supabase tables only. No further IPC events.

## Tables it touches

| Table | Operation |
|---|---|
| `past_sessions` | INSERT on `session:started`; UPDATE `ended_at` on `session:stopped` |
| `session_transcript` | INSERT one row per committed transcript line (`role`, `text`, `timestamp`) |
| `session_qa` | INSERT one row per (question, type, answer, timestamp) |

All inserts go through the renderer-issued JWT (passed by IpcBus at session start) so RLS is enforced row-by-row.

## Failure handling

Inserts are fire-and-forget. Errors are logged but don't interrupt the session. If a transcript or QA row fails to persist, the live UI is unaffected; users may notice gaps in the Past Sessions detail view.

## How to extend

- **Add a new persisted column** — extend `past_sessions` schema + add it to the INSERT payload + extend the `getPastSessions` IPC.
- **Add session "tagging" mid-flight** — accept a new IPC `session:tag` and write to a join table.
- Pitfall: don't move the auth session into the renderer Supabase client — the recorder runs in main process and uses the main process client.

## Open ideas / not yet built

- Aggregate session statistics on stop (e.g. avg answer length)
- Live "save snapshot" button that persists the current state to a separate journal
