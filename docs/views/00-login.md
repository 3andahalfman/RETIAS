# Login

| Attribute | Value |
|---|---|
| **View id** | (auth gate — renders before any view) |
| **File** | `src/components/LoginPage.tsx` |
| **Auth gate** | Public |
| **Wrapped by sidebar?** | No — own root |
| **Status** | Live |

## Purpose

Entry point when there's no saved user. Handles sign-in, sign-up (with unique display-name reservation + password strength), and Google OAuth via the desktop PKCE flow.

## Layout & sections

1. **Hero left panel** — RETIAS branding + value-prop blurb.
2. **Card right panel** with tab switcher (Sign In / Create Account).
3. **Form fields** — Display name (sign-up only), Email, Password, Confirm Password (sign-up only).
4. **Live validation** — display-name availability via IPC `authCheckUsername`; password strength checklist; passwords-match indicator.
5. **Inline error banner** for friendly Supabase error translation.
6. **Continue with Google** — only if `authGoogleAvailable()` returned true (means `GOOGLE_CLIENT_ID` is set in build).
7. **Window controls** (snap / dock / close) in the top-right of the page.

## Components used

Self-contained. No shared components.

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `electronAPI.authCheckUsername(name)` | invoke | Debounced display-name availability |
| `electronAPI.authRegister(email, password, displayName)` | invoke | Creates the auth user + profiles row |
| `electronAPI.authLogin(email, password)` | invoke | Email sign-in |
| `electronAPI.authGoogle()` | invoke | Opens system browser for Google OAuth (PKCE), returns User |
| `electronAPI.authGoogleAvailable()` | invoke | Feature-flags the Google button |
| `electronAPI.snapWindow / dockWindow / closeWindow` | send | Window chrome |

After success, `App.tsx`'s `handleLogin` saves `retias_user_id` in localStorage and sets `view = 'dashboard'`.

## Features

- Email/password sign in
- Account creation with reserved unique display name
- Google sign-in (system browser PKCE flow)
- Password strength checklist + show/hide toggle
- Friendly error translation
- Snap / Dock / Close window controls

## Copy (verbatim)

> **Heading:** RETIAS
> **Subhead:** Real Time Interview Assistant
> **Tabs:** Sign In · Create Account
> **Strength rules:** At least 8 characters · One uppercase letter (A–Z) · One number (0–9)
> **Live name labels:** ⋯ Checking availability… / ✓ Name is available / ✗ Name is already taken
> **Submit labels:** Sign In · Create Account
> **Google CTA:** Continue with Google

## How to extend

- **Add a third OAuth provider** — add a button under Google; call a new `authProvider(name)` IPC mirroring `authGoogle`.
- **Add "Forgot password"** — implement an email-reset endpoint (Supabase has `resetPasswordForEmail`) and add a link below the Sign In submit.

## Open ideas / not yet built

- Magic-link sign-in
- Sign-in throttling UI feedback (we already translate the error text but don't show a countdown)
