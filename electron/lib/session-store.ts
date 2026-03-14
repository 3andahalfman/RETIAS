import { getDb, persist } from './cache.js'

export interface PastSession {
  session_id: string
  company: string
  target_role: string
  started_at: number
  ended_at: number | null
  qa_count: number
}

export interface SessionQA {
  id: number
  session_id: string
  question: string
  question_type: string
  answer: string
  timestamp: number
}

export interface SessionTranscriptLine {
  id: number
  session_id: string
  role: string
  text: string
  timestamp: number
}

export interface SessionDetail extends PastSession {
  qa: SessionQA[]
  transcript: SessionTranscriptLine[]
}

export async function createSession(
  sessionId: string,
  company: string,
  targetRole: string,
  userId?: string
): Promise<void> {
  const db = await getDb()
  db.run(
    `INSERT OR IGNORE INTO past_sessions (session_id, company, target_role, started_at, qa_count, user_id)
     VALUES (?, ?, ?, ?, 0, ?)`,
    [sessionId, company || '', targetRole || '', Date.now(), userId ?? null]
  )
  persist(db)
}

export async function endSession(sessionId: string): Promise<void> {
  const db = await getDb()
  db.run(`UPDATE past_sessions SET ended_at = ? WHERE session_id = ?`, [Date.now(), sessionId])
  persist(db)
}

export async function addTranscriptLine(
  sessionId: string,
  role: string,
  text: string,
  timestamp: number
): Promise<void> {
  const db = await getDb()
  db.run(
    `INSERT INTO session_transcript (session_id, role, text, timestamp) VALUES (?, ?, ?, ?)`,
    [sessionId, role, text, timestamp]
  )
  persist(db)
}

export async function addQA(
  sessionId: string,
  question: string,
  questionType: string,
  answer: string,
  timestamp: number
): Promise<void> {
  const db = await getDb()
  db.run(
    `INSERT INTO session_qa (session_id, question, question_type, answer, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, question, questionType, answer, timestamp]
  )
  db.run(
    `UPDATE past_sessions SET qa_count = qa_count + 1 WHERE session_id = ?`,
    [sessionId]
  )
  persist(db)
}

export async function getSessions(userId?: string): Promise<PastSession[]> {
  const db = await getDb()
  let result
  if (userId) {
    result = db.exec(
      `SELECT session_id, company, target_role, started_at, ended_at, qa_count
       FROM past_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 100`,
      [userId]
    )
  } else {
    result = db.exec(
      `SELECT session_id, company, target_role, started_at, ended_at, qa_count
       FROM past_sessions ORDER BY started_at DESC LIMIT 100`
    )
  }
  if (!result[0]) return []
  return result[0].values.map((row) => ({
    session_id: row[0] as string,
    company: row[1] as string,
    target_role: row[2] as string,
    started_at: row[3] as number,
    ended_at: row[4] as number | null,
    qa_count: row[5] as number,
  }))
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const db = await getDb()

  const sessResult = db.exec(
    `SELECT session_id, company, target_role, started_at, ended_at, qa_count
     FROM past_sessions WHERE session_id = ?`,
    [sessionId]
  )
  if (!sessResult[0]?.values?.[0]) return null
  const [sid, company, role, started_at, ended_at, qa_count] = sessResult[0].values[0]

  const qaResult = db.exec(
    `SELECT id, session_id, question, question_type, answer, timestamp
     FROM session_qa WHERE session_id = ? ORDER BY timestamp ASC`,
    [sessionId]
  )
  const qa: SessionQA[] = (qaResult[0]?.values ?? []).map((row) => ({
    id: row[0] as number,
    session_id: row[1] as string,
    question: row[2] as string,
    question_type: row[3] as string,
    answer: row[4] as string,
    timestamp: row[5] as number,
  }))

  const txResult = db.exec(
    `SELECT id, session_id, role, text, timestamp
     FROM session_transcript WHERE session_id = ? ORDER BY timestamp ASC`,
    [sessionId]
  )
  const transcript: SessionTranscriptLine[] = (txResult[0]?.values ?? []).map((row) => ({
    id: row[0] as number,
    session_id: row[1] as string,
    role: row[2] as string,
    text: row[3] as string,
    timestamp: row[4] as number,
  }))

  return {
    session_id: sid as string,
    company: company as string,
    target_role: role as string,
    started_at: started_at as number,
    ended_at: ended_at as number | null,
    qa_count: qa_count as number,
    qa,
    transcript,
  }
}

export interface DashboardMetrics {
  totalSessions: number
  totalQAs: number
  totalTranscriptLines: number
  avgDurationMins: number
  topCompany: string | null
  recentSessions: PastSession[]
}

export async function getDashboardMetrics(userId?: string): Promise<DashboardMetrics> {
  const db = await getDb()

  const whereClause = userId ? `WHERE user_id = '${userId.replace(/'/g, "''")}'` : ''
  const andClause = userId ? `AND user_id = '${userId.replace(/'/g, "''")}'` : ''

  const sessCount = db.exec(`SELECT COUNT(*) FROM past_sessions ${whereClause}`)
  const totalSessions = (sessCount[0]?.values[0]?.[0] as number) ?? 0

  // For QA/transcript counts, filter via session_id subquery if userId provided
  let totalQAs = 0
  let totalTranscriptLines = 0
  if (userId) {
    const qaCount = db.exec(
      `SELECT COUNT(*) FROM session_qa WHERE session_id IN (SELECT session_id FROM past_sessions WHERE user_id = ?)`,
      [userId]
    )
    totalQAs = (qaCount[0]?.values[0]?.[0] as number) ?? 0

    const txCount = db.exec(
      `SELECT COUNT(*) FROM session_transcript WHERE session_id IN (SELECT session_id FROM past_sessions WHERE user_id = ?)`,
      [userId]
    )
    totalTranscriptLines = (txCount[0]?.values[0]?.[0] as number) ?? 0
  } else {
    const qaCount = db.exec('SELECT COUNT(*) FROM session_qa')
    totalQAs = (qaCount[0]?.values[0]?.[0] as number) ?? 0

    const txCount = db.exec('SELECT COUNT(*) FROM session_transcript')
    totalTranscriptLines = (txCount[0]?.values[0]?.[0] as number) ?? 0
  }

  const durResult = db.exec(`SELECT AVG(ended_at - started_at) FROM past_sessions WHERE ended_at IS NOT NULL ${andClause}`)
  const avgMs = (durResult[0]?.values[0]?.[0] as number) ?? 0
  const avgDurationMins = Math.round(avgMs / 60000)

  const topCo = db.exec(
    `SELECT company, COUNT(*) as cnt FROM past_sessions WHERE company != '' ${andClause} GROUP BY company ORDER BY cnt DESC LIMIT 1`
  )
  const topCompany = (topCo[0]?.values[0]?.[0] as string) ?? null

  const recentResult = db.exec(
    `SELECT session_id, company, target_role, started_at, ended_at, qa_count FROM past_sessions ${whereClause} ORDER BY started_at DESC LIMIT 3`
  )
  const recentSessions: PastSession[] = (recentResult[0]?.values ?? []).map((row) => ({
    session_id: row[0] as string,
    company: row[1] as string,
    target_role: row[2] as string,
    started_at: row[3] as number,
    ended_at: row[4] as number | null,
    qa_count: row[5] as number,
  }))

  return { totalSessions, totalQAs, totalTranscriptLines, avgDurationMins, topCompany, recentSessions }
}

export async function deleteSession(sessionId: string, userId?: string): Promise<void> {
  const db = await getDb()

  // Verify ownership if userId provided
  if (userId) {
    const check = db.exec(
      `SELECT session_id FROM past_sessions WHERE session_id = ? AND user_id = ?`,
      [sessionId, userId]
    )
    if (!check[0]?.values?.length) return // session not owned by user, silently ignore
  }

  db.run(`DELETE FROM session_transcript WHERE session_id = ?`, [sessionId])
  db.run(`DELETE FROM session_qa WHERE session_id = ?`, [sessionId])
  db.run(`DELETE FROM past_sessions WHERE session_id = ?`, [sessionId])
  persist(db)
}
