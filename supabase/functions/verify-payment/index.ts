// Supabase Edge Function: verify-payment
// Verifies a Paystack transaction reference and activates premium for the user.
//
// Deploy:  supabase functions deploy verify-payment --no-verify-jwt
// Secrets: supabase secrets set PAYSTACK_SECRET_KEY=sk_live_or_test_xxx
//
// Required env (Supabase auto-injects SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
//   PAYSTACK_SECRET_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// Plan codes for tier mapping (set via `supabase secrets set`). Plus → premium_plus.
const PLAN_PLUS = Deno.env.get('PAYSTACK_PLAN_PLUS') ?? ''

// Monthly subscription → period ends one month from now (renewals extend it).
function oneMonthFromNow(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

// The inline transaction verify doesn't reliably return the subscription_code,
// so resolve it from the customer's subscriptions (matching the plan just bought).
async function resolveSubscriptionCode(customerCode: string, planCode?: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://api.paystack.co/customer/${encodeURIComponent(customerCode)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    })
    if (!res.ok) return undefined
    const body = await res.json()
    const subs = (body?.data?.subscriptions ?? []) as Array<{ subscription_code?: string; status?: string; plan?: { plan_code?: string } }>
    const match = subs.find((s) => s.plan?.plan_code === planCode && (s.status === 'active' || s.status === 'non-renewing' || s.status === 'attention'))
      ?? subs[subs.length - 1]
    return match?.subscription_code
  } catch { return undefined }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!PAYSTACK_SECRET_KEY) {
    return jsonResponse({ error: 'Paystack not configured' }, 500)
  }

  let body: { reference?: string; user_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const reference = body.reference?.trim()
  if (!reference) return jsonResponse({ error: 'Missing reference' }, 400)

  // Identify the user — prefer JWT claim, fall back to user_id in body
  const authHeader = req.headers.get('Authorization') ?? ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let userId: string | null = null
  let userEmail: string | null = null

  if (accessToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken)
    if (!error && data.user) {
      userId = data.user.id
      userEmail = data.user.email ?? null
    }
  }

  if (!userId && body.user_id) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(body.user_id)
    if (!error && data.user) {
      userId = data.user.id
      userEmail = data.user.email ?? null
    }
  }

  if (!userId) return jsonResponse({ error: 'Unauthorized' }, 401)

  // Verify the transaction with Paystack
  const verifyRes = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
  )

  if (!verifyRes.ok) {
    return jsonResponse({ error: 'Paystack verification request failed' }, 502)
  }

  const verifyBody = await verifyRes.json()
  const tx = verifyBody?.data
  if (!tx || tx.status !== 'success') {
    return jsonResponse({ error: 'Payment not successful', status: tx?.status }, 400)
  }

  // Optional: ensure the paid email matches the user's email (prevents reference reuse)
  if (userEmail && tx.customer?.email && tx.customer.email.toLowerCase() !== userEmail.toLowerCase()) {
    return jsonResponse({ error: 'Payment email mismatch' }, 403)
  }

  // Determine tier from the plan code on the transaction
  const planCode: string | undefined = tx.plan_object?.plan_code ?? (typeof tx.plan === 'string' ? tx.plan : undefined)
  const tier: 'pro' | 'plus' = planCode && PLAN_PLUS && planCode === PLAN_PLUS ? 'plus' : 'pro'
  const customerCode: string | undefined = tx.customer?.customer_code
  let subscriptionCode: string | undefined = tx.plan_object?.subscription_code ?? tx.subscription?.subscription_code
  if (!subscriptionCode && customerCode) {
    subscriptionCode = await resolveSubscriptionCode(customerCode, planCode)
  }
  const periodEnd = oneMonthFromNow()

  // 1. Source of truth: subscriptions table (one row per user)
  const { error: subError } = await supabaseAdmin.from('subscriptions').upsert({
    user_id: userId,
    provider: 'paystack',
    customer_code: customerCode ?? null,
    subscription_code: subscriptionCode ?? null,
    plan_code: planCode ?? null,
    tier,
    status: 'active',
    current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (subError) {
    return jsonResponse({ error: `Activation failed: ${subError.message}` }, 500)
  }

  // 2. Cached flags on app_metadata (read by the desktop + web apps)
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      is_premium: true,
      is_premium_plus: tier === 'plus',
      paystack_customer_code: customerCode ?? null,
      paystack_subscription_code: subscriptionCode ?? null,
      premium_tier: tier,
      premium_activated_at: new Date().toISOString(),
    },
  })

  if (updateError) {
    return jsonResponse({ error: `Activation failed: ${updateError.message}` }, 500)
  }

  return jsonResponse({
    success: true,
    is_premium: true,
    is_premium_plus: tier === 'plus',
    tier,
    reference,
  })
})
