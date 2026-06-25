import Anthropic from '@anthropic-ai/sdk'
import {
  paraphraseLong as humanizerParaphrase,
  paraphraseAllModes as humanizerParaphraseAllModes,
  QUILLBOT_MODES,
  HumanizerError,
  getLastEngineError,
  setLastEngineError,
  clearLastEngineError,
  translateEngineError,
  type QuillbotMode,
} from './humanizer/index.js'

const CLAUDE_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 2200

// ── Engine ────────────────────────────────────────────────────────────────
// The hybrid humanizer (custom rules + Claude polish) is now the only engine.
// The legacy QuillBot browser-automation driver was removed in favour of our
// in-process rule catalog; the direct-Claude call below is kept solely as an
// internal fallback when the hybrid engine returns empty/unchanged output.

// ── Claude direct-call voices (internal fallback only) ────────────────────
// Each fan-out variant gets a different stylistic voice so even when the
// hybrid engine fails on a variant, the 5 base variants stay distinct.
const CLAUDE_VOICES = [
  'concise and direct, every sentence carries information, no filler',
  'casual conversational tone, contractions allowed, friendly explanations',
  'structured step-by-step, lead with the conclusion then justify it',
  'detailed and technical, precise terminology, formal sentence structure',
  'reflective first-person, sounds like someone reasoning out loud',
] as const

const ANTI_AI_RULES = `
- Do NOT use AI-tell phrases: "Furthermore", "Moreover", "It's important to note", "delve into", "in the realm of", "navigate the landscape", "elevate", "robust", "leverage", "synergy", "cutting-edge".
- Vary sentence length and structure — avoid the predictable medium-length pattern.
- Preserve every technical fact, formula, code block, number, and proper noun EXACTLY.
- Keep total length within ±15% of the original.
- Output ONLY the rewritten answer. No preamble, no quotes, no "Here is..." opener.`

function getClaudeClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    console.warn('[paraphrase] ANTHROPIC_API_KEY not configured')
    return null
  }
  return new Anthropic({ apiKey })
}

/**
 * Direct Claude rewrite — used as a last-resort fallback when the hybrid
 * engine returns empty/unchanged output. Kept intact as our known-good
 * rewriter so callers still get an answer rather than null whenever possible.
 *
 * On API failure the raw error is stashed in the shared engine-error tracker
 * (humanizer/index.ts) so the IPC layer can show the actual reason (credit
 * balance, missing key, …) to the renderer.
 */
async function rewriteWithClaude(answer: string, voice: string): Promise<string | null> {
  const client = getClaudeClient()
  if (!client) {
    setLastEngineError('ANTHROPIC_API_KEY not configured')
    return null
  }

  const prompt = `You are paraphrasing a real interview/assessment answer so it sounds like a different person wrote it.

Voice: ${voice}

Rules:${ANTI_AI_RULES}

ORIGINAL ANSWER:
${answer}`

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
    if (text) clearLastEngineError()
    return text || null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[paraphrase] Claude rewrite failed:', msg)
    setLastEngineError(msg)
    return null
  }
}

/**
 * Single-rewrite helper. Runs the hybrid humanizer (rule pass + LLM polish)
 * and on empty/unchanged output falls back to a direct Claude call so the
 * caller still gets an answer rather than null whenever possible.
 */
async function rewriteOnce(answer: string, opts: { mode: QuillbotMode; voice: string }): Promise<string | null> {
  try {
    const out = await humanizerParaphrase(answer, opts.mode, { voiceHint: opts.voice })
    const trimmed = out?.trim() ?? ''
    if (trimmed && trimmed !== answer.trim()) return trimmed
    throw new HumanizerError('empty-output', 'Hybrid engine returned empty or unchanged output')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[paraphrase] Hybrid engine failed (${msg}) — falling back to Claude`)
    return rewriteWithClaude(answer, opts.voice)
  }
}

/**
 * Map each QuillBot mode name to a Claude voice that gives a similar feel.
 * Used as the polish-step voice hint for the hybrid engine and the voice
 * for the Claude fallback path so the 5 base variants stay distinct.
 */
const MODE_TO_CLAUDE_VOICE: Record<QuillbotMode, string> = {
  Standard: CLAUDE_VOICES[0],
  Fluency:  CLAUDE_VOICES[1],
  Formal:   CLAUDE_VOICES[3],
  Simple:   CLAUDE_VOICES[2],
  Creative: CLAUDE_VOICES[4],
  Humanize: 'natural human voice — small wording shifts, contractions ok, keep meaning identical',
}

/**
 * On-demand rewrite of a user-highlighted snippet (Solved Assessment selection menu).
 *
 * The 'humanize-strong' mode chains two passes: first a Humanize rewrite to
 * strip AI-tell phrases and informalise the text, then a Standard paraphrase
 * over the already-humanized output. This mirrors QuillBot's "Re-rephrase"
 * affordance — after Humanize alone often leaves the AI-detection score
 * around 50%, running a second paraphrase pass with different synonyms
 * pushes it further down.
 *
 * When both the rule pass and the Claude fallback fail (e.g. low credit
 * balance, missing API key), throws an Error whose message has already been
 * translated into actionable guidance for the renderer to display directly.
 */
export async function rewriteSelection(
  text: string,
  mode: 'paraphrase' | 'humanize' | 'humanize-strong',
): Promise<string | null> {
  // Reset the shared engine-error tracker so we only surface errors from
  // THIS rewrite invocation, not a stale one from a previous call.
  clearLastEngineError()

  let result: string | null
  if (mode === 'humanize-strong') {
    const humanized = await rewriteOnce(text, {
      mode: 'Humanize',
      voice: MODE_TO_CLAUDE_VOICE.Humanize,
    })
    if (!humanized?.trim()) {
      result = null
    } else {
      const rephrased = await rewriteOnce(humanized, {
        mode: 'Standard',
        voice: MODE_TO_CLAUDE_VOICE.Standard,
      })
      // If the second pass fails, return the first-pass humanized text rather
      // than dropping the user's rewrite entirely.
      result = rephrased?.trim() ? rephrased : humanized
    }
  } else {
    const quillbotMode: QuillbotMode = mode === 'humanize' ? 'Humanize' : 'Standard'
    result = await rewriteOnce(text, {
      mode: quillbotMode,
      voice: MODE_TO_CLAUDE_VOICE[quillbotMode],
    })
  }

  if (result?.trim() && result.trim() !== text.trim()) return result

  // Both passes failed or produced no real change — surface the actual reason
  // to the renderer instead of returning null with a misleading generic message.
  const raw = getLastEngineError()
  if (raw) {
    throw new Error(translateEngineError(raw))
  }
  // No engine error captured but result is empty/unchanged — the selection
  // simply didn't match any rules and no LLM polish was attempted.
  throw new Error('No transformations matched the selected text. Try a larger selection that contains AI-tell phrases, or configure ANTHROPIC_API_KEY for LLM-powered rewrites.')
}

/**
 * Generate the 5 base variants stored on each solved_questions row at import.
 * Failures are best-effort: any variant that fails is dropped from the array.
 *
 * Runs the hybrid engine's bulk path; any mode that returns empty falls back
 * to a per-mode direct Claude call so we still hand back 5 variants.
 */
export async function generateBaseVariants(answer: string): Promise<string[]> {
  if (!answer.trim()) return []

  try {
    const results = await humanizerParaphraseAllModes(answer)
    const texts = results.map((r) => r.text.trim()).filter(Boolean)
    if (texts.length === QUILLBOT_MODES.length) return texts
    console.warn(`[paraphrase] Hybrid returned ${texts.length}/${QUILLBOT_MODES.length} variants — filling remainder with Claude`)
    const missingModes = QUILLBOT_MODES.filter(
      (mode) => !results.some((r) => r.mode === mode && r.text.trim().length > 0),
    )
    const filled = await Promise.all(
      missingModes.map((mode) => rewriteWithClaude(answer, MODE_TO_CLAUDE_VOICE[mode])),
    )
    return [...texts, ...filled.filter((t): t is string => !!t && t.length > 0)]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[paraphrase] Hybrid bulk failed (${msg}) — using Claude for all 5 variants`)
    const results = await Promise.all(
      QUILLBOT_MODES.map((mode) => rewriteWithClaude(answer, MODE_TO_CLAUDE_VOICE[mode])),
    )
    return results.filter((t): t is string => !!t && t.length > 0)
  }
}

/**
 * Pick one of the 5 base variants deterministically for a given user, then
 * paraphrase it once more so this specific user's view differs from anyone
 * else who landed on the same base.
 */
export async function personaliseForUser(params: {
  variants: string[]
  fallbackAnswer: string
  userId: string
  questionId: string
}): Promise<{ text: string; baseIdx: number } | null> {
  const pool = params.variants.length ? params.variants : [params.fallbackAnswer]
  // Stable hash of (userId + questionId) → index. djb2-ish for determinism
  // without bringing in a hash library to the main process.
  let h = 5381
  const key = params.userId + ':' + params.questionId
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0
  const baseIdx = Math.abs(h) % pool.length
  const base = pool[baseIdx]
  const personalised = await rewriteOnce(base, {
    mode: 'Standard',
    voice: 'natural human voice — small wording shifts, keep the meaning identical',
  })
  if (!personalised) return { text: base, baseIdx }
  return { text: personalised, baseIdx }
}
