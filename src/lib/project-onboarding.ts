/** Session assessment type id for Project Onboarding (stored as `onboarding` in DB). */
export const PROJECT_ONBOARDING_TYPE = 'onboarding'

export const MAX_PROJECT_INSTRUCTIONS = 4000

export function appendInstructionText(existing: string, extracted: string): string {
  const next = extracted.trim()
  if (!next) return existing
  const prev = existing.trim()
  if (!prev) return next
  return `${prev}\n\n${next}`
}
