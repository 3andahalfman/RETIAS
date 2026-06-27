# Conventions

Cross-cutting rules every doc inherits.

## Auth gates

| Gate | Where enforced |
|---|---|
| **Public** | Only `LoginPage` |
| **Signed-in** | `App.tsx` short-circuit returns `<LoginPage>` if `user === null` |
| **Premium** | `user.is_premium` checked at the Dashboard card AND at session-start IPC AND inside the LLMWorker |
| **Premium Plus** | `user.is_premium_plus` checked in `OnlineTestEntry` and inside `SolvedTestPage`'s RLS reads |
| **Admin** | `isAdminEmail(user.email)` — `juliaodaramola@gmail.com` only. Used by Sidebar nav, `AdminScreenshotDashboard`, paraphrase login IPC. |

`User` is mapped in `electron/lib/auth-store.ts:mapUser`. `is_premium` is `true` if **either** `is_premium` **or** `is_premium_plus` is set in `app_metadata` — Premium Plus implies Premium.

## Subscription tiers

`subscriptions.tier`:
- `null` → free
- `'pro'` → Premium
- `'plus'` → Premium Plus

The desktop reads from `app_metadata` (cached on JWT) for instant UI gates. The web edge functions (`verify-payment`, `paystack-webhook`) write both the `subscriptions` row *and* `app_metadata`.

After payment, the user must **sign out and back in** OR the desktop must call `auth:refresh` to pick up the new claims. App.tsx already calls `auth:refresh` on window focus.

## Free-tier interview cap

Free users get **10 minutes per Real or Mock interview session**. Implemented in `Toolbar.tsx` (`countdownSec` prop). At 0:00 the toolbar calls `onStopSession`. Online Assessment is unaffected.

## IPC channels (window.electronAPI)

Conventions:
- `send` for fire-and-forget (renderer → main); name uses `:` separator.
- `invoke` for request/response; name uses `:` separator.
- Listeners (`on*`) use `ipcRenderer.on` and are wrapped so multiple registrations don't pile up. Always call `removeAllListeners` before re-registering during dev HMR.

### Current channels (registered in `electron/main.ts` + exposed in `electron/preload.ts`)

| Channel | Direction | Purpose |
|---|---|---|
| `session:start` | send | Spin up workers with a `SessionConfig` |
| `session:stop` | send | Tear down workers |
| `audio:chunk` | send | PCM chunk to ring buffer |
| `screen:capture` | invoke | One screenshot, returns base64 PNG (primary display only) |
| `screen:analyse-multi` | invoke | Sends N captures to LLM for batched analysis |
| `llm:manual-prompt` | invoke | User-typed prompt to LLM |
| `llm:token` / `llm:done` | on | Streaming answer events |
| `question:detected` / `question:update` | on | Detector signals |
| `conv:state` | on | Listening / Processing / Generating |
| `transcript:update` | on | Live transcript text |
| `copy-answer`, `window:*`, `auth:*`, `cv:*` | mix | See preload.ts for the full list |
| `paraphrase:generate-variants` / `paraphrase:personalize` | invoke | Solved Assessment paraphrase pipeline |
| `paraphrase:quillbot-login` / `paraphrase:quillbot-status` | invoke | Admin QuillBot login |
| `admin:list-screenshots` / `admin:get-screenshot-url` | invoke | Admin Screenshot Library (Electron path; falls back to direct Supabase) |

When you add a new IPC: register in `main.ts`, expose in `preload.ts`, type in `src/electron.d.ts`, and update the table above.

## Env vars

Loaded from `.env` at build time via `scripts/generate-env.cjs` into `electron/_env_generated.ts`. The renderer reads `VITE_*` directly from `import.meta.env`.

| Var | Used by |
|---|---|
| `ANTHROPIC_API_KEY` | LLMWorker, screenshot scoring, Claude fallback paraphrase |
| `OPENAI_API_KEY` | LLMWorker (optional, used when `aiModel` starts with `gpt-`) |
| `DEEPGRAM_API_KEY` | STTWorker |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | LoginPage Google OAuth |
| `SUPABASE_URL` + `SUPABASE_ANON_KEY` | Main + renderer Supabase clients (hardcoded fallback exists) |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Renderer Supabase client |
| `VITE_PAYSTACK_PUBLIC_KEY` + `VITE_PAYSTACK_PLAN_CODE` | PaystackButton |
| `NODE_ENV` | Toggles dev URL vs packaged file load |

Never commit a real `.env`. `.env.example` is the template.

## Design tokens

CSS variables in `src/index.css` (search "amphibian" / "Amphibian palette" comment for the source block). Key tokens used everywhere:

- `--bg-card`, `--bg-primary`, `--surface`
- `--border`
- `--text-primary`, `--text-secondary`, `--text-muted`
- `--blue` and the brand gradient `linear-gradient(135deg,#3b82f6,#2563eb)`

## CSS class naming

Each view has its own root class so styles are scoped without CSS modules:
- `.dash-root`, `.setup-root`, `.online-test-root` (note: avoid this one when nesting inside sidebar — see view docs)
- `.solved-test-*`
- `.settings-*`
- `.admin-screens-*`

Shared atoms use `.toolbar-*`, `.sidebar-*`, `.snap-grid-*`, etc.

## "Online Test" vs "Online Assessment"

User-facing copy uses **Online Assessment** everywhere. Internal IDs / DB `session_type` are `online-test` / `online_test`. Do not change those.

## Premium-gated copy patterns

When a feature is premium-gated, surface the lock state consistently:
- Lock icon: 🔒
- Tooltip text: `🔒 Premium — upgrade to unlock` (or `Premium Plus — ...`)
- Either disable the button or open the pricing view on click — never silently no-op.

## Window controls

Every full-page view that lives outside the sidebar shell (`setup-root` family) places its own window controls (snap / dock / close) in a `.setup-inner-topbar` block. Sidebar-wrapped views rely on the Dashboard chrome or the docked logo for window controls — they don't need their own.

## Shared components

| Component | Notes |
|---|---|
| `Sidebar` | Left nav for sidebar-wrapped views. Hides upgrade card for premium users. Surfaces Screenshot Library item only for admin. |
| `Toolbar` | Live-session toolbar. Owns the elapsed/countdown timer + model badge. |
| `Tutorial` | First-run tutorial. Skipped after `retias_tutorial_seen` is set in localStorage. |
| `UpdateBanner` | Auto-updater hook. Shows at the bottom of Dashboard. |
| `PaystackButton` | Renderer-side Paystack inline checkout for the upgrade flow. |

## Update protocol

When you change any of these, also update this file:
- A new IPC channel
- A new env var
- A new design token
- A new shared component pattern
