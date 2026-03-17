import Anthropic from '@anthropic-ai/sdk'
import { IpcBus } from '../ipc-bus.js'
import { AnswerCache } from '../lib/cache.js'

/**
 * LLM Worker — Phase 6
 *
 * 1. Checks SQLite cache first (SHA-256 hash of normalized question)
 * 2. Cache hit → emit tokens instantly (~100ms)
 * 3. Cache miss → stream from Claude, store result when done
 * 4. On question:update (compound question continuation) → abort current stream + restart
 */

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 400

function getScreenAnalysisPrompt(testType: string | null): string {
  const FORMAT = `
FORMAT RULES (follow exactly):
- Never open with pleasantries or clarifying questions. Go straight to the solution.
- Structure every answer: working/explanation first → final answer clearly labelled at the end.
- Use LaTeX for all mathematical expressions — inline with $...$ and block with $$...$$
- Be thorough and precise. Solve every question visible on the screen.`

  switch (testType) {
    case 'english':
      return `You are an expert English language tutor and examiner.
Analyse the screen and answer every English/verbal question shown.
- Grammar questions: identify the error, explain the rule, give the correct version.
- Comprehension: quote the relevant passage, then answer directly.
- Verbal reasoning: explain your logic step by step before selecting the answer.
- Sentence completion: provide the best word/phrase with a brief justification.${FORMAT}`

    case 'coding':
      return `You are a senior software engineer and competitive programmer.
Analyse the screen and solve every coding problem shown.
- Explain your algorithm and data structure choice first.
- Write clean, working code with comments on key lines.
- State time and space complexity.
- Handle edge cases explicitly.
- If multiple languages are valid, prefer the one shown or use Python.${FORMAT}`

    case 'ai-ml':
      return `You are a machine learning researcher and data scientist.
Analyse the screen and answer every AI/ML question shown.
- Conceptual questions: clear definition + intuitive explanation + formula if applicable.
- Maths/statistics: full derivation with LaTeX.
- Model evaluation: interpret metrics precisely (precision, recall, AUC, etc.).
- Code questions: explain and fix/complete the ML code shown.${FORMAT}`

    case 'numerical':
      return `You are a numerical reasoning and aptitude test expert.
Analyse the screen and solve every numerical question shown.
- Show every arithmetic step — do not skip working.
- For number series: identify the pattern rule explicitly before giving the next term.
- For data interpretation: read the chart/table carefully, then compute.
- For ratio/percentage/speed problems: state the formula used, substitute values, simplify.${FORMAT}`

    case 'technical':
      return `You are a senior technical expert across engineering, science, and technology domains.
Analyse the screen and answer every technical question shown.
- Provide precise, factual answers grounded in established technical knowledge.
- For calculations: show step-by-step working with units.
- For conceptual questions: explain mechanism/principle, then give practical implications.
- Diagrams described in text: explain component-by-component.${FORMAT}`

    case 'onboarding':
      return `You are a compliance, HR, and corporate policy expert.
Analyse the screen and answer every onboarding or compliance question shown.
- For multiple-choice: select the correct option and explain why it is the policy-compliant answer.
- For open questions: summarise the key policy intent in plain language.
- For scenarios: apply the relevant policy principle to the specific situation described.
- Keep answers professional and aligned with best-practice workplace standards.${FORMAT}`

    default:
      if (testType?.startsWith('role:')) {
        const role = testType.slice(5)
        return `You are a ${role} with deep domain expertise.
Analyse the screen and answer every question shown from the perspective of an experienced ${role}.
- Apply domain-specific knowledge, terminology, and best practices for this role.
- For technical questions: show your working and explain the reasoning.
- For conceptual questions: give precise, expert-level answers without unnecessary padding.
- For calculations: include units, formulas, and step-by-step workings.${FORMAT}`
      }
      return `You are an expert technical assistant. Analyse the screen and solve every question shown.
${FORMAT}`
  }
}

export class LLMWorker {
  private ipcBus: IpcBus
  private client: Anthropic
  private cache: AnswerCache
  private isGenerating = false
  private sessionTestType: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private currentStream: any = null
  private lastContext: { systemPrompt: string; userMessage: string; questionText: string; questionType: string } | null = null

  // Stored handler references for proper cleanup
  private contextHandler: ((systemPrompt: string, userMessage: string, questionText: string, questionType: string) => void) | null = null
  private regenerateHandler: (() => void) | null = null

  constructor(ipcBus: IpcBus) {
    this.ipcBus = ipcBus

    const apiKey = process.env.ANTHROPIC_API_KEY || ''
    if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
      console.error('[LLMWorker] ❌ ANTHROPIC_API_KEY is missing or placeholder!')
    } else {
      console.log(`[LLMWorker] ✅ API key loaded (sk-ant-...${apiKey.slice(-6)})`)
    }

    this.client = new Anthropic({ apiKey })

    this.cache = new AnswerCache()

    this.contextHandler = (systemPrompt: string, userMessage: string, questionText: string, questionType: string) => {
      this.generate(systemPrompt, userMessage, questionText, questionType)
    }

    this.regenerateHandler = () => {
      if (!this.lastContext || this.isGenerating) {
        console.log('[LLMWorker] Regenerate: no context stored or already generating')
        return
      }
      console.log('[LLMWorker] Regenerating last answer (skip cache)')
      const { systemPrompt, userMessage, questionText, questionType } = this.lastContext
      this.generate(systemPrompt, userMessage, questionText, questionType, true)
    }

    this.ipcBus.on('session:started', (config: { testType?: string }) => {
      this.sessionTestType = config?.testType ?? null
    })
    this.ipcBus.on('session:stopped', () => {
      this.sessionTestType = null
    })
    this.ipcBus.on('context:ready', this.contextHandler)
    this.ipcBus.on('overlay:regenerate', this.regenerateHandler)
    this.ipcBus.on('screen:analyse', (base64Image: string) => this.analyseScreen(base64Image))
  }

  /** Abort the active stream if one is running, returns true if aborted */
  private abortCurrent(): boolean {
    if (this.isGenerating && this.currentStream) {
      console.log('[LLMWorker] Aborting current stream for refresh...')
      this.currentStream.abort()
      this.currentStream = null
      this.isGenerating = false
      return true
    }
    return false
  }

  private async generate(
    systemPrompt: string,
    userMessage: string,
    questionText: string,
    questionType: string,
    skipCache = false
  ) {
    // If already generating, abort the current stream and restart with new context
    if (this.isGenerating) {
      this.abortCurrent()
    }

    // Store context for potential regenerate
    this.lastContext = { systemPrompt, userMessage, questionText, questionType }

    // Check cache first (skipped on regenerate)
    const cached = skipCache ? null : await this.cache.get(questionText, questionType)
    if (cached) {
      console.log('[LLMWorker] Cache hit!')
      // Simulate token streaming for consistent UI experience
      this.streamFakeTokens(cached)
      return
    }

    this.isGenerating = true
    let fullResponse = ''

    try {
      console.log('[LLMWorker] Calling Claude...')
      const stream = this.client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      this.currentStream = stream

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const token = event.delta.text
          fullResponse += token
          this.ipcBus.emit('llm:token', token)
        }
      }

      this.ipcBus.emit('llm:done')

      // Store in cache and broadcast completed answer for conversation history
      if (fullResponse) {
        await this.cache.set(questionText, questionType, fullResponse)
        this.ipcBus.emit('answer:complete', questionText, questionType, fullResponse)
      }
    } catch (err: any) {
      // If aborted (for a refresh), silently discard — new generation will follow
      const isAbort = err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort') || err?.status === 'user_abort'
      if (isAbort) {
        console.log('[LLMWorker] Stream aborted for refresh — new generation pending')
        return
      }
      const status  = err?.status ?? err?.statusCode ?? 'unknown'
      const message = err?.message ?? String(err)
      const errType = err?.error?.type ?? ''
      console.error(`[LLMWorker] Claude error ${status} ${errType}: ${message}`)
      this.ipcBus.emit('llm:token', `\n\n⚠️ Error generating answer (${status}: ${errType || message})`)
      this.ipcBus.emit('llm:done')
    } finally {
      this.currentStream = null
      this.isGenerating = false
    }
  }

  private async analyseScreen(base64Image: string) {
    if (this.isGenerating) this.abortCurrent()

    const questionText = 'Screen Analysis'
    const questionType = 'general'

    // Use screen:card (not question:detected) so context-builder doesn't treat this
    // as an interview question and overwrite the vision API answer with a CV-profile answer
    this.ipcBus.emit('screen:card', questionText, questionType)

    this.isGenerating = true
    let fullResponse = ''

    try {
      console.log('[LLMWorker] Analysing screen with vision...')
      const stream = this.client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: getScreenAnalysisPrompt(this.sessionTestType),
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: base64Image },
            },
            { type: 'text', text: 'Solve all questions shown on this screen.' },
          ],
        }],
      })
      this.currentStream = stream

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const token = event.delta.text
          fullResponse += token
          this.ipcBus.emit('llm:token', token)
        }
      }

      this.ipcBus.emit('llm:done')

      if (fullResponse) {
        await this.cache.set(questionText + '_screen_' + Date.now(), questionType, fullResponse)
      }
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')
      if (!isAbort) {
        console.error('[LLMWorker] Screen analysis error:', err?.message)
        this.ipcBus.emit('llm:token', '\n\n⚠️ Screen analysis failed. Please try again.')
        this.ipcBus.emit('llm:done')
      }
    } finally {
      this.currentStream = null
      this.isGenerating = false
    }
  }

  private streamFakeTokens(text: string) {
    // Emit cached answer in small chunks to keep UI animation consistent
    const words = text.split(' ')
    let i = 0
    const interval = setInterval(() => {
      if (i >= words.length) {
        clearInterval(interval)
        this.ipcBus.emit('llm:done')
        return
      }
      this.ipcBus.emit('llm:token', (i === 0 ? '' : ' ') + words[i])
      i++
    }, 5) // 5ms per word chunk — fast playback for cached answers
  }

  stop() {
    this.abortCurrent()
    if (this.contextHandler) {
      this.ipcBus.removeListener('context:ready', this.contextHandler)
      this.contextHandler = null
    }
    if (this.regenerateHandler) {
      this.ipcBus.removeListener('overlay:regenerate', this.regenerateHandler)
      this.regenerateHandler = null
    }
  }
}
