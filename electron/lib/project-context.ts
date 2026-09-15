/** Build and inject project context (instructions + files) into LLM prompts. */

export const MAX_PROJECT_INSTRUCTIONS = 8_000
export const MAX_PROJECT_FILE_CONTENT = 50_000
export const MAX_PROJECT_CONTEXT_TOTAL = 120_000

const TRUNCATION_NOTICE = '\n[... truncated — the text above is cut off and incomplete ...]'

/**
 * Truncation must be visible: silently cutting a file makes the model treat a partial view as complete.
 * The notice fits inside `max` so downstream length caps cannot strip it.
 */
function truncateWithNotice(text: string, max: number): string {
  if (text.length <= max) return text
  return text.substring(0, Math.max(0, max - TRUNCATION_NOTICE.length)) + TRUNCATION_NOTICE
}

export function buildProjectContextString(
  instructions: string,
  files: { name: string; content: string }[],
): string {
  const parts: string[] = []
  const instr = instructions.trim()
  if (instr) {
    parts.push(`INSTRUCTIONS:\n${truncateWithNotice(instr, MAX_PROJECT_INSTRUCTIONS)}`)
  }

  for (const file of files) {
    const name = file.name.trim() || 'untitled'
    const content = file.content.trim()
    if (!content) continue
    parts.push(`FILE: ${name}\n${truncateWithNotice(content, MAX_PROJECT_FILE_CONTENT)}`)
  }

  const combined = parts.join('\n\n---\n\n')
  return truncateWithNotice(combined, MAX_PROJECT_CONTEXT_TOTAL)
}

const GROUNDING_INSTRUCTION = `GROUNDING (applies only to facts specific to this project): treat the project context above as the single source of truth for its own policies, specifications, figures, names, data, and file contents. If it does not cover a project-specific detail, say plainly that the project files do not include it rather than inventing or guessing it, and never invent file contents or quote text as if it came from the project files.
This does not restrict anything else: keep answering interview, meeting, and assessment questions exactly as instructed above, drawing on the candidate profile, your own reasoning, and general knowledge — including building concrete personal examples and STAR stories when asked. Never refuse a question because it is absent from the project files.`

/** Append saved project context and optional session-level extra instructions to a system prompt. */
export function appendProjectContext(
  basePrompt: string,
  projectContext?: string | null,
  extraContext?: string | null,
): string {
  let prompt = basePrompt

  const proj = (projectContext ?? '').trim()
  if (proj) {
    prompt += `\n\nPROJECT CONTEXT (authoritative — follow these instructions and use attached reference files when answering):\n${proj}\n\n${GROUNDING_INSTRUCTION}`
  }

  const extra = (extraContext ?? '').trim()
  if (extra) {
    prompt += `\n\nEXTRA INSTRUCTIONS:\n${truncateWithNotice(extra, 4_000)}`
  }

  return prompt
}
