/** Session assessment type ids — chosen at Online Assessment setup. */
export const ASSESSMENT_TYPES = [
  { id: 'english', label: 'English / Verbal' },
  { id: 'coding', label: 'Coding Assessment' },
  { id: 'ai-ml', label: 'AI / ML Test' },
  { id: 'numerical', label: 'Numerical Reasoning' },
  { id: 'technical', label: 'Technical Assessment' },
  { id: 'onboarding', label: 'Onboarding / Compliance' },
  { id: 'general', label: 'General' },
] as const

export type AssessmentTypeId = (typeof ASSESSMENT_TYPES)[number]['id']

const LABEL_BY_ID = new Map(ASSESSMENT_TYPES.map((t) => [t.id, t.label]))
const ORDER = ASSESSMENT_TYPES.map((t) => t.id)

/** Human-readable label for a session testType id; passthrough for admin-curated names. */
export function getAssessmentTypeLabel(idOrLabel: string): string {
  return LABEL_BY_ID.get(idOrLabel as AssessmentTypeId) ?? idOrLabel
}

export function isKnownAssessmentTypeId(id: string): id is AssessmentTypeId {
  return LABEL_BY_ID.has(id as AssessmentTypeId)
}

/** Sort assessment type keys with known session ids first (setup order), then A–Z. */
export function sortAssessmentTypeKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ai = ORDER.indexOf(a as AssessmentTypeId)
    const bi = ORDER.indexOf(b as AssessmentTypeId)
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return getAssessmentTypeLabel(a).localeCompare(getAssessmentTypeLabel(b))
  })
}

export const ONLINE_TEST_COMPANY = 'Online Test'

export function isOnlineTestSession(session: { company?: string | null }): boolean {
  return (session.company ?? '') === ONLINE_TEST_COMPANY
}

/** Session-level assessment category for online test sessions (stored in past_sessions.target_role). */
export function getSessionAssessmentType(session: {
  company?: string | null
  target_role?: string | null
}): string | null {
  if (!isOnlineTestSession(session)) return null
  const role = (session.target_role ?? '').trim()
  return role || null
}
