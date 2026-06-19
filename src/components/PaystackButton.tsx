import { useEffect, useState } from 'react'
import { supabase, SUPABASE_URL_PUBLIC } from '../lib/supabase'

interface Props {
  user: { id: string; email: string }
  onSuccess: () => void
  className?: string
  children: React.ReactNode
}

interface PaystackSetupConfig {
  key: string
  email: string
  plan?: string
  amount?: number
  currency?: string
  ref?: string
  metadata?: unknown
  callback: (response: { reference: string }) => void
  onClose: () => void
}

declare global {
  interface Window {
    PaystackPop?: {
      setup(config: PaystackSetupConfig): { openIframe(): void }
    }
  }
}

const PAYSTACK_SCRIPT_SRC = 'https://js.paystack.co/v1/inline.js'

function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) { resolve(); return }
    const existing = document.querySelector(`script[src="${PAYSTACK_SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Paystack script failed to load')))
      return
    }
    const script = document.createElement('script')
    script.src = PAYSTACK_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Paystack script failed to load'))
    document.head.appendChild(script)
  })
}

export default function PaystackButton({ user, onSuccess, className, children }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadPaystackScript().catch(() => {}) }, [])

  const handleClick = async () => {
    if (loading) return
    setError(null)

    const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined
    const planCode = import.meta.env.VITE_PAYSTACK_PLAN_CODE as string | undefined

    if (!publicKey || !planCode) {
      setError('Payment is not configured. Please contact support.')
      return
    }

    try {
      await loadPaystackScript()
    } catch {
      setError('Could not load payment system. Check your connection.')
      return
    }

    if (!window.PaystackPop) {
      setError('Payment system unavailable.')
      return
    }

    const ref = `ret_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    const handler = window.PaystackPop.setup({
      key: publicKey,
      email: user.email,
      plan: planCode,
      ref,
      metadata: {
        user_id: user.id,
        custom_fields: [
          { display_name: 'User ID', variable_name: 'user_id', value: user.id },
        ],
      },
      callback: (response) => {
        // Paystack callback runs synchronously — fire async work without awaiting
        void verifyAndActivate(response.reference)
      },
      onClose: () => {
        setLoading(false)
      },
    })

    setLoading(true)
    handler.openIframe()
  }

  const verifyAndActivate = async (reference: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token

      const res = await fetch(`${SUPABASE_URL_PUBLIC}/functions/v1/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ reference, user_id: user.id }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Payment verification failed')
      }

      // Refresh session so the new JWT carries app_metadata.is_premium = true
      await supabase.auth.refreshSession().catch(() => {})
      await window.electronAPI?.authRefresh?.().catch(() => {})

      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not activate premium')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={handleClick} disabled={loading}>
        {loading ? 'Processing…' : children}
      </button>
      {error && (
        <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 8 }}>{error}</div>
      )}
    </>
  )
}
