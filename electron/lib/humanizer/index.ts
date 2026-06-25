/**
 * Hybrid humanizer / paraphraser engine — public API.
 *
 * Two-stage pipeline:
 *   1. Deterministic rule pass (rules.ts) — fast, free, ~80% of the lift.
 *   2. Optional LLM polish step (Claude Sonnet 4.6) — uses captured QuillBot
 *      exemplars (exemplars.ts) as few-shot guidance to fix anything the
 *      rules couldn't and add human texture (asides, sentence splits, etc.).
 *
 * The export surface intentionally mirrors quillbot-paraphrase.ts so the
 * caller in paraphrase.ts can swap imports without changing call sites:
 *   - paraphrase()             ← single-text rewrite for any mode
 *   - paraphraseLong()         ← long text with code/math passthrough
 *   - paraphraseAllModes()     ← 5-mode fan-out for base variants
 *   - QUILLBOT_MODES, QuillbotMode, QuillbotError ← back-compat aliases
 *
 * New surface:
 *   - humanize()               ← convenience alias for mode='Humanize'
 *   - HumanizerError           ← canonical name, re-exported as QuillbotError
 */
import { applyHumanizerRules, type HumanizerMode } from './rules.js'
import { buildPolishPrompt } from './exemplars.js'

// ── Back-compat type aliases ──────────────────────────────────────────────
// The legacy code uses capital-first mode names ("Standard", "Humanize", …).
// Our internal mode names (rules.ts) are lowercase. Map between them so
// callers don't have to rename.

export type QuillbotMode = 'Standard' | 'Fluency' | 'Formal' | 'Simple' | 'Creative' | 'Humanize'
export const QUILLBOT_MODES: readonly QuillbotMode[] = [
  'Standard', 'Fluency', 'Formal', 'Simple', 'Creative',
] as const

const QUILLBOT_TO_HUMANIZER: Record<QuillbotMode, HumanizerMode> = {
  Standard: 'standard',
  Fluency:  'fluency',
  Formal:   'formal',
  Simple:   'simple',
  Creative: 'creative',
  Humanize: 'humanize',
}

/**
 * Errors raised from the engine. The `kind` matches the shape of
 * QuillbotError so any existing `instanceof QuillbotError` checks keep
 * working after the import swap.
 */
export class HumanizerError extends Error {
  constructor(
    public kind: 'no-api-key' | 'api-failure' | 'empty-output' | 'unknown' | 'no-window' | 'load-timeout' | 'selector-missing' | 'output-timeout' | 'needs-login',
    message: string,
  ) {
    super(message)
    this.name = 'HumanizerError'
  }
}
/** Back-compat alias for the legacy QuillbotError import. */
export const QuillbotError = HumanizerError

// ── Code / math passthrough ───────────────────────────────────────────────
// Identical contract to quillbot-paraphrase: code fences and $$ math blocks
// pass through untouched. Whitespace between blocks is preserved so the
// reassembled text matches the input layout.

interface Chunk { kind: 'prose' | 'verbatim'; text: string }

function splitForHumanizer(text: string): Chunk[] {
  const chunks: Chunk[] = []
  const parts = text.split(/(```[\s\S]*?```)/g)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('```')) {
      chunks.push({ kind: 'verbatim', text: part })
      continue
    }
    const mathParts = part.split(/(\$\$[\s\S]*?\$\$)/g)
    for (const m of mathParts) {
      if (!m) continue
      if (m.startsWith('$$')) chunks.push({ kind: 'verbatim', text: m })
      else if (!m.trim()) chunks.push({ kind: 'verbatim', text: m })
      else chunks.push({ kind: 'prose', text: m })
    }
  }
  return chunks
}

function joinChunks(chunks: readonly Chunk[], proseTexts: readonly string[]): string {
  let proseIdx = 0
  return chunks
    .map((c) => (c.kind === 'verbatim' ? c.text : proseTexts[proseIdx++]))
    .join('')
}

// ── LLM polish step ───────────────────────────────────────────────────────

const CLAUDE_MODEL = 'claude-sonnet-4-6'
const POLISH_MAX_TOKENS = 2400
/**
 * If a single prose chunk exceeds this word count we still polish it; Claude
 * handles up to ~200k tokens. The threshold exists only as a sanity guard
 * for the polish prompt's exemplar context (~500 words on top of the draft).
 */
const POLISH_MAX_WORDS_PER_CALL = 4000

function getAnthropicKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || key === 'your_anthropic_api_key_here') return null
  return key
}

// ── Shared engine error tracker ───────────────────────────────────────────
// Both the polish step (here) and the Claude direct-call fallback (in
// paraphrase.ts) update this tracker on failure. The IPC layer reads it when
// the engine returns null so the renderer sees the actual reason (credit
// balance, missing API key, etc.) instead of a stale generic message.
let _lastEngineError: string | null = null

export function getLastEngineError(): string | null { return _lastEngineError }
export function setLastEngineError(err: unknown): void {
  _lastEngineError = err instanceof Error ? err.message : String(err)
}
export function clearLastEngineError(): void { _lastEngineError = null }

/**
 * Translate raw Anthropic SDK error strings into user-facing messages.
 * Anthropic errors arrive as "400 {"type":"error","error":{"message":"..."}}".
 * Extract the inner message and rewrite the most common ones into actionable
 * guidance.
 */
export function translateEngineError(raw: string): string {
  // Try to parse out the Anthropic error JSON.
  const m = raw.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      const obj = JSON.parse(m[0])
      const inner = obj?.error?.message
      if (typeof inner === 'string') {
        if (/credit balance/i.test(inner)) {
          return 'Anthropic API credit balance is too low. Top up at https://console.anthropic.com/settings/billing to enable rewrites.'
        }
        if (/rate limit/i.test(inner)) {
          return 'Anthropic API rate-limited. Wait a few seconds and try again.'
        }
        if (/invalid.*api.*key|authentication/i.test(inner)) {
          return 'Anthropic API key is invalid. Check ANTHROPIC_API_KEY in your environment.'
        }
        return `Anthropic API: ${inner}`
      }
    } catch { /* not JSON — fall through */ }
  }
  if (/ANTHROPIC_API_KEY/.test(raw)) {
    return 'ANTHROPIC_API_KEY is not configured. Add it to your .env file at the project root and restart the app.'
  }
  return raw
}

async function polishWithLLM(opts: {
  mode: HumanizerMode
  draft: string
  original?: string
  voiceHint?: string
}): Promise<string | null> {
  const apiKey = getAnthropicKey()
  if (!apiKey) {
    setLastEngineError('ANTHROPIC_API_KEY not configured')
    return null
  }

  // Bail on absurdly long single chunks so we don't pay for one runaway call.
  const wc = opts.draft.split(/\s+/).filter(Boolean).length
  if (wc > POLISH_MAX_WORDS_PER_CALL) {
    console.warn(`[humanizer] skip polish — chunk too long (${wc} words)`)
    return null
  }

  const prompt = buildPolishPrompt(opts)
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: POLISH_MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
    if (text) {
      // Polish succeeded — clear any stale error from a previous failed call
      // (e.g. one mode succeeded after another hit a transient rate-limit).
      clearLastEngineError()
    }
    return text || null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[humanizer] polish failed:', msg)
    setLastEngineError(msg)
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export interface ParaphraseOptions {
  /**
   * Skip the LLM polish step. The rule-only path is free, fast, and offline,
   * but will not introduce sentence splits / casual asides on its own.
   * Default: false when ANTHROPIC_API_KEY is configured, true otherwise.
   */
  rulesOnly?: boolean
  /**
   * Free-form voice hint passed to the LLM polish prompt. Preserves the
   * 5-voices fan-out pattern used by generateBaseVariants in paraphrase.ts.
   */
  voiceHint?: string
}

/**
 * Single-text rewrite. Honors code/math passthrough, runs rules per prose
 * chunk, then optionally polishes each via Claude. Output preserves the
 * original document layout (paragraph spacing, verbatim blocks in place).
 */
export async function paraphrase(
  text: string,
  mode: QuillbotMode = 'Standard',
  opts: ParaphraseOptions = {},
): Promise<string> {
  if (!text.trim()) return text
  const humanizerMode = QUILLBOT_TO_HUMANIZER[mode]

  // 1. Rule pass on every prose chunk.
  const chunks = splitForHumanizer(text)
  const proseChunks = chunks.filter((c) => c.kind === 'prose')
  const draftProse = proseChunks.map((c) => applyHumanizerRules(c.text, humanizerMode))

  // 2. Polish — controlled by env + caller opt-out.
  const wantPolish = opts.rulesOnly !== true && !!getAnthropicKey()
  let finalProse: string[] = draftProse
  if (wantPolish && draftProse.length > 0) {
    finalProse = await Promise.all(
      draftProse.map(async (draft, i) => {
        const polished = await polishWithLLM({
          mode: humanizerMode,
          draft,
          original: proseChunks[i].text,
          voiceHint: opts.voiceHint,
        })
        return polished ?? draft
      }),
    )
  }

  // 3. Reassemble preserving the original whitespace + verbatim blocks.
  const out = joinChunks(chunks, finalProse)
  if (!out.trim()) {
    throw new HumanizerError('empty-output', 'Engine produced empty output')
  }
  return out
}

/**
 * Long-form rewrite. Today identical to `paraphrase` since rules don't have
 * a length limit and the polish step internally guards single-chunk size.
 * Kept as a separate export for source-compat with quillbot-paraphrase.ts.
 */
export async function paraphraseLong(
  text: string,
  mode: QuillbotMode = 'Standard',
  opts?: ParaphraseOptions,
): Promise<string> {
  return paraphrase(text, mode, opts)
}

/**
 * Generate one rewrite per non-Humanize mode in sequence. Matches the
 * QuillbotMode ordering used by paraphrase.ts.generateBaseVariants so the
 * caller can keep its existing zip-with-Claude fallback logic.
 */
export async function paraphraseAllModes(
  text: string,
  opts?: ParaphraseOptions,
): Promise<Array<{ mode: QuillbotMode; text: string }>> {
  const results: Array<{ mode: QuillbotMode; text: string }> = []
  for (const mode of QUILLBOT_MODES) {
    try {
      const out = await paraphrase(text, mode, opts)
      results.push({ mode, text: out })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[humanizer] mode ${mode} failed: ${msg}`)
      // Keep going — partial results are still useful upstream.
    }
  }
  return results
}

/**
 * Convenience wrapper for `paraphrase(text, 'Humanize')`. Provided as a
 * top-level export so callers wanting just the humanize feature don't need
 * to know the mode-name vocabulary.
 */
export async function humanize(text: string, opts?: ParaphraseOptions): Promise<string> {
  return paraphrase(text, 'Humanize', opts)
}

// Re-export the rule-pass primitives so other modules can reach them
// without depending on rules.ts directly. (rules.ts has no Electron deps,
// so this is purely an ergonomic re-export.)
export { applyHumanizerRules, type HumanizerMode } from './rules.js'
