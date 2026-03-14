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

export class LLMWorker {
  private ipcBus: IpcBus
  private client: Anthropic
  private cache: AnswerCache
  private isGenerating = false
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

    this.ipcBus.on('context:ready', this.contextHandler)
    this.ipcBus.on('overlay:regenerate', this.regenerateHandler)
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

      // Store in cache
      if (fullResponse) {
        await this.cache.set(questionText, questionType, fullResponse)
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
