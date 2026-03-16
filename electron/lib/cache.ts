import initSqlJs, { Database } from 'sql.js'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'

/**
 * Local SQLite cache for LLM answers and context profiles.
 * User data (sessions, CVs, auth) now lives in Supabase.
 */

let db: Database | null = null
let dbPath = ''

const COMMON_QUESTIONS: Array<{ question: string; type: string; answer: string }> = [
  {
    question: 'tell me about yourself',
    type: 'behavioral',
    answer:
      '• Started in [your background] → progressed to [current role/skills]\n• Key strength: [your top skill with brief example]\n• Currently focused on [what you are working on/learning]\n• Excited about this role because [1 specific reason tied to job description]',
  },
  {
    question: 'what are your strengths',
    type: 'behavioral',
    answer:
      '• [Strength 1]: [Concrete example with outcome]\n• [Strength 2]: [Concrete example with outcome]\n• [Strength 3]: [Concrete example with outcome]\n• Tie to role: These strengths directly apply because [reason]',
  },
  {
    question: 'what are your weaknesses',
    type: 'behavioral',
    answer:
      '• Real weakness (not humble-brag): [genuine area for growth]\n• What I did: [concrete steps taken to improve]\n• Progress: [measurable improvement or milestone]\n• Framing: I view it as an ongoing learning area, not a blocker',
  },
  {
    question: 'why do you want to work here',
    type: 'behavioral',
    answer:
      '• Product/mission: [specific thing about company that excites you]\n• Team/culture: [something specific you learned about the team]\n• Growth: [how this role accelerates your career goal]\n• Contribution: [what unique value you bring that fits their needs]',
  },
  {
    question: 'describe a challenging project',
    type: 'behavioral',
    answer:
      '• Situation: [project context + why it was hard]\n• Task: [your specific responsibility]\n• Action: [3 key decisions/actions you took]\n• Result: [quantified outcome] — delivered on time/budget/quality',
  },
]

export async function getDb(): Promise<Database> {
  if (db) return db

  const SQL = await initSqlJs()

  dbPath = path.join(app?.getPath?.('userData') ?? '.', 'interview-cache.db')

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS answers (
      hash TEXT NOT NULL,
      question_type TEXT NOT NULL,
      question_text TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (hash, question_type)
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS context_profiles (
      session_hash TEXT PRIMARY KEY,
      profile_json TEXT NOT NULL,
      job_json TEXT NOT NULL,
      company_json TEXT NOT NULL,
      style_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  seedCommonQuestions(db)
  persist(db)

  return db
}

function seedCommonQuestions(database: Database) {
  const result = database.exec('SELECT COUNT(*) as n FROM answers')
  const count = result[0]?.values?.[0]?.[0] ?? 0
  if (Number(count) > 0) return

  const stmt = database.prepare(
    'INSERT OR IGNORE INTO answers (hash, question_type, question_text, answer_text, created_at) VALUES (?, ?, ?, ?, ?)'
  )
  for (const { question, type, answer } of COMMON_QUESTIONS) {
    const hash = hashQuestion(question)
    stmt.run([hash, type, question, answer, Date.now()])
  }
  stmt.free()
  console.log(`[Cache] Seeded ${COMMON_QUESTIONS.length} common questions`)
}

export function persist(database: Database) {
  if (!dbPath) return
  const data = database.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

function hashQuestion(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

export class AnswerCache {
  async get(questionText: string, questionType: string): Promise<string | null> {
    const database = await getDb()
    const hash = hashQuestion(questionText)
    const result = database.exec(
      'SELECT answer_text FROM answers WHERE hash = ? AND question_type = ?',
      [hash, questionType]
    )
    return (result[0]?.values?.[0]?.[0] as string) ?? null
  }

  async set(questionText: string, questionType: string, answerText: string): Promise<void> {
    const database = await getDb()
    const hash = hashQuestion(questionText)
    database.run(
      'INSERT OR REPLACE INTO answers (hash, question_type, question_text, answer_text, created_at) VALUES (?, ?, ?, ?, ?)',
      [hash, questionType, questionText.substring(0, 500), answerText, Date.now()]
    )
    persist(database)
  }

  close() {
    if (db) {
      persist(db)
      db.close()
      db = null
    }
  }
}
