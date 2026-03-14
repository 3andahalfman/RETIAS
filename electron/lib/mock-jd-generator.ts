import Anthropic from '@anthropic-ai/sdk'

/**
 * Mock JD Generator — generates a realistic job description from a resume.
 * Used for mock interview mode so the user only needs to upload their resume.
 */
export async function generateMockJobDescription(resumeText: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const prompt = `You are a senior recruiter. Based on the candidate's resume below, generate a realistic and detailed job description for a role they would naturally apply to.

RESUME:
${resumeText.substring(0, 3000)}

Generate a complete job description that includes:
1. A plausible company name and one-sentence company description
2. Job title that matches the candidate's experience level and field
3. 4-6 key responsibilities aligned to the candidate's background
4. 5-7 required skills drawn from what the candidate actually has
5. 3-4 culture/values keywords

Format it as a clean job posting (no JSON, no code fences, just plain text).
Be specific and realistic — this will be used to coach the candidate in a mock interview.`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return text.trim()
}
