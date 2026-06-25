# Paraphrase / humanize

| Files | Purpose |
|---|---|
| `electron/lib/quillbot-paraphrase.ts` | Hidden BrowserWindow + selector-driven automation against quillbot.com/paraphrasing-tool |
| `electron/lib/paraphrase.ts` | High-level orchestrator: QuillBot first, Claude fallback |
| `src/components/AdminScreenshotDashboard.tsx` | Admin Send-to-Solved modal — `paraphrase_enabled` checkbox |
| `src/components/AnswerTextareaWithRewrite.tsx` | Solved Assessment answer field + highlight menu |
| `src/components/SolvedTestPage.tsx` | Solved Assessment browser |
| `src/components/Settings.tsx` | Admin-only Paraphrase engine card (status + login button) |
| Supabase tables | `solved_questions.paraphrase_enabled` + legacy `answer_variants` / `solved_answer_user_cache` |

## Strategy

Admin-controlled, selection-based rewrite:

1. **At admin import** — checkbox *Allow users to paraphrase / humanize this answer* sets `solved_questions.paraphrase_enabled`.
2. **At user view** — answer renders in an editable textarea. If `paraphrase_enabled`, highlighting text opens a QuillBot-style floating menu with **Paraphrase** (Standard mode) and **Humanize** (Humanize/natural mode). Only the selected snippet is sent to QuillBot (Claude fallback).

## Why hidden BrowserWindow

QuillBot has no public API. Their ToS prohibits scraping. We use Electron's own BrowserWindow (real Chrome, real cookies, real fingerprint) so traffic looks like a normal Premium user. Each desktop install runs from its own IP. Cookies persist via `session.defaultSession` — sign in once, paraphrase forever.

## QuillBot module surface

| Export | Purpose |
|---|---|
| `paraphrase(text, mode)` | Single chunk paraphrase. Throws `QuillbotError` on failure. |
| `paraphraseLong(text, mode)` | Splits on code fences + LaTeX (passes through) + paragraphs + sentences, chunks ≤ 500 words, joins. |
| `paraphraseAllModes(text)` | Sequentially runs all 5 modes, returns array of `{ mode, text }`. |
| `openLoginWindow()` | Opens the visible window for admin login. Cookies persist. |
| `checkSignedIn()` | Probes the user-avatar selector. |
| `QUILLBOT_MODES` | Readonly tuple of mode names. |
| `QUILLBOT_SELECTORS` | Single constants object in `quillbot-paraphrase.ts` — UPDATE WHEN QUILLBOT CHANGES THEIR DOM. Key ids: `pphr/input_footer/paraphrase_button`, `pphr/header/modes/*`, `editable-content-within-article`. |

## Selectors

Central in `QUILLBOT_SELECTORS`. Each field has 2–4 candidate selectors; the runtime tries each in order. When QuillBot changes their UI:

1. Open Settings → Account → "Sign in to QuillBot" (this opens the visible window).
2. Right-click any element you need → Inspect.
3. Find the most stable selector (prefer `data-testid`).
4. Update the constant.

## Failure → Claude fallback

`electron/lib/paraphrase.ts:rewriteOnce` wraps every QuillBot call in `try/catch(QuillbotError)`. On any failure (selector missing, captcha, network, output never stabilised) it logs `[paraphrase] QuillBot failed (kind) — falling back to Claude` and calls `rewriteWithClaude(text, voice)` with the equivalent voice for the requested mode (`MODE_TO_CLAUDE_VOICE`).

`generateBaseVariants(answer)`:
1. Tries `paraphraseAllModes(answer)` for all 5 variants in one window session
2. On partial success, fills remaining variants with Claude
3. On total failure, generates all 5 with Claude (one per voice)

The user never sees an error — the bank gets populated regardless of QuillBot health.

## IPC surface (from preload.ts)

| Channel | Purpose |
|---|---|
| `paraphrase:selection` | Solved Assessment highlight menu; `{ text, mode: 'paraphrase' \| 'humanize' }` → rewritten snippet |
| `paraphrase:generate-variants` | Legacy bulk import (optional) |
| `paraphrase:personalize` | Legacy auto-personalize on view (optional) |
| `paraphrase:quillbot-login` | Admin-only; opens the visible login window |
| `paraphrase:quillbot-status` | Probes signed-in state for the Settings badge |

## Storage

```sql
ALTER TABLE solved_questions
  ADD COLUMN IF NOT EXISTS answer_variants TEXT[] DEFAULT '{}';

CREATE TABLE solved_answer_user_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   UUID NOT NULL REFERENCES solved_questions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  variant_text  TEXT NOT NULL,
  base_variant_idx INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);
```

RLS: users SELECT/INSERT their own row; admin SELECT all (for debugging).

## How to extend

- **Lift the chunk size** — `MAX_WORDS_PER_CHUNK` constant in quillbot-paraphrase.ts (500 by default, fits Premium).
- **Add a "Try a different humanization" UI button** — bypass the cache once by deleting the row before calling personalize.
- **Swap engine entirely** — implement a new module with the same surface (`generateBaseVariants` + `personaliseForUser`) and import it in `paraphrase.ts`. The renderer never needs to know.
- Pitfall: the visible login window MUST be closed before any paraphrase call runs (paraphrase throws if `visible === true`).

## Open ideas / not yet built

- Per-platform fine-tuning of the paraphrase voice
- Quality scoring of variants (auto-discard ones that diverge too far from the original)
- Live preview in admin Send-to-Solved modal of all 5 variants before submit
