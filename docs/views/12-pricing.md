# Pricing

| Attribute | Value |
|---|---|
| **View id** | `pricing` |
| **File** | `src/components/PricingPage.tsx` |
| **Auth gate** | Signed-in |
| **Wrapped by sidebar?** | Yes |
| **Status** | Live |

## Purpose

In-app upgrade screen. Mirrors the web pricing cards (Free / Premium / Premium Plus) and lets the user start the Paystack inline checkout without leaving the desktop app.

## Layout & sections

1. **Topbar** — breadcrumb / back navigation + window controls.
2. **Heading** — "Simple pricing" + sub.
3. **Three plan cards** — Free / Premium / Premium Plus. Feature bullets per tier. Each premium card has a Paystack CTA via `PaystackButton`.
4. **Trust line** — "Secure payments by Paystack · Cancel anytime".

## Components used

- `Sidebar` (left)
- `PaystackButton` (`src/components/PaystackButton.tsx`) — wraps Paystack inline checkout and triggers `verify-payment` edge function

## Data sources & IPC

| Source | Direction | Purpose |
|---|---|---|
| `VITE_PAYSTACK_PUBLIC_KEY`, `VITE_PAYSTACK_PLAN_CODE` (Pro), `VITE_PAYSTACK_PLAN_PLUS` (Plus) | env | Paystack config |
| `supabase.functions.invoke('verify-payment', { reference })` | renderer → edge fn | Activates premium after successful Paystack callback |
| `electronAPI.authRefresh()` | invoke | Pulls fresh JWT with new claims after activation |

## Features

- Three plan cards aligned with the web app
- Inline Paystack checkout (no leaving the app)
- Auto-refresh JWT after successful payment so premium gates unlock without sign-out
- Free users see "Current plan", premium users see "✓ Your current plan"

## Copy (verbatim)

> **Heading:** Simple pricing
> **Sub:** Start free. Upgrade when you're ready.
> **Trust:** Secure payments by Paystack · Cancel anytime

Feature bullets mirror the web `PlanCards` arrays — see `RETIAS-Web/docs/02-pricing.md`. Keep both in sync.

## How to extend

- **Add an annual toggle** — duplicate the plan code env vars and surface a switch above the cards.
- **Show usage caps for the free tier** — e.g. "X of 10 minutes used this session".

## Open ideas / not yet built

- USD pricing for international users
- Annual discount
- Team / multi-seat
