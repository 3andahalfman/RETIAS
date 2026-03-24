import { supabase } from './supabase.js'

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

export interface DashboardMetrics {
  totalSessions: number
  totalQAs: number
  totalTranscriptLines: number
  avgDurationMins: number
  topCompany: string | null
  recentSessions: PastSession[]
}

function toEpoch(ts: string | null | undefined): number | null {
  if (!ts) return null
  return new Date(ts).getTime()
}

function mapSession(row: Record<string, unknown>): PastSession {
  return {
    session_id: row.id as string,
    company: (row.company as string) ?? '',
    target_role: (row.target_role as string) ?? '',
    started_at: toEpoch(row.started_at as string) ?? Date.now(),
    ended_at: toEpoch(row.ended_at as string | null),
    qa_count: (row.qa_count as number) ?? 0,
  }
}

export async function createSession(
  sessionId: string,
  company: string,
  targetRole: string,
  userId?: string
): Promise<void> {
  const { error } = await supabase.from('past_sessions').insert({
    id: sessionId,
    user_id: userId ?? null,
    company: company || '',
    target_role: targetRole || '',
    started_at: new Date().toISOString(),
    qa_count: 0,
  })
  if (error) console.error('[session-store] createSession error:', error.message)
}

export async function endSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('past_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) console.error('[session-store] endSession error:', error.message)
}

export async function addTranscriptLine(
  sessionId: string,
  role: string,
  text: string,
  timestamp: number
): Promise<void> {
  const { error } = await supabase.from('session_transcript').insert({
    session_id: sessionId,
    role,
    text,
    created_at: new Date(timestamp).toISOString(),
  })
  if (error) console.error('[session-store] addTranscriptLine error:', error.message)
}

export async function addQA(
  sessionId: string,
  question: string,
  questionType: string,
  answer: string,
  timestamp: number
): Promise<void> {
  const { error: qaError } = await supabase.from('session_qa').insert({
    session_id: sessionId,
    question,
    question_type: questionType,
    answer,
    created_at: new Date(timestamp).toISOString(),
  })
  if (qaError) {
    console.error('[session-store] addQA error:', qaError.message)
    return
  }

  // Increment qa_count
  const { data: sess } = await supabase
    .from('past_sessions')
    .select('qa_count')
    .eq('id', sessionId)
    .single()
  if (sess) {
    await supabase
      .from('past_sessions')
      .update({ qa_count: ((sess.qa_count as number) ?? 0) + 1 })
      .eq('id', sessionId)
  }
}

export async function getSessions(userId?: string): Promise<PastSession[]> {
  // Require userId — never return data across all users
  if (!userId) return []

  const { data, error } = await supabase
    .from('past_sessions')
    .select('id, company, target_role, started_at, ended_at, qa_count')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[session-store] getSessions error:', error.message)
    return []
  }
  return (data ?? []).map(mapSession)
}

export async function getSessionDetail(sessionId: string, userId?: string): Promise<SessionDetail | null> {
  // Build query — if userId is provided, enforce ownership; RLS is the backstop
  let query = supabase
    .from('past_sessions')
    .select('id, company, target_role, started_at, ended_at, qa_count')
    .eq('id', sessionId)

  if (userId) query = query.eq('user_id', userId)

  const { data: sess, error: sessError } = await query.single()

  if (sessError || !sess) return null

  const [{ data: qaData }, { data: txData }] = await Promise.all([
    supabase
      .from('session_qa')
      .select('id, session_id, question, question_type, answer, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
    supabase
      .from('session_transcript')
      .select('id, session_id, role, text, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
  ])

  const qa: SessionQA[] = (qaData ?? []).map((row, i) => ({
    id: (row.id as number) ?? i,
    session_id: row.session_id as string,
    question: row.question as string,
    question_type: row.question_type as string,
    answer: row.answer as string,
    timestamp: toEpoch(row.created_at as string) ?? Date.now(),
  }))

  const transcript: SessionTranscriptLine[] = (txData ?? []).map((row, i) => ({
    id: (row.id as number) ?? i,
    session_id: row.session_id as string,
    role: row.role as string,
    text: row.text as string,
    timestamp: toEpoch(row.created_at as string) ?? Date.now(),
  }))

  return { ...mapSession(sess as Record<string, unknown>), qa, transcript }
}

export async function getDashboardMetrics(userId?: string): Promise<DashboardMetrics> {
  // Require userId — never aggregate across all users
  if (!userId) {
    return { totalSessions: 0, totalQAs: 0, totalTranscriptLines: 0, avgDurationMins: 0, topCompany: null, recentSessions: [] }
  }

  const [sessResult, qaCount, txCount, allSessions] = await Promise.all([
    supabase.from('past_sessions').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('session_qa')
      .select('session_id', { count: 'exact', head: true })
      .in('session_id',
        (await supabase.from('past_sessions').select('id').eq('user_id', userId)).data?.map((r: any) => r.id) ?? []
      ),
    supabase.from('session_transcript')
      .select('session_id', { count: 'exact', head: true })
      .in('session_id',
        (await supabase.from('past_sessions').select('id').eq('user_id', userId)).data?.map((r: any) => r.id) ?? []
      ),
    supabase
      .from('past_sessions')
      .select('id, company, target_role, started_at, ended_at, qa_count')
      .eq('user_id', userId)
      .order('started_at', { ascending: false }),
  ])

  const sessions = (allSessions.data ?? []).map(mapSession)

  const completed = sessions.filter((s) => s.ended_at !== null)
  const avgMs = completed.length
    ? completed.reduce((sum, s) => sum + (s.ended_at! - s.started_at), 0) / completed.length
    : 0
  const avgDurationMins = Math.round(avgMs / 60000)

  const companyCount: Record<string, number> = {}
  for (const s of sessions) {
    if (s.company) companyCount[s.company] = (companyCount[s.company] ?? 0) + 1
  }
  const topCompany =
    Object.keys(companyCount).sort((a, b) => companyCount[b] - companyCount[a])[0] ?? null

  return {
    totalSessions: sessResult.count ?? 0,
    totalQAs: qaCount.count ?? 0,
    totalTranscriptLines: txCount.count ?? 0,
    avgDurationMins,
    topCompany,
    recentSessions: sessions.slice(0, 3),
  }
}

export async function deleteSession(sessionId: string, userId?: string): Promise<void> {
  // Enforce ownership in query + RLS is the backstop; CASCADE deletes related qa + transcript rows
  let query = supabase.from('past_sessions').delete().eq('id', sessionId)
  if (userId) query = query.eq('user_id', userId)
  const { error } = await query
  if (error) console.error('[session-store] deleteSession error:', error.message)
}

export async function clearAllSessions(userId?: string): Promise<void> {
  let query = supabase.from('past_sessions').delete().neq('id', '')
  if (userId) query = query.eq('user_id', userId)
  const { error } = await query
  if (error) console.error('[session-store] clearAllSessions error:', error.message)
}
