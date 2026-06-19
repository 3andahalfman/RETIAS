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

  // Activate premium on the user's app_metadata
  const subscriptionCode: string | undefined = tx.plan_object?.subscription_code ?? tx.subscription?.subscription_code
  const customerCode: string | undefined = tx.customer?.customer_code

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      is_premium: true,
      paystack_customer_code: customerCode ?? null,
      paystack_subscription_code: subscriptionCode ?? null,
      premium_activated_at: new Date().toISOString(),
    },
  })

  if (updateError) {
    return jsonResponse({ error: `Activation failed: ${updateError.message}` }, 500)
  }

  return jsonResponse({
    success: true,
    is_premium: true,
    reference,
  })
})
