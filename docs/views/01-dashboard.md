# Dashboard

| Attribute | Value |
|---|---|
| **View id** | `dashboard` |
| **File** | `src/components/Dashboard.tsx` |
| **Auth gate** | Signed-in |
| **Wrapped by sidebar?** | Yes |
| **Status** | Live |

## Purpose

Home screen after sign-in. Greets the user, shows headline metrics, surfaces three Start-a-Session cards (Real / Mock / Online Assessment), and lists Recent Sessions.

## Layout & sections

1. **Hero greeting** — "Welcome, {firstName} 👋" (`firstName` from display name → email local-part → "there").
2. **Metrics row** — Total Sessions, This Week, CVs Saved (from `getDashboardMetrics` IPC).
3. **Start a Session cards** — three cards:
   - Real Interview (`onNewSession` → setup wizard)
   - Mock Interview (`onMockInterview` → `mock-interview` view)
   - Online Assessment (`onOnlineTest` → `online-test-entry` view; locked unless `user.is_premium`)
4. **Recent Sessions list** — most recent N items, "View all →" link to `past-sessions`.
5. **Update banner** at the bottom (`UpdateBanner` component).
6. **Window controls** — snap / dock / close.

## Components used

- `Sidebar` (left)
- `UpdateBanner` (bottom of page)
- Inline session cards

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `electronAPI.getDashboardMetrics()` | invoke | Returns `{ totalSessions, totalQAs, avgDurationMins, topCompany, recentSessions }` |
| `electronAPI.listCvs()` | invoke (via App.tsx) | Drives "CVs Saved" stat |
| `electronAPI.snapWindow / dockWindow / closeWindow` | send | Window chrome |

## Features

- Greeting + 3-card metric overview
- Three entry points to a new session (Real / Mock / Online Assessment)
- Online Assessment card locked with 🔒 for free users; tooltip "Premium — upgrade to unlock"
- Recent Sessions preview
- Auto-update banner

## Copy (verbatim)

> **Greeting:** Welcome, {firstName} 👋
> **Sub:** Ready for your next interview? Let's get started.

### Session cards

| Title | Description | CTA |
|---|---|---|
| Real Interview | Use AI to analyse your answers in real-time as the interviewer speaks. | Start Real Interview |
| Mock Interview | Practice with a YouTube mock interviewer — AI coaches you live | ▷ Start Mock |
| Online Test (display: Online Assessment) | Solve coding challenges and assessments with real-time AI help | `<>` Start Test |

> **Lock tooltip:** 🔒 Premium — upgrade to unlock

## How to extend

- **Add a 4th metric card** — extend `getDashboardMetrics` payload + UI row.
- **Switch the Online Assessment lock for an upgrade modal** instead of a disabled card — wire the click to `setView('pricing')` when not premium.
- **Live data refresh** — currently loads once on mount; add a focus listener to re-fetch metrics.

## Open ideas / not yet built

- Streak / "X interviews this week" counter
- Quick-start widget for resuming the last interview config
- Inline "Schedule next session" reminder
