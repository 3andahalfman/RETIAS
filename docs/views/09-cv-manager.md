# CV Manager

| Attribute | Value |
|---|---|
| **View id** | `cv-manager` |
| **File** | `src/components/CvManager.tsx` |
| **Auth gate** | Signed-in |
| **Wrapped by sidebar?** | Yes |
| **Status** | Live |

## Purpose

Manage uploaded resumes. Add (drag-drop or file picker), preview, set as base, delete. Same `cvs` table the web app reads from.

## Layout & sections

1. **Topbar** — title + count.
2. **Upload region** — drag-drop or file picker; supports `.pdf`, `.docx`, `.txt`.
3. **CV list** — for each CV: name, created date, character count, star (set base) and delete actions.
4. **Preview modal** — text preview when clicked.

## Components used

Self-contained.

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `electronAPI.listCvs()` | invoke | All user CVs |
| `electronAPI.saveCv(name, content)` | invoke | Insert |
| `electronAPI.deleteCv(cvId)` | invoke | Delete |
| `electronAPI.extractResumeText(buffer, filename)` | invoke | PDF/DOCX → text before save |

Base CV id is stored in `user_metadata.base_cv_id` and read by SetupWizard / MockInterviewSetup.

## Features

- Upload PDF/DOCX/TXT
- Preview text
- Set / unset base CV (used by Setup screens as the default resume)
- Delete with browser confirm
- Free users limited to 3 CVs (advertised on pricing)

## Copy (verbatim)

> **Empty state:** No CVs uploaded yet.
> **Upload hint:** Drop a PDF, DOCX or TXT here

## How to extend

- **Inline rename** — add a small Edit (✏) action.
- **Lift free-tier cap to a hard block** at upload time — currently advertised but not enforced.
- **Server-side text extraction for the web counterpart** — see `RETIAS-Web/docs/06-dashboard-cvs.md` Open Ideas section.

## Open ideas / not yet built

- Inline markdown editor for the CV text
- "Base CV per role category" (separate fields for engineering vs design)
