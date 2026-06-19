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

async function setPremium(
  admin: ReturnType<typeof createClient>,
  userId: string,
  isPremium: boolean,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      is_premium: isPremium,
      ...extra,
    },
  })
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
    case 'charge.success': {
      await setPremium(admin, userId, true, {
        paystack_customer_code: customer.customer_code ?? null,
        paystack_subscription_code: subscriptionCode || null,
        premium_activated_at: new Date().toISOString(),
      })
      break
    }
    case 'subscription.create': {
      await setPremium(admin, userId, true, {
        paystack_customer_code: customer.customer_code ?? null,
        paystack_subscription_code: subscriptionCode || null,
      })
      break
    }
    case 'subscription.disable':
    case 'subscription.expiring_cards': {
      if (eventType === 'subscription.disable') {
        await setPremium(admin, userId, false, {
          premium_deactivated_at: new Date().toISOString(),
        })
      }
      break
    }
    default:
      // Unhandled event — acknowledge anyway
      break
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
