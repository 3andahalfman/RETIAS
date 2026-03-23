/**
 * Persistent file logger for RETIAS main process.
 * - Writes to: %APPDATA%/RETIAS/logs/YYYY-MM-DD.log
 * - Scrubs emails, UUIDs, and JWT tokens before writing
 * - Auto-rotates (one file per day); keeps last 7 days
 */

import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'

const MAX_LOG_DAYS = 7

function scrubPII(msg: string): string {
  return msg
    // Email addresses
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[email]')
    // UUIDs (Supabase user IDs)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[uuid]')
    // JWT tokens (3-part base64url)
    .replace(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]*/g, '[jwt]')
    // API keys (long hex/base64 strings > 30 chars)
    .replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, '[key]')
}

function getLogDir(): string {
  const dir = join(app.getPath('userData'), 'logs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getLogPath(): string {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return join(getLogDir(), `${today}.log`)
}

function rotateLogs(): void {
  try {
    const dir = getLogDir()
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.log'))
      .sort()
    if (files.length > MAX_LOG_DAYS) {
      files.slice(0, files.length - MAX_LOG_DAYS).forEach((f) => {
        try { unlinkSync(join(dir, f)) } catch { /* ignore */ }
      })
    }
  } catch { /* ignore rotation errors */ }
}

function write(level: string, args: unknown[]): void {
  try {
    const raw = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    const scrubbed = scrubPII(raw)
    const line = `${new Date().toISOString()} [${level}] ${scrubbed}\n`
    appendFileSync(getLogPath(), line, 'utf8')
  } catch { /* never throw from logger */ }
}

// Rotate on startup (runs once when the module is first imported)
try { rotateLogs() } catch { /* ignore */ }

export const logger = {
  log:  (...args: unknown[]) => write('INFO',  args),
  warn: (...args: unknown[]) => write('WARN',  args),
  error:(...args: unknown[]) => write('ERROR', args),
}
