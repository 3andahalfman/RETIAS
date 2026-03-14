import Anthropic from '@anthropic-ai/sdk'
import crypto from 'node:crypto'

/**
 * Context Extractor — one-time Claude call at session start.
 *
 * Converts raw resume + job description into compact structured JSON that the
 * PromptBuilder uses instead of dumping raw text into every LLM call.
 */

export interface CandidateProfile {
  candidate_name: string
  target_role: string
  core_skills: string[]
  experience_highlights: string[]
  behavioral_strengths: string[]
}

export interface JobContext {
  key_responsibilities: string[]
  required_skills: string[]
  culture_keywords: string[]
}

export interface CompanyContext {
  company_name: string
  domain: string
  engineering_focus: string[]
}

export interface StyleContext {
  style_preferences: string[]
}

export interface ExtractedContext {
  profile: CandidateProfile
  job: JobContext
  company: CompanyContext
  style: StyleContext
}

/** Stable hash for caching — changes only if inputs change */
export function makeSessionHash(
  resumeText: string,
  jobDescription: string,
  company: string,
  extraContext: string
): string {
  const input = [resumeText, jobDescription, company, extraContext].join('\x00')
  return crypto.createHash('sha256').update(input).digest('hex')
}

export async function extractContext(
  resumeText: string,
  jobDescription: string,
  company: string,
  extraContext: string
): Promise<ExtractedContext> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const prompt = `Extract structured context from the candidate and job info below.
Return ONLY a valid JSON object — no markdown, no explanation, no code fences.

RESUME:
${resumeText.substring(0, 3000)}

JOB DESCRIPTION:
${jobDescription.substring(0, 2000)}

COMPANY: ${company || 'Unknown'}

EXTRA INSTRUCTIONS: ${extraContext || 'None'}

Required JSON shape (fill all arrays with real extracted values, not placeholders):
{
  "profile": {
    "candidate_name": "full name from resume or 'Candidate'",
    "target_role": "job title being applied for",
    "core_skills": ["top 6-8 technical skills from resume"],
    "experience_highlights": ["3-5 achievements with metrics where available"],
    "behavioral_strengths": ["3-5 soft skills evident from resume"]
  },
  "job": {
    "key_responsibilities": ["3-5 main responsibilities from JD"],
    "required_skills": ["top 5-7 skills the role requires"],
    "culture_keywords": ["3-5 culture or values keywords from JD"]
  },
  "company": {
    "company_name": "${company || 'the company'}",
    "domain": "one sentence on what the company does",
    "engineering_focus": ["2-4 engineering priorities evident from JD"]
  },
  "style": {
    "style_preferences": ["derive from extra instructions; default to concise, structured bullets, confident tone"]
  }
}`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  // Strip any accidental markdown code fences
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  try {
    return JSON.parse(jsonText) as ExtractedContext
  } catch {
    // Fallback: minimal profile so the session still works
    console.error('[ContextExtractor] JSON parse failed, using minimal fallback')
    return {
      profile: {
        candidate_name: 'Candidate',
        target_role: company ? `Engineer at ${company}` : 'Software Engineer',
        core_skills: [],
        experience_highlights: [],
        behavioral_strengths: [],
      },
      job: { key_responsibilities: [], required_skills: [], culture_keywords: [] },
      company: { company_name: company || 'the company', domain: '', engineering_focus: [] },
      style: { style_preferences: ['concise', 'structured bullets', 'confident tone'] },
    }
  }
}
