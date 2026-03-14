import crypto from 'crypto'
import { getDb, persist } from './cache.js'

export interface CV {
  id: string
  user_id: string
  name: string
  content: string
  created_at: number
}

function generateId(): string {
  return crypto.randomBytes(16).toString('hex')
}

export async function saveCV(userId: string, name: string, content: string): Promise<CV> {
  const db = await getDb()
  const id = generateId()
  const now = Date.now()

  db.run(
    `INSERT INTO cvs (id, user_id, name, content, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, userId, name.trim(), content, now]
  )
  persist(db)

  return { id, user_id: userId, name: name.trim(), content, created_at: now }
}

export async function listCVs(userId: string): Promise<CV[]> {
  const db = await getDb()
  const result = db.exec(
    `SELECT id, user_id, name, content, created_at FROM cvs WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  )
  if (!result[0]) return []
  return result[0].values.map((row) => ({
    id: row[0] as string,
    user_id: row[1] as string,
    name: row[2] as string,
    content: row[3] as string,
    created_at: row[4] as number,
  }))
}

export async function deleteCV(userId: string, cvId: string): Promise<void> {
  const db = await getDb()
  db.run(`DELETE FROM cvs WHERE id = ? AND user_id = ?`, [cvId, userId])
  persist(db)
}
