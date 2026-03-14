import crypto from 'crypto'
import { getDb, persist } from './cache.js'

export interface User {
  id: string
  email: string
  display_name: string
  google_id: string | null
  created_at: number
}

function generateId(): string {
  return crypto.randomBytes(16).toString('hex')
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex')
}

export async function createUser(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const db = await getDb()

  // Check if email already exists
  const existing = db.exec('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()])
  if (existing[0]?.values?.length) {
    throw new Error('An account with this email already exists')
  }

  const id = generateId()
  const salt = crypto.randomBytes(32).toString('hex')
  const passwordHash = hashPassword(password, salt)
  const now = Date.now()
  const normalizedEmail = email.toLowerCase().trim()

  db.run(
    `INSERT INTO users (id, email, password_hash, salt, display_name, google_id, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    [id, normalizedEmail, passwordHash, salt, displayName.trim() || normalizedEmail, now]
  )
  persist(db)

  return { id, email: normalizedEmail, display_name: displayName.trim() || normalizedEmail, google_id: null, created_at: now }
}

export async function loginUser(email: string, password: string): Promise<User> {
  const db = await getDb()

  const result = db.exec(
    'SELECT id, email, password_hash, salt, display_name, google_id, created_at FROM users WHERE email = ?',
    [email.toLowerCase().trim()]
  )

  if (!result[0]?.values?.length) {
    throw new Error('Invalid email or password')
  }

  const [id, storedEmail, passwordHash, salt, displayName, googleId, createdAt] = result[0].values[0]

  // If user was created via Google and has no password, reject password login
  if (!passwordHash || !salt) {
    throw new Error('Invalid email or password')
  }

  const attemptHash = hashPassword(password, salt as string)
  if (attemptHash !== passwordHash) {
    throw new Error('Invalid email or password')
  }

  return {
    id: id as string,
    email: storedEmail as string,
    display_name: displayName as string,
    google_id: googleId as string | null,
    created_at: createdAt as number,
  }
}

export async function findOrCreateGoogleUser(
  googleId: string,
  email: string,
  displayName: string
): Promise<User> {
  const db = await getDb()
  const normalizedEmail = email.toLowerCase().trim()

  // Try find by google_id first
  const byGoogleId = db.exec(
    'SELECT id, email, display_name, google_id, created_at FROM users WHERE google_id = ?',
    [googleId]
  )
  if (byGoogleId[0]?.values?.length) {
    const [id, em, dn, gid, ca] = byGoogleId[0].values[0]
    return { id: id as string, email: em as string, display_name: dn as string, google_id: gid as string, created_at: ca as number }
  }

  // Try find by email — link google_id to existing account
  const byEmail = db.exec(
    'SELECT id, email, display_name, google_id, created_at FROM users WHERE email = ?',
    [normalizedEmail]
  )
  if (byEmail[0]?.values?.length) {
    const [id, em, dn, , ca] = byEmail[0].values[0]
    db.run('UPDATE users SET google_id = ? WHERE id = ?', [googleId, id as string])
    persist(db)
    return { id: id as string, email: em as string, display_name: dn as string, google_id: googleId, created_at: ca as number }
  }

  // Create new Google user
  const id = generateId()
  const now = Date.now()
  db.run(
    `INSERT INTO users (id, email, password_hash, salt, display_name, google_id, created_at)
     VALUES (?, ?, NULL, NULL, ?, ?, ?)`,
    [id, normalizedEmail, displayName.trim() || normalizedEmail, googleId, now]
  )
  persist(db)

  return { id, email: normalizedEmail, display_name: displayName.trim() || normalizedEmail, google_id: googleId, created_at: now }
}

export async function getUserById(userId: string): Promise<User | null> {
  const db = await getDb()
  const result = db.exec(
    'SELECT id, email, display_name, google_id, created_at FROM users WHERE id = ?',
    [userId]
  )
  if (!result[0]?.values?.length) return null
  const [id, email, displayName, googleId, createdAt] = result[0].values[0]
  return {
    id: id as string,
    email: email as string,
    display_name: displayName as string,
    google_id: googleId as string | null,
    created_at: createdAt as number,
  }
}
