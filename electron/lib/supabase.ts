import { createClient } from '@supabase/supabase-js'
import { safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let tokenPath: string | null = null

function getTokenPath(): string {
  if (!tokenPath) {
    // .enc suffix signals the file is encrypted — never overwrite with plaintext
    tokenPath = path.join(app.getPath('userData'), 'sb-session.enc')
  }
  return tokenPath
}

// ── Encrypted storage helpers ───────────────────────────────────────────────

function loadData(): Record<string, string> {
  const filePath = getTokenPath()
  if (!fs.existsSync(filePath)) return {}
  try {
    const raw = fs.readFileSync(filePath)
    if (safeStorage.isEncryptionAvailable()) {
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
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(data))
    fs.writeFileSync(getTokenPath(), encrypted)
  } else {
    // safeStorage unavailable — write as plaintext fallback
    fs.writeFileSync(getTokenPath(), JSON.stringify(data), 'utf-8')
  }
}

// Migrate plaintext session file written by versions < 1.4.9
function migrateLegacySession(): void {
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
