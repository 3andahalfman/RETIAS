# Auth

| Files | Purpose |
|---|---|
| `electron/lib/supabase.ts` | Main process Supabase client with encrypted file storage |
| `electron/lib/auth-store.ts` | User mapping, email + Google sign-in, profile reservation |
| `electron/lib/google-oauth.ts` | Desktop PKCE OAuth flow |
| `src/lib/supabase.ts` | Renderer Supabase client + `syncSupabaseSession()` |
| `src/components/LoginPage.tsx` | UI |

## Storage

Main process stores the Supabase session in `userData/sb-session.enc`, encrypted with `safeStorage`. A legacy `sb-session.json` migration runs once on first load (`migrateLegacySession`). The renderer talks to its own client and lazily syncs the JWT from main via the `auth:get-session` IPC.

## User shape

```ts
interface User {
  id: string
  email: string
  display_name: string
  google_id: string | null
  created_at: number
  is_premium: boolean        // true if is_premium OR is_premium_plus on app_metadata
  is_premium_plus: boolean
}
```

Mapping happens in `auth-store.ts:mapUser`. `is_premium` is `true` whenever Premium *or* Premium Plus is set so feature checks short-circuit cleanly.

## Sign-in flows

### Email + password

`authLogin(email, password)` → `supabase.auth.signInWithPassword`. Errors are surfaced via friendly translations in `LoginPage`.

### Email registration

`authRegister(email, password, displayName)`:
1. Validates password strength (≥8, uppercase, number)
2. Checks display-name availability via `profiles` table
3. Calls `supabase.auth.signUp` with `display_name` in `user_metadata`
4. Inserts into `profiles` (best-effort — auth user creation is the source of truth)

### Google OAuth (desktop PKCE)

`authGoogle()`:
1. `google-oauth.ts` generates verifier + challenge, opens system browser to consent screen
2. Local HTTP server listens on `127.0.0.1:<random>` for the callback with `code`
3. Exchanges `code` + `code_verifier` for tokens
4. Decodes `id_token` to extract email + googleId + name
5. `findOrCreateGoogleUser(googleId, email, displayName)` — tries sign in with derived password (`retias_google_${googleId}`), creates account if needed

Feature-flagged by `authGoogleAvailable()` — `true` only if `GOOGLE_CLIENT_ID` is set in the build env.

## Session restore

App.tsx on boot reads `localStorage['retias_user_id']`. If present, calls `authRestore(userId)`:
- `electron/lib/auth-store.ts:getUserById` requires both an active Supabase session AND that the `userId` matches the session's user
- Returns the mapped `User` or `null` if anything is stale

If `null`, App.tsx clears `retias_user_id` and falls to the `<LoginPage>` branch.

## Renderer ↔ main session sync

The main process Supabase client owns the active session (encrypted at rest). The renderer's Supabase client starts anonymous. Whenever the renderer needs to write to Supabase (Solved Assessment paraphrase cache, send-to-Solved insert, screenshot deletes, etc.), it first calls `syncSupabaseSession()` which:

1. Invokes `auth:get-session` IPC → returns `{ access_token, refresh_token }` from main
2. Calls `supabase.auth.setSession(...)` on the renderer client
3. Caches the promise so concurrent callers share the same hydration round-trip

This avoids RLS surprises like "row level security policy" rejections on inserts.

## Logout

`authLogout()` clears the main process session and removes `retias_user_id` from localStorage. App.tsx returns to the login screen.

## Refresh

`authRefresh()`:
- Calls `supabase.auth.refreshSession()` in main
- Re-runs `getUserById` so the renderer sees fresh `app_metadata`

App.tsx adds a `focus` event listener that fires `authRefresh()` whenever the window regains focus. This means: a user can upgrade in the browser, switch back to the desktop, and their `is_premium` lights up without manual sign-out.

## RLS gotchas

- The main process Supabase client uses the **anon key**. RLS still applies — main's writes succeed because the JWT is attached when a user signs in.
- The renderer's Supabase client is **anonymous** by default. You MUST call `syncSupabaseSession()` before any write or RLS-gated read.

## How to extend

- **Add a new OAuth provider** — duplicate `google-oauth.ts` for the new provider, expose via `auth:provider-name` IPC.
- **Magic-link sign-in** — call `supabase.auth.signInWithOtp({ email })`; needs a custom URL handler so the callback opens the desktop app.
- **Account deletion** — call `supabase.auth.admin.deleteUser(userId)` from a privileged edge function (the desktop has no service role key).
