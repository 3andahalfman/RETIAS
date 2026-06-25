// Supabase Edge Function: cancel-subscription
// Disables the caller's current Paystack subscription and marks it canceled.
// Used both for "Cancel" and as the first step of a plan switch (Pro <-> Pro Plus).
//
// Deploy:  supabase functions deploy cancel-subscription --no-verify-jwt
// Secrets: PAYSTACK_SECRET_KEY (already set)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  if (!PAYSTACK_SECRET_KEY) return jsonResponse({ error: 'Paystack not configured' }, 500)

  const authHeader = req.headers.get('Authorization') ?? ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!accessToken) return jsonResponse({ error: 'Unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userErr } = await admin.auth.getUser(accessToken)
  if (userErr || !userData.user) return jsonResponse({ error: 'Unauthorized' }, 401)
  const userId = userData.user.id

  // Look up the user's current subscription
  const { data: sub } = await admin
    .from('subscriptions')
    .select('subscription_code, customer_code, status')
    .eq('user_id', userId)
    .maybeSingle()

  const row = sub as { subscription_code?: string; customer_code?: string } | null
  let subscriptionCode = row?.subscription_code

  // Fallback: resolve from the customer's active subscriptions if the row lacks a code
  if (!subscriptionCode && row?.customer_code) {
    try {
      const cRes = await fetch(`https://api.paystack.co/customer/${encodeURIComponent(row.customer_code)}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      })
      if (cRes.ok) {
        const cBody = await cRes.json()
        const subs = (cBody?.data?.subscriptions ?? []) as Array<{ subscription_code?: string; status?: string }>
        const active = subs.find((s) => s.status === 'active' || s.status === 'non-renewing' || s.status === 'attention')
        subscriptionCode = active?.subscription_code
      }
    } catch { /* ignore */ }
  }

  if (!subscriptionCode) {
    // Nothing live at Paystack — just clear local state so the user isn't stuck
    const now = new Date().toISOString()
    await admin.from('subscriptions').update({ status: 'canceled', updated_at: now }).eq('user_id', userId)
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { is_premium: false, is_premium_plus: false, premium_tier: null, premium_deactivated_at: now },
    })
    return jsonResponse({ success: true, note: 'no live subscription; local state cleared' })
  }

  // Paystack requires the subscription's email_token to disable it
  const fetchRes = await fetch(
    `https://api.paystack.co/subscription/${encodeURIComponent(subscriptionCode)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } },
  )
  if (!fetchRes.ok) return jsonResponse({ error: 'Could not load subscription from Paystack' }, 502)
  const fetchBody = await fetchRes.json()
  const emailToken: string | undefined = fetchBody?.data?.email_token

  if (emailToken) {
    const disableRes = await fetch('https://api.paystack.co/subscription/disable', {
      method: 'POST',
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: subscriptionCode, token: emailToken }),
    })
    if (!disableRes.ok) {
      const b = await disableRes.json().catch(() => ({}))
      return jsonResponse({ error: b.message || 'Paystack could not disable the subscription' }, 502)
    }
  }

  // Mark canceled + clear cached flags
  const now = new Date().toISOString()
  await admin.from('subscriptions').update({ status: 'canceled', updated_at: now }).eq('user_id', userId)
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      is_premium: false,
      is_premium_plus: false,
      premium_tier: null,
      premium_deactivated_at: now,
    },
  })

  return jsonResponse({ success: true })
})
