# Real Interview setup (SetupWizard)

| Attribute | Value |
|---|---|
| **View id** | `setup` |
| **File** | `src/components/SetupWizard.tsx` |
| **Auth gate** | Signed-in |
| **Wrapped by sidebar?** | Yes |
| **Status** | Live |

## Purpose

Two-step wizard that gathers Company / Role / Job Description / Resume / language / model / extra context before starting a Real Interview session. Outputs a `SessionConfig` that's handed to `App.tsx.handleCreateSession`.

## Layout & sections

1. **Inner topbar** — breadcrumb "← Back to Dashboard" + snap/dock/close window controls.
2. **Step 1** — Company, Target Role, Job URL (auto-scraped), Job Description (paste or scraped result), Resume picker (file or saved CV).
3. **Step 2** — Language, Simple Language toggle, AI Model picker (Sonnet 4.6, Opus 4.5 — Premium-gated, Haiku 4.5), Extra Context (long textarea with prefilled anti-AI-buzzword guidelines), Auto-generate toggle.
4. **Footer CTAs** — Back / Next / Start Session.

`aiModel` defaults to `loadSettings().aiModel || 'claude-sonnet-4-6'`. Opus 4.5 option is disabled with a "🔒 Premium" suffix when `!user.is_premium`. `App.tsx.handleCreateSession` also downgrades Opus 4.5 → Sonnet 4.6 server-side for free users.

## Components used

- `Sidebar`
- Inline `ValidationModal` for missing-field errors.

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `electronAPI.scrapeJobUrl(url)` | invoke | Server-side scrape (`/api/scrape-job-url`-style flow in main process) returns JD + company |
| `electronAPI.extractResumeText(buffer, filename)` | invoke | PDF/DOCX → plain text |
| `electronAPI.prefetchContext({...})` | invoke | Warms profile + JD extraction caches before "Start" is pressed |
| `electronAPI.generateMockJD(resumeText)` | invoke | Not used here — see Mock Interview setup |
| Renderer `loadSettings()` | localStorage | Defaults for `aiModel` |

## Features

- Two-step form with validation
- Job URL scrape → fills Company + JD automatically
- Resume picker: upload OR pick from saved CVs (passed via `cvs` prop)
- Language picker + "Simple language" toggle for non-native speakers
- AI model picker with Premium gating for Opus 4.5
- Prefetch on Next: warms context extraction so first answer is faster
- "Extra context" auto-prefilled with anti-AI-buzzword guidelines (DEFAULT_EXTRA_CONTEXT constant)

## Copy (verbatim)

> **Breadcrumb:** ← Back to Dashboard
> **Step 1 fields:** Company · Target Role · Job URL · Job Description · 📄 Resume
> **Step 2 fields:** 🌐 Response Language · ✓ Simple Language · 🤖 AI Model · 📌 Extra Context · ⚙ Auto-generate
> **Model labels:**
> - Claude Sonnet 4.6 — Recommended
> - Claude Opus 4.5 — Top reasoning (premium gated)
> - Claude Haiku 4.5 — Fast
> **Footer:** ← Back · Next → · 🎤 Start Session

## How to extend

- **Add a new model** — append to the `<select>` options AND to the display branches above; also register in `Settings.tsx` ALLOWED_MODELS list.
- **Add another step** — extend the `step` state type and the footer button logic.
- **Change DEFAULT_EXTRA_CONTEXT** — the constant is at the top of the file.
- Pitfall: SetupWizard exports its own `SessionConfig` interface that other components (MockInterviewSetup) import. If you add a field, update both consumers.

## Open ideas / not yet built

- Save/load preset configs ("My usual setup")
- Calendar integration for "next interview on Tuesday at 2 pm"
