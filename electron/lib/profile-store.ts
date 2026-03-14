import { getDb, persist } from './cache.js'
import type { ExtractedContext } from './context-extractor.js'

/**
 * Stores and loads extracted context profiles from SQLite.
 * Keyed by session hash so we skip re-extraction for identical inputs.
 */

export async function storeProfile(sessionHash: string, ctx: ExtractedContext): Promise<void> {
  const db = await getDb()
  db.run(
    `INSERT OR REPLACE INTO context_profiles
     (session_hash, profile_json, job_json, company_json, style_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sessionHash,
      JSON.stringify(ctx.profile),
      JSON.stringify(ctx.job),
      JSON.stringify(ctx.company),
      JSON.stringify(ctx.style),
      Date.now(),
    ]
  )
  persist(db)
}

export async function loadProfile(sessionHash: string): Promise<ExtractedContext | null> {
  const db = await getDb()
  try {
    const result = db.exec(
      `SELECT profile_json, job_json, company_json, style_json
       FROM context_profiles WHERE session_hash = ?`,
      [sessionHash]
    )
    const row = result[0]?.values?.[0]
    if (!row) return null
    return {
      profile: JSON.parse(row[0] as string),
      job:     JSON.parse(row[1] as string),
      company: JSON.parse(row[2] as string),
      style:   JSON.parse(row[3] as string),
    }
  } catch {
    return null
  }
}
