# Settings

| Attribute | Value |
|---|---|
| **View id** | `settings` |
| **File** | `src/components/Settings.tsx` |
| **Auth gate** | Signed-in (some sub-features gated further) |
| **Wrapped by sidebar?** | No (own root, but renders the sidebar inside via `<Sidebar>` import) |
| **Status** | Live |

## Purpose

Tabbed settings panel for AI model, audio, interview defaults, appearance, account, and (admin only) paraphrase engine.

## Layout & sections

Left nav (`SECTIONS`) + content area. Sections in order:

1. **AI & Model** — model picker (Sonnet 4.6, Opus 4.5 Premium-gated, Haiku 4.5, GPT-4.1 mini), answer style, response language.
2. **Audio** — microphone device picker (`navigator.mediaDevices.enumerateDevices`), system audio enabled, noise suppression.
3. **Interview** — default session type, auto-scroll transcript, font size.
4. **Appearance** — window opacity slider, always-on-top toggle, snap layout shortcut.
5. **Privacy & Security** — Clear all sessions, delete account (mailto support).
6. **Account** — Display name (with save button), email (static), subscription badge (Free / Premium / Premium Plus + upgrade CTA), **Paraphrase engine card (admin only)**, Sign out.
7. **About** — logo, version (`getAppVersion`), copyright.

`loadSettings()` is exported so other components can read defaults. `ALLOWED_MODELS` is the canonical list — anything not in there is migrated to `claude-sonnet-4-6` on load.

## Components used

- `Sidebar` (in own topbar)
- Inline cards and forms

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `localStorage['retias-settings']` | renderer | All app settings (default `DEFAULT_SETTINGS`) |
| `electronAPI.getAppVersion()` | invoke | Version label |
| `electronAPI.updateDisplayName(name)` | invoke | Save display name |
| `electronAPI.clearAllSessions()` | invoke | Privacy delete |
| `electronAPI.setWindowOpacity(opacity)` / `setAlwaysOnTop(value)` / `snapWindow(pos)` | send | Window controls |
| `electronAPI.quillbotLogin()` / `quillbotStatus()` | invoke | Paraphrase engine (admin only) |
| `electronAPI.openExternal(url)` | send | Mailto + privacy links |

## Features

- Per-section nav
- Live device picker for mic
- Window opacity / always-on-top apply immediately (side effects in `update()`)
- Display name save with optimistic UI
- Clear-all-sessions confirm flow
- Subscription badge with click-through to Pricing (`onUpgrade`)
- **Admin only:** Paraphrase Engine card with status badge (Connected / Needs sign-in / Checking…) + "Sign in to QuillBot" button
- Settings migration: stale `aiModel` values not in `ALLOWED_MODELS` are reset to default on load

## Copy (verbatim)

> **Section nav:** AI & Model · Audio · Interview · Appearance · Privacy & Security · Account · About
> **Subscription badges:** Free Plan · Premium Plan · Premium Plus Plan
> **Subscription CTA (free):** Upgrade to Premium
> **Paraphrase card title:** Paraphrase engine
> **Paraphrase card engine name:** QuillBot Premium
> **Paraphrase status:** ✓ Connected · Needs sign-in · Checking…
> **Paraphrase desc:** Solved-Assessment answers are humanised via QuillBot. If unavailable, the app silently falls back to Claude so users still see a unique answer.
> **Paraphrase CTAs:** Sign in to QuillBot · Re-sign in to QuillBot · Refresh status

## How to extend

- **Add a new section** — extend the `SECTIONS` tuple and the conditional render block.
- **Add a new model** — append to the `aiModel` options *and* to `ALLOWED_MODELS`. Otherwise it'll be migrated away on next load.
- **Hot-reload settings across views** — currently relies on view re-mount (`loadSettings()` runs on render). Lift to a context if you need live updates.

## Open ideas / not yet built

- Theme switcher (light / dark / system)
- Hotkey customisation
- Cloud-sync settings across devices
