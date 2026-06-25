import { supabase } from './supabase.js'

export interface SolvedQuestionRow {
  id: string
  platform: string
  assessment_type: string
  question: string
  answer: string
  answer_variants: string[] | null
  paraphrase_enabled: boolean
  source_capture_id: string | null
  source_url: string | null
  created_at: string
}

export interface UpsertSolvedPayload {
  platform: string
  assessment_type: string
  question: string
  answer: string
  answer_variants?: string[]
  paraphrase_enabled: boolean
  source_capture_id: string | null
  source_url: string | null
}

export async function listSolvedQuestions(limit = 1000): Promise<SolvedQuestionRow[]> {
  const { data, error } = await supabase
    .from('solved_questions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as SolvedQuestionRow[]
}

export async function upsertSolvedQuestions(rows: UpsertSolvedPayload[]): Promise<{
  total: number
  inserted: number
  updated: number
}> {
  if (!rows.length) throw new Error('No rows to save')

  const platform = rows[0].platform
  const assessment = rows[0].assessment_type
  const questions = rows.map((r) => r.question)

  const { data: existing, error: lookupErr } = await supabase
    .from('solved_questions')
    .select('question')
    .eq('platform', platform)
    .eq('assessment_type', assessment)
    .in('question', questions)

  if (lookupErr) throw new Error(lookupErr.message)

  const existingSet = new Set((existing ?? []).map((r) => r.question))
  const updated = rows.filter((r) => existingSet.has(r.question)).length
  const inserted = rows.length - updated

  const { error } = await supabase.from('solved_questions').upsert(rows, {
    onConflict: 'platform,assessment_type,question',
  })
  if (error) throw new Error(error.message)

  return { total: rows.length, inserted, updated }
}

/** Delete specific solved-question rows by id. Returns count removed. */
export async function deleteSolvedQuestions(ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const { error, count } = await supabase
    .from('solved_questions')
    .delete({ count: 'exact' })
    .in('id', ids)
  if (error) throw new Error(error.message)
  return count ?? ids.length
}

/** Delete every question for a platform + assessment type. Returns count removed. */
export async function deleteSolvedAssessment(platform: string, assessmentType: string): Promise<number> {
  const { error, count } = await supabase
    .from('solved_questions')
    .delete({ count: 'exact' })
    .eq('platform', platform)
    .eq('assessment_type', assessmentType)
  if (error) throw new Error(error.message)
  return count ?? 0
}
