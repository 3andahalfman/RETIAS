// Supabase Edge Function: paystack-webhook
// Handles subscription renewals + cancellations from Paystack.
//
// Deploy:  supabase functions deploy paystack-webhook --no-verify-jwt
// Secrets: supabase secrets set PAYSTACK_SECRET_KEY=sk_xxx
//
// Configure the webhook URL in your Paystack Dashboard → Settings → API Keys & Webhooks:
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook
//
// Events handled:
//   charge.success           → activate premium (covers first charge + renewals)
//   subscription.disable     → deactivate premium
//   subscription.not_renew   → leave active until period ends; webhook fires again on disable
//   invoice.payment_failed   → leave active, optional notify

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { createHmac } from 'node:crypto'

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PLAN_PLUS = Deno.env.get('PAYSTACK_PLAN_PLUS') ?? ''

function oneMonthFromNow(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

function verifySignature(rawBody: string, signature: string): boolean {
  if (!signature || !PAYSTACK_SECRET_KEY) return false
  const computed = createHmac('sha512', PAYSTACK_SECRET_KEY).update(rawBody).digest('hex')
  return computed === signature
}

async function findUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  // listUsers is paginated — scan up to a reasonable number of pages
  const lowerEmail = email.toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data) return null
    const match = data.users.find((u) => u.email?.toLowerCase() === lowerEmail)
    if (match) return match.id
    if (data.users.length < 200) return null
  }
  return null
}

// Activate (or renew) a paid subscription: write the subscriptions row (source of
// truth) + cached flags on app_metadata.
async function activate(
  admin: ReturnType<typeof createClient>,
  userId: string,
  opts: { tier: 'pro' | 'plus'; planCode?: string; subscriptionCode?: string; customerCode?: string },
): Promise<void> {
  const now = new Date().toISOString()
  await admin.from('subscriptions').upsert({
    user_id: userId,
    provider: 'paystack',
    customer_code: opts.customerCode ?? null,
    subscription_code: opts.subscriptionCode ?? null,
    plan_code: opts.planCode ?? null,
    tier: opts.tier,
    status: 'active',
    current_period_end: oneMonthFromNow(),
    updated_at: now,
  }, { onConflict: 'user_id' })

  await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      is_premium: true,
      is_premium_plus: opts.tier === 'plus',
      premium_tier: opts.tier,
      paystack_customer_code: opts.customerCode ?? null,
      paystack_subscription_code: opts.subscriptionCode ?? null,
      premium_activated_at: now,
    },
  })
}

// Mark the subscription with a new status and, when it ends access, clear flags.
async function setStatus(
  admin: ReturnType<typeof createClient>,
  userId: string,
  status: 'past_due' | 'canceled',
): Promise<void> {
  const now = new Date().toISOString()
  await admin.from('subscriptions').update({ status, updated_at: now }).eq('user_id', userId)
  if (status === 'canceled') {
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        is_premium: false,
        is_premium_plus: false,
        premium_tier: null,
        premium_deactivated_at: now,
      },
    })
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-paystack-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    return new Response('Invalid signature', { status: 401 })
  }

  let event: { event?: string; data?: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }

  const eventType = event.event ?? ''
  const data = event.data ?? {}

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Extract email + identifiers from the event payload
  const customer = (data.customer as { email?: string; customer_code?: string } | undefined) ?? {}
  const email = customer.email ?? ''
  const metadata = (data.metadata as { user_id?: string; custom_fields?: Array<{ variable_name?: string; value?: string }> } | undefined) ?? {}
  const subscriptionCode = (data.subscription_code as string | undefined)
    ?? (data.plan as { subscription_code?: string } | undefined)?.subscription_code
    ?? ''
  const planCode = (data.plan as { plan_code?: string } | undefined)?.plan_code
    ?? (typeof data.plan === 'string' ? (data.plan as string) : undefined)
    ?? ''
  const tier: 'pro' | 'plus' = planCode && PLAN_PLUS && planCode === PLAN_PLUS ? 'plus' : 'pro'

  // Prefer user_id from metadata if available (set by frontend on first checkout)
  let userId: string | null = metadata.user_id ?? null
  if (!userId && metadata.custom_fields) {
    const field = metadata.custom_fields.find((f) => f.variable_name === 'user_id')
    if (field?.value) userId = field.value
  }
  if (!userId && email) {
    userId = await findUserIdByEmail(admin, email)
  }

  if (!userId) {
    // No matching user — acknowledge so Paystack doesn't keep retrying
    return new Response(JSON.stringify({ ok: true, note: 'user not found' }), { status: 200 })
  }

  switch (eventType) {
    // First charge + monthly renewals → activate/extend
    case 'charge.success':
    case 'subscription.create': {
      await activate(admin, userId, {
        tier,
        planCode: planCode || undefined,
        subscriptionCode: subscriptionCode || undefined,
        customerCode: customer.customer_code,
      })
      break
    }
    // Card failed on renewal → mark past_due but keep access until it disables
    case 'invoice.payment_failed': {
      await setStatus(admin, userId, 'past_due')
      break
    }
    // Subscription ended/cancelled → revoke access
    case 'subscription.disable': {
      await setStatus(admin, userId, 'canceled')
      break
    }
    default:
      // Unhandled event (subscription.not_renew, expiring_cards, etc.) — acknowledge
      break
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
