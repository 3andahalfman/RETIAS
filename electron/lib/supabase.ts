import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let tokenPath: string | null = null

function getTokenPath(): string {
  if (!tokenPath) {
    tokenPath = path.join(app.getPath('userData'), 'sb-session.json')
  }
  return tokenPath
}

// File-based auth storage for Electron main process (no localStorage)
const fileStorage = {
  getItem(key: string): string | null {
    try {
      const data = JSON.parse(fs.readFileSync(getTokenPath(), 'utf-8'))
      return data[key] ?? null
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    let data: Record<string, string> = {}
    try { data = JSON.parse(fs.readFileSync(getTokenPath(), 'utf-8')) } catch {}
    data[key] = value
    fs.writeFileSync(getTokenPath(), JSON.stringify(data), 'utf-8')
  },
  removeItem(key: string): void {
    let data: Record<string, string> = {}
    try { data = JSON.parse(fs.readFileSync(getTokenPath(), 'utf-8')) } catch {}
    delete data[key]
    fs.writeFileSync(getTokenPath(), JSON.stringify(data), 'utf-8')
  },
}

// Supabase anon key is publishable — safe to embed in the client app.
// Falls back to env var for dev overrides.
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://ygvqhvqplgljrksquwsr.supabase.co'
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_rafX5pp47TrxLp7Nu4DnyQ_1JDoX_5h'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: fileStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
