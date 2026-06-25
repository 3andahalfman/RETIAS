# Online Assessment — entry choice

| Attribute | Value |
|---|---|
| **View id** | `online-test-entry` |
| **File** | `src/components/OnlineTestEntry.tsx` |
| **Auth gate** | Signed-in (Premium for "Start New", Premium Plus for "Solved Assessment") |
| **Wrapped by sidebar?** | Yes |
| **Status** | Live |

## Purpose

Branching screen the Online Assessment Dashboard card lands on. Lets the user choose between **Solved Assessment** (read curated, humanized Q&A — Premium Plus) and **Start New Online Assessment** (live screenshot-driven session — Premium).

## Layout & sections

1. **Topbar** — breadcrumb "← Back to Dashboard" + window controls.
2. **Header** — "🧪 Online Assessment & Onboarding" + "Pick how you want to study or run a test."
3. **Two cards**:
   - **📚 Solved Assessment** — gated to `user.is_premium_plus`. Locked card shows `🔒 Premium Plus` badge.
   - **💻 Start New Online Assessment** — always selectable.

## Components used

Self-contained.

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `electronAPI.snapWindow / dockWindow / closeWindow` | send | Window chrome |

`user.is_premium_plus` is the only gate.

## Features

- Two-card branch
- Premium Plus gate for the Solved Assessment side, with locked badge + disabled click
- Standard Online Assessment side opens the next screen for everyone signed-in (further premium gating happens at session start in `App.tsx.handleCreateOnlineTest`)

## Copy (verbatim)

> **Header:** 🧪 Online Assessment & Onboarding
> **Sub:** Pick how you want to study or run a test.

> **Solved card label:** Solved Assessment
> **Solved card desc:** Browse curated questions and answers by platform and assessment type — already solved by our AI.
> **Solved locked badge:** 🔒 Premium Plus

> **Live card label:** Start New Online Assessment
> **Live card desc:** Run a live session where the AI analyses your test screenshots in real time and helps you answer.

## How to extend

- **Show a third option** (e.g. "Browse past captures") — add a third card to the grid; widen the grid `gridTemplateColumns`.
- **Different gate for Solved** — replace `canViewSolved = user.is_premium_plus` with whatever new rule.

## Open ideas / not yet built

- Quick-search bar above the two cards to jump directly into a question
