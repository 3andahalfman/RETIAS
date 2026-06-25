# {{ View name or Feature }}

| Attribute | Value |
|---|---|
| **View id** (App.tsx) | `dashboard` / `setup` / … |
| **File** | `src/components/...tsx` (and `electron/...` if relevant) |
| **Auth gate** | Public / Signed-in / Premium / Premium+ / Admin |
| **Wrapped by sidebar?** | Yes / No (full-page mode) |
| **Status** | Live / WIP / Deprecated |

## Purpose

One or two sentences. Why does this view exist?

## Layout & sections (top to bottom)

1. Section — purpose, key copy, data
2. …

## Components used

- `Toolbar`, `Sidebar`, etc., with file paths

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `window.electronAPI.something` | renderer → main | … |
| `from('table')` | renderer → Supabase | RLS gating |

## Features

- Plain-English list of what the view can do today.

## Copy (verbatim)

> ...

## How to extend

- …
- Pitfalls:

## Open ideas / not yet built

- …
