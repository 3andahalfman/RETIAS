import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://ygvqhvqplgljrksquwsr.supabase.co'

const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_rafX5pp47TrxLp7Nu4DnyQ_1JDoX_5h'

export const SUPABASE_URL_PUBLIC = SUPABASE_URL

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// In Electron the auth session lives in the main process. Hydrate the
// renderer's client on demand so direct DB writes carry the user's JWT and
// don't trip RLS policies that key off the email or app_metadata claims.
let sessionSyncPromise: Promise<void> | null = null

export function invalidateSupabaseSessionSync(): void {
  sessionSyncPromise = null
}

export function syncSupabaseSession(force = false): Promise<void> {
  if (force) sessionSyncPromise = null
  if (!sessionSyncPromise) {
    sessionSyncPromise = (async () => {
      try {
        const tokens = await window.electronAPI?.authGetSession?.()
        if (!tokens) {
          sessionSyncPromise = null
          return
        }
        const { error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        })
        if (error) sessionSyncPromise = null
      } catch {
        sessionSyncPromise = null
      }
    })()
  }
  return sessionSyncPromise
}
