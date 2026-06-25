# Past Sessions

| Attribute | Value |
|---|---|
| **View id** | `past-sessions` |
| **File** | `src/components/PastSessions.tsx` |
| **Auth gate** | Signed-in |
| **Wrapped by sidebar?** | Yes |
| **Status** | Live |

## Purpose

Review every recorded session: filter by type, search company / role, drill in for transcript + AI Q&A pairs.

## Layout & sections

1. **Topbar** — title + count + "+ New Session" link to `setup`.
2. **Search input** — filters company + target_role.
3. **Type tabs** — All / Interview / Mock / Online Assessment (internal id `online-test` / `online_test`).
4. **List** — `getPastSessions` rows. Each row links to a detail view (currently inline expand-on-click rather than a separate route).
5. **Empty / loading states.**

## Components used

Self-contained.

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `electronAPI.getPastSessions()` | invoke | Returns `PastSession[]` (id, company, role, started_at, ended_at, qa_count) |
| `electronAPI.getSessionDetail(sessionId)` | invoke | QA + transcript for the expanded session |
| `electronAPI.deleteSession(sessionId)` | invoke | Soft / hard delete depending on schema |

## Features

- Search + tab filter
- Per-session expand for QA and transcript
- Delete a session

## Copy (verbatim)

> **Header:** Past Sessions
> **CTA:** + New Session
> **Tabs:** All · Interview · Mock · Online Assessment
> **Empty:** No sessions yet.
> **Type label mapping:**
> - mock → Mock
> - online-test / online_test → Online Assessment
> - everything else → Interview

## How to extend

- **Add a per-session export** (PDF / Markdown of QA) — append a button in the row; call a new `electronAPI.exportSession(id)` IPC.
- **Add bulk delete** — multi-select state + IPC.

## Open ideas / not yet built

- Detail in a dedicated view (`view = 'session-detail'`) instead of inline expand
- Charts of weekly activity
- Tag / category filters
