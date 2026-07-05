# Paystack + auto-updater

Two unrelated cross-cutting concerns kept together because they're both about lifecycle: paid subscriptions and app self-update.

---

## Paystack subscription flow

| Files | Purpose |
|---|---|
| `src/components/PaystackButton.tsx` | Renderer — Paystack inline popup |
| `src/components/PricingPage.tsx` | Uses PaystackButton for upgrade CTAs |
| `supabase/functions/verify-payment/index.ts` | Edge fn — server-side Paystack verification, writes `app_metadata` + `subscriptions` row |
| `supabase/functions/paystack-webhook/index.ts` | Edge fn — handles `charge.success`, `subscription.disable`, etc. |
| Tables | `subscriptions` (source of truth), `subscription_events` (tier change audit log), `app_metadata.is_premium*` (cached on JWT) |

### Flow

1. User clicks Upgrade in Pricing → `PaystackButton` opens Paystack inline
2. Paystack returns a `reference` on success
3. Renderer calls `verify-payment` edge function with `{ reference, user_id }`
4. Edge function:
   - Calls Paystack `transaction/verify/{reference}` server-side
   - Verifies status === `success` and email matches the user
   - Determines tier from plan code (`pro` or `plus`)
   - Upserts `subscriptions` row
   - Updates `auth.users.app_metadata` with `is_premium`, `is_premium_plus`, `paystack_*`
5. Renderer calls `electronAPI.authRefresh()` which re-fetches the session so the JWT picks up the new claims
6. Premium / Premium Plus features unlock immediately

### Webhook (server-of-record)

`paystack-webhook` handles renewals + cancellations:

| Event | Action |
|---|---|
| `charge.success` | `activate(...)` — extend `current_period_end` to +1 month |
| `subscription.create` | Same as above |
| `invoice.payment_failed` | Mark `status = 'past_due'` (keep access until subscription.disable) |
| `subscription.disable` | Mark `status = 'canceled'`, clear `app_metadata.is_premium*` |

Signature verified via HMAC-SHA512 against `PAYSTACK_SECRET_KEY`. Always returns 200 to avoid Paystack retries even when we can't find the user.

### Env vars (edge fn secrets)

```bash
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_or_test_xxx
supabase secrets set PAYSTACK_PLAN_PLUS=PLN_xxx  # plan code that maps to Premium Plus
```

`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are auto-injected.

### Renderer env (compiled into desktop bundle)

```
VITE_PAYSTACK_PUBLIC_KEY=pk_xxx
VITE_PAYSTACK_PLAN_CODE=PLN_xxx       # Premium
VITE_PAYSTACK_PLAN_PLUS=PLN_xxx       # Premium Plus
```

### Edge-case behaviour

- Email mismatch (someone pays from a different email) → 403, premium not activated. Reference is logged.
- Paystack API failure → 502; client can retry.
- User clicks the same upgrade twice → idempotent via subscription upsert + signed reference.

---

## Auto-updater (electron-updater)

| Files | Purpose |
|---|---|
| `electron/main.ts` (updater hooks) | Initialises `electron-updater`, wires events to renderer |
| `src/components/UpdateBanner.tsx` | Renderer — bottom banner with "Update available / Downloading / Restart to install" states |
| `scripts/publish-win.js` | Runs `electron-builder --publish always` to push installer + release notes to GitHub Releases |

### How publishing works

```bash
npm run publish:win
```

1. `scripts/generate-env.cjs` bakes runtime secrets into `electron/_env_generated.ts`
2. Vite builds the renderer; tsc compiles main
3. `electron-builder` packages the Windows installer and uploads it to GitHub Releases under the configured repo (`3andahalfman/RETIAS`)

The user's installed app polls GitHub Releases for a newer version on launch.

### How users get updated

1. On launch, main process calls `autoUpdater.checkForUpdates()`
2. If newer version exists, emits `update:available` → renderer shows the banner
3. User clicks Download → main calls `autoUpdater.downloadUpdate()` → emits `update:progress` (percent) → banner shows progress
4. On `update:downloaded` → banner switches to "Restart to install" → click calls `autoUpdater.quitAndInstall()`

### Code signing

Configured via env (see `.env.example`):

- `CSC_LINK` (path to .pfx) + `CSC_KEY_PASSWORD` — standard Authenticode
- OR `WIN_CSC_LINK` for hardware tokens
- OR Azure Trusted Signing via separate env block (custom sign hook needed)

Without signing, Windows SmartScreen warns users on download. With signing, the warning disappears after enough installs build reputation.

### Bumping the version

Edit `package.json`'s `version` field. electron-builder uses it to generate `latest.yml` for the updater feed.

---

## How to extend

- **Add Apple silicon / mac auto-update** — already configured in `electron-builder` block; add `package:mac` to the CI workflow.
- **Annual billing** — duplicate the Paystack plan codes, surface a toggle in Pricing.
- **Coupon support** — extend the `PaystackCheckout` props to accept a promo code, pass via Paystack `metadata`.
- **Update channel selector** — beta / stable. Configure `electron-updater` channel in main + UI toggle.

## Open ideas / not yet built

- Email receipts via Resend on `charge.success` (currently relies on Paystack's emails)
- "What's new" modal that triggers after `update:downloaded` restart
- Per-OS download targets in PricingPage download CTA
