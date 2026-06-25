# Solve Assessment

| Attribute | Value |
|---|---|
| **View id** | `solve-test` |
| **File** | `src/components/SolvedTestPage.tsx` |
| **Auth gate** | Premium Plus |
| **Wrapped by sidebar?** | Yes |
| **Status** | Live |

## Purpose

Browse the curated Q&A library that admins build from screenshot captures. Each user sees a **uniquely paraphrased version** of every answer so two candidates never see the same wording.

## Layout & sections

Three navigation levels with breadcrumb back navigation:

1. **Platforms** — grid of platform cards (e.g. Outlier, HackerRank, Codility). Each card shows # assessments and # questions. Click to drill in.
2. **Assessment types** — for the selected platform, grid of assessment-type cards (e.g. "Aether Onboarding", "Skill: Python"). Click to drill in.
3. **Question viewer** — one Q&A at a time with **Previous / Next** pager (top + bottom), search bar at the top, "humanizing your version…" indicator while the first personalize call resolves.

Always-visible topbar with the appropriate "← {Back}" breadcrumb plus window controls.

## Components used

Self-contained.

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `supabase.from('solved_questions').select('*')` (renderer) | renderer | List all questions; RLS allows Premium Plus + admin |
| `syncSupabaseSession()` (`src/lib/supabase.ts`) | renderer | Pulls the JWT from main process so RLS works |
| `electronAPI.paraphrasePersonalize({ questionId, variants, fallbackAnswer })` | invoke | Returns the user-specific humanized answer; cached server-side in `solved_answer_user_cache` |

The personalize IPC returns a cached row if one exists for this user+question; otherwise it picks a base variant deterministically (`hash(userId+questionId) % variants.length`), paraphrases it once more, caches, and returns.

## Features

- Three-level browse (Platforms → Assessment types → Questions)
- Single-question viewer with Prev / Next at top and bottom of the card
- Search bar that filters within the selected assessment; index resets to first match
- Per-user humanized answer with in-memory + server cache
- Live "humanizing your version…" pulse indicator on first view

## Copy (verbatim)

> **Top-level title:** 📚 Solved Assessment
> **Top-level sub:** Pick a platform to browse curated assessments.
> **Mid-level title:** {platform}
> **Mid-level sub:** Pick an assessment type.
> **Bottom-level title:** {platform} · {assessment}
> **Bottom-level sub:** Question N of M

> **Pager:** ← Previous · N / M · Next →
> **Search placeholder:** Search questions or answers…
> **Empty (no rows at all):** No solved questions yet. The admin transfers them from the Screenshot Library.
> **No matches:** No questions match.
> **Humanizing:** humanizing your version…
> **Labels:** Question · Answer

## How to extend

- **Add favourites** — new table `solved_answer_favourites(user_id, question_id)` + a star icon on the question card.
- **Add "Mark as solved"** — track progress per user with a separate table.
- **Show all variants side-by-side** (admin-only debug) — fetch `answer_variants` array and render all 5 in tabs.

## Open ideas / not yet built

- Inline "Try a different humanization" button that bypasses the cache once
- Per-question discussion thread
- "Practice mode" with timer per question
