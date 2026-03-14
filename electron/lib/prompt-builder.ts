import type { CandidateProfile, JobContext, CompanyContext, StyleContext } from './context-extractor.js'

/**
 * Prompt Builder — assembles layered system + user prompts from structured context.
 *
 * Smart context selection: each question type receives only the context slices
 * that matter for it, reducing token load and improving answer focus.
 *
 * Layer priority:
 *   PROFILE_CONTEXT  — always included (depth varies by question type)
 *   JOB_CONTEXT      — included for technical/coding/system-design; culture-only for behavioral
 *   COMPANY_CONTEXT  — included for system-design and general; brief for technical; skipped for coding
 *   STYLE_CONTEXT    — always included (small, high impact)
 */

type QuestionType = 'behavioral' | 'system-design' | 'technical' | 'coding' | 'general'

// Per-type answer format instructions injected into the system prompt
const TYPE_INSTRUCTIONS: Record<QuestionType, string> = {
  behavioral: `\nAnswer using the STAR method as 4 numbered points:
1. Situation: brief context of the scenario
2. Task: your specific responsibility
3. Action: 2-3 key decisions or steps you took
4. Result: quantified outcome
Lead with the most impressive result. Draw from behavioral strengths and experience highlights.`,

  'system-design': `\nAnswer as 4 numbered points:
1. Clarify: key requirements and constraints to establish
2. Scale: estimated load, bottlenecks, and failure modes
3. Architecture: core components, data flow, and storage choices
4. Tradeoffs: design decisions, alternatives considered, reliability concerns
Align recommendations with the company engineering scale and priorities.`,

  technical: `\nAnswer as a step-by-step explanation with a concrete example.
Include time and space complexity when relevant.
Reference your own experience where applicable.`,

  coding: `\nAnswer as 4 numbered points:
1. Approach: algorithm or data structure choice and why
2. Edge cases: inputs and boundary conditions to handle
3. Implementation: key logic steps or pseudocode
4. Complexity: time and space analysis
Use your known languages and tools.`,

  general: `\nAnswer with 3 to 5 numbered points. Lead with the direct answer, follow with supporting context.`,
}

/**
 * Builds the system prompt with smart context layer selection.
 */
export function buildSystemPrompt(
  type: QuestionType,
  profile: CandidateProfile,
  job: JobContext,
  company: CompanyContext,
  style: StyleContext,
  language?: string,
  extraContext?: string
): string {
  const sections: string[] = []

  // ── PROFILE CONTEXT ─────────────────────────────────────────────────────────
  if (type === 'behavioral') {
    // Full profile for behavioral — experience and soft skills are everything
    const highlights = profile.experience_highlights.length
      ? `Key achievements: ${profile.experience_highlights.join(' | ')}.`
      : ''
    const strengths = profile.behavioral_strengths.length
      ? `Behavioral strengths: ${profile.behavioral_strengths.join(', ')}.`
      : ''
    sections.push(
      `Candidate Profile:\n${profile.candidate_name} — ${profile.target_role}. ${highlights} ${strengths}`.trim()
    )
  } else {
    // For technical/coding/system-design: skills and role are what matter most
    const skills = profile.core_skills.length
      ? `Skills: ${profile.core_skills.join(', ')}.`
      : ''
    sections.push(
      `Candidate: ${profile.candidate_name}, ${profile.target_role}. ${skills}`.trim()
    )
    if (type === 'system-design' && profile.experience_highlights.length) {
      sections[sections.length - 1] +=
        ` Notable: ${profile.experience_highlights.slice(0, 2).join(' | ')}.`
    }
  }

  // ── JOB CONTEXT ─────────────────────────────────────────────────────────────
  if (type === 'behavioral') {
    // For behavioral: only culture keywords are relevant
    if (job.culture_keywords.length) {
      sections.push(`Company Culture Values: ${job.culture_keywords.join(', ')}.`)
    }
  } else {
    // For all other types: responsibilities + required skills
    const parts: string[] = []
    if (job.key_responsibilities.length) {
      parts.push(`Responsibilities: ${job.key_responsibilities.join('; ')}.`)
    }
    if (job.required_skills.length) {
      parts.push(`Required skills: ${job.required_skills.join(', ')}.`)
    }
    if (parts.length) {
      sections.push(`Target Role:\n${parts.join(' ')}`)
    }
  }

  // ── COMPANY CONTEXT ──────────────────────────────────────────────────────────
  if (type === 'system-design' || type === 'general') {
    // System design and general need full company context (scale, domain, engineering priorities)
    const focus = company.engineering_focus.length
      ? ` Engineering priorities: ${company.engineering_focus.join(', ')}.`
      : ''
    sections.push(`Company Context:\n${company.company_name} — ${company.domain}.${focus}`)
  } else if (type === 'technical') {
    // Technical: just enough company context to frame the answer
    sections.push(`Company: ${company.company_name}${company.domain ? ` (${company.domain})` : ''}.`)
  }
  // coding: skip company context entirely — focus purely on algorithmic thinking

  // ── STYLE CONTEXT ────────────────────────────────────────────────────────────
  const styleStr = style.style_preferences.join(', ')

  // ── ASSEMBLE ─────────────────────────────────────────────────────────────────
  const header = `You are ${profile.candidate_name}, a ${profile.target_role} candidate in a live professional interview.
Speak in first person (I, my, we) as if you are directly answering the interviewer out loud.
Draw only from the experience, skills, and achievements listed in your profile — do not invent anything not mentioned.
Only respond to explicit or clearly implicit questions. Treat interviewer statements as context only.`

  let prompt = `${header}\n\n${sections.join('\n\n')}\n\nAnswer Style: ${styleStr}.`
  prompt += TYPE_INSTRUCTIONS[type]

  if (language) {
    prompt += `\n\nCRITICAL: Respond entirely in ${language}.`
  }
  if (extraContext) {
    prompt += `\n\nEXTRA INSTRUCTIONS:\n${extraContext}`
  }

  return prompt
}

/**
 * Builds the user message (interviewer context + question).
 * Resume raw text is NOT included here — it's already distilled into the system prompt.
 */
export function buildUserMessage(
  question: string,
  contextWindow: string,
  _type: QuestionType,
  candidateName?: string
): string {
  const parts: string[] = []

  if (contextWindow) {
    parts.push(`INTERVIEWER CONTEXT (recent conversation):\n${contextWindow.substring(0, 2000)}`)
  }

  parts.push(`QUESTION:\n${question}`)
  const name = candidateName ? `${candidateName}` : 'the candidate'
  parts.push(`INSTRUCTION: Answer in first person as ${name} speaking directly to the interviewer. Use "I", "my", "we".`)

  return parts.join('\n\n')
}
