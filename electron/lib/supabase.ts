import { createClient } from '@supabase/supabase-js'
import electron from 'electron'
import fs from 'fs'
import path from 'path'

const { app, safeStorage } = electron as typeof import('electron')

let tokenPath: string | null = null

function getTokenPath(): string | null {
  // Electron `app` is unavailable in worker_threads and any context where
  // `require('electron')` returns just the binary path string. In that case
  // we fall back to in-memory storage so the Supabase client still constructs.
  if (!app || typeof app.getPath !== 'function') return null
  if (!tokenPath) {
    // .enc suffix signals the file is encrypted — never overwrite with plaintext
    tokenPath = path.join(app.getPath('userData'), 'sb-session.enc')
  }
  return tokenPath
}

// ── Encrypted storage helpers ───────────────────────────────────────────────

// In-memory fallback when Electron `app` is unavailable (worker_threads,
// ELECTRON_RUN_AS_NODE) so the Supabase client can still construct without
// throwing. No session persistence in that case — calls just no-op.
const memoryStore: Record<string, string> = {}

function loadData(): Record<string, string> {
  const filePath = getTokenPath()
  if (!filePath) return memoryStore
  if (!fs.existsSync(filePath)) return {}
  try {
    const raw = fs.readFileSync(filePath)
    if (safeStorage?.isEncryptionAvailable?.()) {
      const decrypted = safeStorage.decryptString(raw)
      return JSON.parse(decrypted)
    }
    // safeStorage unavailable (e.g. headless CI) — try plaintext fallback
    return JSON.parse(raw.toString('utf-8'))
  } catch {
    return {}
  }
}

function saveData(data: Record<string, string>): void {
  const filePath = getTokenPath()
  if (!filePath) {
    // No Electron app context — keep in memory so the auth client doesn't crash
    Object.assign(memoryStore, data)
    return
  }
  if (safeStorage?.isEncryptionAvailable?.()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(data))
    fs.writeFileSync(filePath, encrypted)
  } else {
    // safeStorage unavailable — write as plaintext fallback
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8')
  }
}

// Migrate plaintext session file written by versions < 1.4.9
function migrateLegacySession(): void {
  if (!app || typeof app.getPath !== 'function') return
  const legacyPath = path.join(app.getPath('userData'), 'sb-session.json')
  if (!fs.existsSync(legacyPath)) return
  try {
    const raw = fs.readFileSync(legacyPath, 'utf-8')
    const data: Record<string, string> = JSON.parse(raw)
    saveData(data)
    fs.unlinkSync(legacyPath)
    console.log('[Supabase] Migrated plaintext session to encrypted storage')
  } catch {
    // Non-fatal — user will simply be asked to log in again
  }
}

// File-based auth storage for Electron main process (no localStorage)
const fileStorage = {
  getItem(key: string): string | null {
    return loadData()[key] ?? null
  },
  setItem(key: string, value: string): void {
    const data = loadData()
    data[key] = value
    saveData(data)
  },
  removeItem(key: string): void {
    const data = loadData()
    delete data[key]
    saveData(data)
  },
}

// Run migration once at module load (app is already ready at this point)
try { migrateLegacySession() } catch { /* non-fatal */ }

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
