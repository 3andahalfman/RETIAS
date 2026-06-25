import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase.js'

const BUCKET = 'online-test-screenshots'
const SCORE_MODEL = 'claude-sonnet-4-6'

export interface OnlineTestCapture {
  id: string
  user_id: string
  user_email: string
  session_id: string | null
  test_type: string
  screenshot_paths: string[]
  screenshot_count: number
  ai_answer: string
  score_accuracy: number | null
  score_completeness: number | null
  score_overall: number | null
  score_notes: string | null
  extracted_questions: string | null
  detected_test_type: string | null
  detected_platform: string | null
  source_url: string | null
  created_at: string
}

export interface StoreCaptureParams {
  userId: string
  userEmail: string
  sessionId: string | null
  testType: string
  images: string[]
  aiAnswer: string
}

interface CaptureScores {
  accuracy: number
  completeness: number
  overall: number
  notes: string
  questions: string
  detectedTestType: string
  detectedPlatform: string
  sourceUrl: string
}

function clampScore(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100))
}

async function scoreCapture(images: string[], aiAnswer: string, testType: string): Promise<CaptureScores | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    console.warn('[screenshot-store] Skipping scoring — ANTHROPIC_API_KEY not configured')
    return null
  }

  const anthropic = new Anthropic({ apiKey })
  const imageBlocks = images.slice(0, 3).map((data) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/png' as const, data },
  }))

  const prompt = `You are evaluating an AI assistant's answer to questions visible in online assessment screenshot(s).

User-selected assessment type: ${testType}

Tasks:
1. Look at the top of the screenshot for a browser address bar or window title bar and extract the FULL URL or application name shown there. Return only the URL string if found (e.g. "https://www.hackerrank.com/test/abc123"), or the application name (e.g. "Microsoft Word", "Notepad"). Empty string if nothing identifiable is shown.
2. From that URL/app name (or, if missing, from page chrome and styling) derive the platform name. Use the canonical brand name when possible: "HackerRank", "Codility", "Mettl", "iMocha", "TestGorilla", "Coderbyte", "LeetCode", "HackerEarth", "CodeSignal", "Google Forms", "Microsoft Forms", "Workday", "Pymetrics", "Pearson VUE", "Microsoft Word", "Google Docs", "Notion", etc. If unclear, use "Unknown".
3. Extract every question visible in the screenshots. Preserve numbering ("1.", "2."), multiple choice options ("A)", "B)") and code blocks. Separate questions with a blank line. If nothing question-like is visible, return an empty string.
4. Detect the actual test type from the content. Use one of: "coding", "mcq", "behavioural", "system-design", "numerical", "verbal-reasoning", "logical-reasoning", "data-science", "ai-ml", "english", "onboarding", "other".
5. Score the AI answer on:
   - accuracy (0-100): likely correctness of solutions for visible questions
   - completeness (0-100): how many visible questions were addressed
   - overall (0-100): holistic usefulness for someone taking this test

Respond with ONLY valid JSON, no markdown:
{"source_url":"…","detected_platform":"…","questions":"raw extracted question text","detected_test_type":"…","accuracy":0,"completeness":0,"overall":0,"notes":"one sentence"}`

  try {
    const response = await anthropic.messages.create({
      model: SCORE_MODEL,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [...imageBlocks, { type: 'text', text: `AI ANSWER:\n${aiAnswer.slice(0, 6000)}\n\n${prompt}` }],
      }],
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    return {
      accuracy: clampScore(parsed.accuracy),
      completeness: clampScore(parsed.completeness),
      overall: clampScore(parsed.overall),
      notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 500) : '',
      questions: typeof parsed.questions === 'string' ? parsed.questions.slice(0, 8000) : '',
      detectedTestType: typeof parsed.detected_test_type === 'string' ? parsed.detected_test_type.slice(0, 60) : '',
      detectedPlatform: typeof parsed.detected_platform === 'string' ? parsed.detected_platform.slice(0, 60) : '',
      sourceUrl: typeof parsed.source_url === 'string' ? parsed.source_url.slice(0, 500) : '',
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[screenshot-store] Scoring failed:', msg)
    return null
  }
}

async function uploadScreenshots(userId: string, captureId: string, images: string[]): Promise<string[]> {
  const paths: string[] = []

  for (let i = 0; i < images.length; i++) {
    const path = `${userId}/${captureId}/${i + 1}.png`
    const buffer = Buffer.from(images[i], 'base64')
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: 'image/png', upsert: false })

    if (error) {
      console.error(`[screenshot-store] Upload failed for ${path}:`, error.message)
      continue
    }
    paths.push(path)
  }

  return paths
}

export async function storeOnlineTestCapture(params: StoreCaptureParams): Promise<string | null> {
  const { userId, userEmail, sessionId, testType, images, aiAnswer } = params
  if (!images.length || !aiAnswer.trim()) return null

  const captureId = crypto.randomUUID()
  const [paths, scores] = await Promise.all([
    uploadScreenshots(userId, captureId, images),
    scoreCapture(images, aiAnswer, testType),
  ])

  if (!paths.length) {
    console.error('[screenshot-store] No screenshots uploaded — aborting capture record')
    return null
  }

  const { error } = await supabase.from('online_test_captures').insert({
    id: captureId,
    user_id: userId,
    user_email: userEmail,
    session_id: sessionId,
    test_type: testType,
    screenshot_paths: paths,
    screenshot_count: paths.length,
    ai_answer: aiAnswer,
    score_accuracy: scores?.accuracy ?? null,
    score_completeness: scores?.completeness ?? null,
    score_overall: scores?.overall ?? null,
    score_notes: scores?.notes ?? null,
    extracted_questions: scores?.questions ?? null,
    detected_test_type: scores?.detectedTestType ?? null,
    detected_platform: scores?.detectedPlatform ?? null,
    source_url: scores?.sourceUrl ?? null,
  })

  if (error) {
    console.error('[screenshot-store] Insert failed:', error.message)
    return null
  }

  console.log(`[screenshot-store] Stored capture ${captureId} (${paths.length} img, overall=${scores?.overall ?? 'n/a'})`)
  return captureId
}

export async function listOnlineTestCaptures(limit = 100, offset = 0): Promise<OnlineTestCapture[]> {
  const { data, error } = await supabase
    .from('online_test_captures')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[screenshot-store] listOnlineTestCaptures error:', error.message)
    return []
  }

  return (data ?? []) as OnlineTestCapture[]
}

export async function getScreenshotSignedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) {
    console.error('[screenshot-store] signed URL error:', error.message)
    return null
  }
  return data.signedUrl
}

export async function getOnlineTestCaptureStats(): Promise<{
  totalCaptures: number
  avgOverallScore: number | null
  uniqueUsers: number
}> {
  const { data, error } = await supabase
    .from('online_test_captures')
    .select('user_id, score_overall')

  if (error || !data?.length) {
    return { totalCaptures: 0, avgOverallScore: null, uniqueUsers: 0 }
  }

  const scored = data.filter((r) => r.score_overall != null)
  const avg = scored.length
    ? scored.reduce((sum, r) => sum + Number(r.score_overall), 0) / scored.length
    : null

  return {
    totalCaptures: data.length,
    avgOverallScore: avg != null ? Math.round(avg * 10) / 10 : null,
    uniqueUsers: new Set(data.map((r) => r.user_id)).size,
  }
}

export interface CaptureUserSummary {
  email: string
  userId: string
  captureCount: number
  avgOverallScore: number | null
  lastActiveAt: string
}

function aggregateCaptureUsers(
  rows: Array<{ user_email: string; user_id: string; score_overall: number | null; created_at: string }>,
): CaptureUserSummary[] {
  const byUser = new Map<string, { email: string; userId: string; rows: typeof rows }>()
  for (const row of rows) {
    const key = row.user_email.trim().toLowerCase()
    const existing = byUser.get(key)
    if (!existing) byUser.set(key, { email: row.user_email, userId: row.user_id, rows: [row] })
    else existing.rows.push(row)
  }

  return Array.from(byUser.values()).map(({ email, userId, rows: caps }) => {
    const scored = caps.filter((c) => c.score_overall != null)
    const avg = scored.length
      ? Math.round((scored.reduce((s, c) => s + Number(c.score_overall), 0) / scored.length) * 10) / 10
      : null
    const lastActiveAt = caps.reduce(
      (max, c) => (c.created_at > max ? c.created_at : max),
      caps[0].created_at,
    )
    return { email, userId, captureCount: caps.length, avgOverallScore: avg, lastActiveAt }
  })
}

export async function listOnlineTestCaptureUsers(): Promise<CaptureUserSummary[]> {
  const { data, error } = await supabase
    .from('online_test_captures')
    .select('user_email, user_id, score_overall, created_at')

  if (error) {
    console.error('[screenshot-store] listOnlineTestCaptureUsers error:', error.message)
    return []
  }
  if (!data?.length) return []
  return aggregateCaptureUsers(data)
}

export async function listCapturesForUser(email: string, limit = 500): Promise<OnlineTestCapture[]> {
  const normalized = email.trim().toLowerCase()
  const { data, error } = await supabase
    .from('online_test_captures')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[screenshot-store] listCapturesForUser error:', error.message)
    return []
  }

  return ((data ?? []) as OnlineTestCapture[]).filter(
    (row) => row.user_email.trim().toLowerCase() === normalized,
  )
}
