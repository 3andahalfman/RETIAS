import { IpcBus } from '../ipc-bus.js'

/**
 * Transcript Aggregator — Phase 3
 *
 * Merges Deepgram partial + final transcripts into clean sentences.
 * - Strips filler words
 * - Maintains a rolling 30-second context window
 * - Emits 'transcript:sentence' for each completed sentence
 * - Emits 'transcript:update' for UI display (partials + finals)
 */

const FILLER_WORDS = /\b(um|uh|like|you know|sort of|kind of|basically|literally|actually|right|okay so)\b/gi
const CONTEXT_WINDOW_SECONDS = 30

export class TranscriptAggregator {
  private ipcBus: IpcBus

  // Rolling 30s context window
  private sentences: Array<{ text: string; timestamp: number; role: 'candidate' | 'interviewer' }> = []

  // Current partial being built
  private currentPartial = ''

  // Last final text seen per role — used to drop Deepgram multichannel duplicates
  private lastFinal: Record<'candidate' | 'interviewer', string> = { candidate: '', interviewer: '' }

  // Stored handler references for proper cleanup
  private partialHandler: ((text: string, role: 'candidate' | 'interviewer') => void) | null = null
  private finalHandler: ((text: string, start: number, duration: number, role: 'candidate' | 'interviewer') => void) | null = null

  constructor(ipcBus: IpcBus) {
    this.ipcBus = ipcBus

    this.partialHandler = (text: string, role: 'candidate' | 'interviewer') => {
      this.currentPartial = text
      this.ipcBus.emit('transcript:update', text, false, role)
    }

    this.finalHandler = (text: string, _start: number, _duration: number, role: 'candidate' | 'interviewer') => {
      const original = text.trim()
      if (!original) return

      // Drop Deepgram multichannel duplicates (same final fired twice)
      if (original === this.lastFinal[role]) return
      this.lastFinal[role] = original

      const clean = this.clean(original)

      this.currentPartial = ''
      const timestamp = Date.now()

      if (clean) {
        this.sentences.push({ text: clean, timestamp, role })
        this.pruneOldSentences()
      }

      // Preserve original for UI
      this.ipcBus.emit('transcript:update', original, true, role)

      // Emit clean text for ContextBuilder/QuestionDetector
      if (clean) {
        this.ipcBus.emit('transcript:sentence', clean, this.getContextWindow(), role)
      }

      console.log(`[Aggregator] Final (${role}):`, original)
    }

    this.ipcBus.on('stt:partial', this.partialHandler)
    this.ipcBus.on('stt:final', this.finalHandler)
  }

  private clean(text: string): string {
    return text
      .replace(FILLER_WORDS, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  private pruneOldSentences() {
    const cutoff = Date.now() - CONTEXT_WINDOW_SECONDS * 1000
    this.sentences = this.sentences.filter((s) => s.timestamp >= cutoff)
  }

  /** Returns the last 30 seconds of clean transcript formatted as a dialogue */
  getContextWindow(): string {
    return this.sentences.map((s) => `${s.role === 'candidate' ? 'Candidate' : 'Interviewer'}: ${s.text}`).join('\n')
  }

  /** Returns just the most recent partial for early question detection */
  getCurrentPartial(): string {
    return this.currentPartial
  }

  stop() {
    this.sentences = []
    this.currentPartial = ''
    this.lastFinal = { candidate: '', interviewer: '' }
    if (this.partialHandler) {
      this.ipcBus.removeListener('stt:partial', this.partialHandler)
      this.partialHandler = null
    }
    if (this.finalHandler) {
      this.ipcBus.removeListener('stt:final', this.finalHandler)
      this.finalHandler = null
    }
  }
}
