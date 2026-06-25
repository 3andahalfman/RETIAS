# Screenshot Library (admin)

| Attribute | Value |
|---|---|
| **View id** | `admin-screenshots` |
| **File** | `src/components/AdminScreenshotDashboard.tsx` |
| **Auth gate** | Admin only (`isAdminEmail(user.email)`) |
| **Wrapped by sidebar?** | Yes |
| **Status** | Live |

## Purpose

Admin-only review and curation tool for the `online_test_captures` table. Lets the admin browse what users captured, inspect scores + extracted questions, delete bad rows, and promote captures into the curated Solved Assessment library.

## Layout & sections

Three-level browse:

1. **Users grid** (default) — one card per uploader: email, capture count, avg score.
2. **Captures list** for the selected user — each row shows detected test type + platform, score, source URL, with 📤 Send to Solved and 🗑 Delete actions.
3. **Capture detail** — scores (Accuracy / Completeness / Overall), score_notes, extracted questions, AI answer, source URL. Includes Send + Delete buttons at the bottom.

Plus a **Send-to-Solved modal** that the admin uses to push a capture into `solved_questions`. The modal triggers `paraphraseGenerateVariants` (QuillBot first, Claude fallback) before insert.

## Components used

Self-contained.

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `electronAPI.adminListScreenshots(offset, limit)` | invoke | Captures + stats from main process (Electron path) |
| `supabase.from('online_test_captures').select('*')` | renderer | Browser fallback when Electron API isn't there |
| `supabase.storage.from('online-test-screenshots').remove(paths)` | renderer | Delete storage objects |
| `supabase.from('online_test_captures').delete().in('id', ids)` | renderer | Delete rows |
| `electronAPI.paraphraseGenerateVariants(answer)` | invoke | Generates 5 humanized base variants per question |
| `supabase.from('solved_questions').insert(rows)` | renderer | Bulk insert |
| `syncSupabaseSession()` | renderer | Pulls auth JWT for RLS-respecting writes |

## Features

- Three-level browse (Users → Captures → Detail)
- Metrics row: total captures, avg score, unique users
- Refresh button at the top level
- Per-capture quick actions (Send / Delete) at the row level
- Detail view actions (Send / Delete)
- "Send to Solved Assessment bank" modal:
  - Pre-fills Platform + Assessment Type from detected fields
  - Splits questions on blank lines (one DB row per question)
  - Calls QuillBot paraphrase for 5 base variants per question; falls back to Claude
  - Shows progress + success / error inline

## Copy (verbatim)

> **Title:** Screenshot Library
> **Sub:** Scored online test captures from all users — admin only.
> **Metrics labels:** Total Captures · Avg Score · Users
> **Empty state:** No captures yet. They appear when users run Online Assessment and click Analyse All.

> **Modal title:** Send to Solved Assessment bank
> **Modal hint:** Each blank-line-separated question becomes its own row. The same answer is attached to all of them.
> **Modal labels:** Platform · Assessment Type · Questions (blank line between each) · Answer
> **Progress:** Generating humanized variants…
> **Success format:** Added N question(s) to the Solved Assessment bank with M base variants each.

## How to extend

- **Add a filter/search at the users level** — input at the top that filters by email substring.
- **Bulk Send / Delete** — multi-select state + IPC mirroring the existing methods.
- **Override scores** — let admin tweak score_* fields before sending to Solved.
- **Different paraphrase engine** — swap inside `electron/lib/paraphrase.ts`; this view does not need to change.

## Open ideas / not yet built

- Auto-suggest Platform from `source_url` (e.g. `outlier.ai` → "Outlier")
- "Promote to featured" toggle so Solve Assessment can highlight curated items
- Charts: captures per day, avg score per platform
