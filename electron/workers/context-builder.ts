import { IpcBus, SessionConfig } from '../ipc-bus.js'
import { extractContext, makeSessionHash, ExtractedContext } from '../lib/context-extractor.js'
import { storeProfile, loadProfile } from '../lib/profile-store.js'
import { buildSystemPrompt, buildUserMessage } from '../lib/prompt-builder.js'

/**
 * Context Builder — Phase 5 (Persistent Profile Context)
 *
 * At session start:
 *   1. Hash (resume + JD + company + extraContext)
 *   2. SQLite cache hit → load structured profile instantly
 *   3. Cache miss → call Claude once to extract structured JSON, store it
 *
 * At question time:
 *   - Await extraction (already done ~99% of the time)
 *   - Build layered prompt via PromptBuilder (smart context selection per question type)
 *   - Fall back to legacy raw-text prompt if extraction failed
 */

type QuestionType = 'behavioral' | 'system-design' | 'technical' | 'coding' | 'general'

export class ContextBuilder {
  private ipcBus: IpcBus
  private sessionConfig: SessionConfig | null = null

  private extractedContext: ExtractedContext | null = null
  private extractionPromise: Promise<void> | null = null

  // Rolling conversation history — last 2 Q&A pairs for follow-up context
  private answerHistory: { question: string; answer: string }[] = []

  // Stored handler references for proper cleanup
  private sessionHandler: ((config: SessionConfig) => void) | null = null
  private questionHandler: ((question: string, type: QuestionType, context: string) => void) | null = null
  private updateHandler: ((question: string, type: QuestionType, context: string) => void) | null = null
  private answerHandler: ((question: string, _type: string, answer: string) => void) | null = null

  constructor(ipcBus: IpcBus) {
    this.ipcBus = ipcBus

    this.sessionHandler = (config: SessionConfig) => {
      this.sessionConfig = config
      this.extractedContext = null
      this.extractionPromise = this.runExtraction(config)
      this.answerHistory = []
    }

    this.questionHandler = (question: string, type: QuestionType, context: string) => {
      this.buildAndEmit(question, type, context).catch(console.error)
    }

    // question:update fires when a compound question continuation arrives —
    // same processing as question:detected but signals LLMWorker to abort + refresh
    this.updateHandler = (question: string, type: QuestionType, context: string) => {
      this.buildAndEmit(question, type, context).catch(console.error)
    }

    this.answerHandler = (question: string, _type: string, answer: string) => {
      this.answerHistory = [...this.answerHistory, { question, answer }].slice(-2)
    }

    this.ipcBus.on('session:started', this.sessionHandler)
    this.ipcBus.on('question:detected', this.questionHandler)
    this.ipcBus.on('question:update', this.updateHandler)
    this.ipcBus.on('answer:complete', this.answerHandler)
  }

  /** Runs extraction async at session start — result stored for question-time use */
  private async runExtraction(config: SessionConfig): Promise<void> {
    if (!config.resumeText || !config.jobDescription) {
      console.log('[ContextBuilder] No resume/JD provided — skipping extraction')
      return
    }

    const hash = makeSessionHash(
      config.resumeText,
      config.jobDescription,
      config.company || '',
      config.extraContext || ''
    )

    // Try SQLite cache first
    const cached = await loadProfile(hash)
    if (cached) {
      this.extractedContext = cached
      console.log(`[ContextBuilder] Loaded cached profile for ${cached.profile.candidate_name}`)
      return
    }

    // Cache miss — call Claude once
    console.log('[ContextBuilder] Extracting candidate profile (one-time)...')
    try {
      const ctx = await extractContext(
        config.resumeText,
        config.jobDescription,
        config.company || '',
        config.extraContext || ''
      )
      await storeProfile(hash, ctx)
      this.extractedContext = ctx
      console.log(`[ContextBuilder] Profile extracted: ${ctx.profile.candidate_name} — ${ctx.profile.target_role}`)
      console.log(`[ContextBuilder] Skills: ${ctx.profile.core_skills.join(', ')}`)
    } catch (err) {
      console.error('[ContextBuilder] Extraction failed — will use legacy fallback:', err)
    }
  }

  private async buildAndEmit(question: string, type: QuestionType, contextWindow: string) {
    // Wait for extraction to finish — give it max 300ms, then fall through to legacy immediately
    if (this.extractionPromise) {
      await Promise.race([
        this.extractionPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 300)),
      ])
    }

    const config = this.sessionConfig
    let systemPrompt: string
    let userMessage: string

    if (this.extractedContext) {
      // ── Structured path (normal) ──────────────────────────────────────────
      const { profile, job, company, style } = this.extractedContext
      systemPrompt = buildSystemPrompt(type, profile, job, company, style, config?.language, config?.extraContext)
      userMessage = buildUserMessage(question, contextWindow, type, profile.candidate_name, this.answerHistory)
    } else {
      // ── Legacy fallback (extraction failed or no resume/JD provided) ──────
      systemPrompt = this.buildLegacySystemPrompt(type, config)
      userMessage = this.buildLegacyUserMessage(question, contextWindow, config)
    }

    this.ipcBus.emit('context:ready', systemPrompt, userMessage, question, type)
    console.log('[ContextBuilder] Context assembled for:', question.substring(0, 60))
  }

  // ── Legacy prompt builders (fallback only) ──────────────────────────────────

  private buildLegacySystemPrompt(type: QuestionType, config: SessionConfig | null): string {
    const role = config?.targetRole || 'software engineer'
    const company = config?.company || 'the company'

    let prompt = `You are assisting a candidate in an interview for a ${role} position at ${company}.
Only generate an answer to the question. Do not respond to statements.
Give CONCISE, ACTIONABLE answers. Maximum 5 points.
Use the candidate's resume context when relevant. Be specific — no filler phrases.`

    const typeInstructions: Record<QuestionType, string> = {
      behavioral: `\nAnswer using STAR as 4 numbered points: 1. Situation 2. Task 3. Action 4. Result. Lead with the most impressive result.`,
      'system-design': `\nAnswer as 4 numbered points: 1. Clarify requirements 2. Scale and bottlenecks 3. Architecture and data flow 4. Tradeoffs and alternatives.`,
      technical: `\nAnswer as a step-by-step explanation with a concrete example. Include time and space complexity if relevant.`,
      coding: `\nAnswer as 4 numbered points: 1. Approach and data structure 2. Edge cases 3. Key implementation steps 4. Time and space complexity.`,
      general: `\nAnswer with 3 to 5 numbered points. Lead with the direct answer then supporting detail.`,
    }

    prompt += typeInstructions[type] || typeInstructions.general

    if (config?.language) {
      prompt += `\n\nCRITICAL: Respond entirely in ${config.language}.`
    }
    if (config?.extraContext) {
      prompt += `\n\nEXTRA INSTRUCTIONS:\n${config.extraContext}`
    }

    return prompt
  }

  private buildLegacyUserMessage(
    question: string,
    contextWindow: string,
    config: SessionConfig | null
  ): string {
    const parts: string[] = []

    if (config?.resumeText) {
      parts.push(`CANDIDATE RESUME:\n${config.resumeText.substring(0, 2000)}`)
    }
    if (contextWindow) {
      parts.push(`INTERVIEWER CONTEXT:\n${contextWindow.substring(0, 2000)}`)
    }
    parts.push(`QUESTION:\n${question}`)

    return parts.join('\n\n')
  }

  stop() {
    if (this.sessionHandler) {
      this.ipcBus.removeListener('session:started', this.sessionHandler)
      this.sessionHandler = null
    }
    if (this.questionHandler) {
      this.ipcBus.removeListener('question:detected', this.questionHandler)
      this.questionHandler = null
    }
    if (this.updateHandler) {
      this.ipcBus.removeListener('question:update', this.updateHandler)
      this.updateHandler = null
    }
    if (this.answerHandler) {
      this.ipcBus.removeListener('answer:complete', this.answerHandler)
      this.answerHandler = null
    }
    this.extractedContext = null
    this.extractionPromise = null
    this.answerHistory = []
  }
}
