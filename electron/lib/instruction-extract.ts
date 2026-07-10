import Anthropic from '@anthropic-ai/sdk'

const EXTRACT_MODEL = 'claude-sonnet-4-6'

const EXTRACT_USER_TEXT =
  'Extract all instructional, policy, onboarding, or reference text visible in this screenshot. ' +
  'Output plain text only — no commentary. If no readable instructional text is visible, output nothing.'

/** One-shot vision call — extract onboarding/instruction text from a screenshot. */
export async function extractInstructionsFromScreenshot(base64: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY || ''
  if (!key || key === 'your_anthropic_api_key_here') {
    throw new Error('AI is not configured for screen extraction.')
  }

  const anthropic = new Anthropic({ apiKey: key })
  const response = await anthropic.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: base64 },
        },
        { type: 'text', text: EXTRACT_USER_TEXT },
      ],
    }],
  })

  const block = response.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text.trim() : ''
}
