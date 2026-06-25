# Mock Interview setup

| Attribute | Value |
|---|---|
| **View id** | `mock-interview` |
| **File** | `src/components/MockInterviewSetup.tsx` |
| **Auth gate** | Signed-in |
| **Wrapped by sidebar?** | Yes |
| **Status** | Live |

## Purpose

Lightweight setup for a practice run with a YouTube-style simulated interviewer. Generates a synthetic Job Description from the user's resume so the AI can pose realistic questions without the user typing anything.

## Layout & sections

1. **Topbar** — breadcrumb "← Back to Dashboard" + window controls.
2. **Resume picker** — upload OR choose a saved CV.
3. **Generated JD preview** — appears after `generateMockJD` returns; editable textarea.
4. **Footer** — Back · Start Mock Session.

## Components used

- `Sidebar`

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `electronAPI.extractResumeText(buffer, filename)` | invoke | If user uploads a file |
| `electronAPI.generateMockJD(resumeText)` | invoke | Anthropic call that fabricates a realistic JD aligned with the resume |
| `cvs` prop | renderer | Saved CV list to pick from |

`aiModel` defaults to `loadSettings().aiModel || 'claude-sonnet-4-6'` and is included in the emitted `SessionConfig`.

## Features

- Pick a resume (upload or saved CV)
- Auto-generate a Job Description from the resume (one click)
- Inline edit the JD before starting
- Premium gating for Opus 4.5 applied at App.tsx (the wizard itself does not check)
- Company label is hard-coded to "🎭 Mock Interview" so past sessions are easy to filter

## Copy (verbatim)

> **Breadcrumb:** ← Back to Dashboard
> **Generated JD heading:** Suggested Job Description (you can edit)
> **CTA:** ▶ Start Mock Session

## How to extend

- **Add a difficulty toggle** — pass through to `generateMockJD` so the prompt can target Junior / Mid / Senior questions.
- **Add a question count cap** — currently mock interviews end when the user clicks End Session. Could auto-end after N detected questions.

## Open ideas / not yet built

- Predefined company packs (FAANG mock / startup mock / consulting case)
- Tone of voice picker (friendly / aggressive / structured)
