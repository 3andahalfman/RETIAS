import { EventEmitter } from 'node:events'

// Lazy-load nut-js so the native libnut binaries are only resolved when the
// user actually triggers a typing session. Keeping the import out of the
// module top-level means a packaging hiccup on one platform doesn't crash
// the whole main process at boot.
type NutModule = typeof import('@nut-tree-fork/nut-js')

let nutPromise: Promise<NutModule> | null = null
async function loadNut(): Promise<NutModule> {
  if (!nutPromise) {
    nutPromise = import('@nut-tree-fork/nut-js')
  }
  return nutPromise
}

export type AutoTyperState =
  | 'idle'
  | 'countdown'
  | 'typing'
  | 'paused'
  | 'done'
  | 'error'

export interface AutoTypeStartOptions {
  text: string
  wpm: number
  jitterPct: number
  countdownMs: number
  /**
   * Probability (0..1) that an eligible word is intentionally mistyped and
   * then corrected via backspace. 0 disables typos entirely.
   */
  typoRate?: number
}

export interface AutoTypeStatus {
  state: AutoTyperState
  charsTyped: number
  totalChars: number
  remainingMs: number
  error?: string
}

export interface AutoTypeCountdown {
  secondsLeft: number
  totalSeconds: number
}

interface InternalSession {
  text: string
  wpm: number
  jitterPct: number
  countdownMs: number
  typoRate: number
  charsTyped: number
  meanIntervalMs: number
  aborted: boolean
  paused: boolean
  resumeWaiters: Array<() => void>
  /**
   * When set, a resume-countdown is currently ticking. Mutating
   * `aborted = true` cancels the countdown without resuming typing (used by
   * pause() and stop() to interrupt the grace period cleanly).
   */
  resumeCountdown: { aborted: boolean } | null
}

function sleep(ms: number, signal: { aborted: boolean }): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) { resolve(); return }
    const start = Date.now()
    const tick = () => {
      if (signal.aborted) { resolve(); return }
      const elapsed = Date.now() - start
      if (elapsed >= ms) { resolve(); return }
      const remaining = ms - elapsed
      setTimeout(tick, Math.min(remaining, 25))
    }
    tick()
  })
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

// ── Typo machinery ────────────────────────────────────────────────────────

/**
 * QWERTY adjacency map (lowercase) used to generate plausible substitution
 * typos — pressing a key next to the intended one is by far the most common
 * mistake in real human typing.
 */
const QWERTY_ADJACENT: Record<string, string> = {
  q: 'wa',  w: 'qesa', e: 'wrds', r: 'etfd', t: 'rygf', y: 'tuhg',
  u: 'yijh', i: 'uokj', o: 'iplk', p: 'ol',
  a: 'qwsz', s: 'awedzx', d: 'serfcx', f: 'drtgvc', g: 'ftyhbv',
  h: 'gyujnb', j: 'huikmn', k: 'jiolm', l: 'kop',
  z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
}

interface Token {
  kind: 'word' | 'delim'
  text: string
}

/**
 * Split text into alternating word / delimiter runs. A "word" is a maximal
 * run of letters and apostrophes (so contractions like "don't" stay intact).
 * Everything else (spaces, punctuation, newlines, digits) becomes a delim
 * run. This keeps the original character order/length exactly.
 */
function tokenize(text: string): Token[] {
  const chars = Array.from(text)
  if (chars.length === 0) return []
  const out: Token[] = []
  let bufKind: 'word' | 'delim' = isWordChar(chars[0]) ? 'word' : 'delim'
  let buf = ''
  for (const ch of chars) {
    const kind: 'word' | 'delim' = isWordChar(ch) ? 'word' : 'delim'
    if (kind !== bufKind) {
      if (buf) out.push({ kind: bufKind, text: buf })
      buf = ch
      bufKind = kind
    } else {
      buf += ch
    }
  }
  if (buf) out.push({ kind: bufKind, text: buf })
  return out
}

function isWordChar(ch: string): boolean {
  return /[A-Za-z']/.test(ch)
}

/**
 * Generate a "wrong" version of the given word. Picks a random typo strategy:
 *   - substitute: swap one letter for a QWERTY-adjacent one
 *   - double:     repeat one letter
 *   - swap:       transpose two adjacent letters
 *   - skip:       drop one letter (only when the word is long enough)
 *
 * Returns the original word verbatim when no plausible typo could be applied
 * (e.g. all-uppercase acronyms with no adjacency, very short words).
 */
function makeTypo(word: string): string {
  const chars = Array.from(word)
  const letterIndices: number[] = []
  for (let i = 0; i < chars.length; i++) {
    if (/[A-Za-z]/.test(chars[i])) letterIndices.push(i)
  }
  if (letterIndices.length < 2) return word

  // Build a weighted list of strategies — substitute is most common in real
  // typing, then swap, then double, then skip.
  const strategies: Array<'substitute' | 'swap' | 'double' | 'skip'> = [
    'substitute', 'substitute', 'substitute',
    'swap', 'swap',
    'double',
    'skip',
  ]
  const strategy = strategies[Math.floor(Math.random() * strategies.length)]

  switch (strategy) {
    case 'substitute': {
      // Try a few random positions until we find one with an adjacency entry.
      for (let attempt = 0; attempt < 5; attempt++) {
        const idx = letterIndices[Math.floor(Math.random() * letterIndices.length)]
        const original = chars[idx]
        const lower = original.toLowerCase()
        const nearby = QWERTY_ADJACENT[lower]
        if (!nearby) continue
        const subLower = nearby[Math.floor(Math.random() * nearby.length)]
        const sub = original === original.toUpperCase() ? subLower.toUpperCase() : subLower
        if (sub === original) continue
        const next = chars.slice()
        next[idx] = sub
        return next.join('')
      }
      return word
    }
    case 'swap': {
      // Pick a letter position where the next character is also a letter so
      // the swap stays inside the same word and looks like a real fat-finger.
      const candidates: number[] = []
      for (const i of letterIndices) {
        if (i + 1 < chars.length && /[A-Za-z]/.test(chars[i + 1])) candidates.push(i)
      }
      if (candidates.length === 0) return word
      const i = candidates[Math.floor(Math.random() * candidates.length)]
      if (chars[i].toLowerCase() === chars[i + 1].toLowerCase()) return word // swap of identical letters is invisible
      const next = chars.slice()
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next.join('')
    }
    case 'double': {
      const idx = letterIndices[Math.floor(Math.random() * letterIndices.length)]
      const next = chars.slice()
      next.splice(idx, 0, chars[idx])
      return next.join('')
    }
    case 'skip': {
      // Skipping a letter is only obvious when there are enough letters left
      // to still read like a typo (and not just an unrelated word).
      if (letterIndices.length < 4) return word
      // Drop a letter from the middle 50% so we don't chop the first/last
      // letter, which is much less natural.
      const start = Math.floor(letterIndices.length * 0.25)
      const end = Math.max(start + 1, Math.floor(letterIndices.length * 0.75))
      const idx = letterIndices[start + Math.floor(Math.random() * (end - start))]
      const next = chars.slice()
      next.splice(idx, 1)
      return next.join('')
    }
  }
  return word
}

function shouldTypo(word: string, typoRate: number): boolean {
  if (typoRate <= 0) return false
  // Only consider words with enough letters that a typo is visually meaningful.
  let letters = 0
  for (const ch of word) if (/[A-Za-z]/.test(ch)) letters++
  if (letters < 3) return false
  return Math.random() < typoRate
}

/**
 * Auto-typer engine. Holds at most one active session at a time; subsequent
 * `start` calls reject if a session is already running.
 *
 * The engine emits two channels of events:
 *   - 'status'    → fine-grained progress (state, charsTyped, totalChars, etc.)
 *   - 'countdown' → 1-second tick events while waiting for the user to focus
 *                   the target window
 */
export class AutoTyper extends EventEmitter {
  private session: InternalSession | null = null
  private lastStatusAt = 0

  /** True while a session is in any state other than idle/done/error. */
  get isRunning(): boolean {
    return this.session !== null
  }

  async start(opts: AutoTypeStartOptions): Promise<void> {
    if (this.session) {
      throw new Error('Auto-Typer is already running. Stop the current session first.')
    }
    const text = String(opts.text ?? '')
    if (!text.length) {
      throw new Error('Cannot type empty text.')
    }
    const wpm = clampInt(opts.wpm, 10, 600, 60)
    const jitterPct = clampFloat(opts.jitterPct, 0, 0.9, 0.2)
    const countdownMs = clampInt(opts.countdownMs, 0, 60_000, 3000)
    const typoRate = clampFloat(opts.typoRate ?? 0, 0, 0.5, 0)

    // 1 word ≈ 5 characters by convention; meanIntervalMs is per-character
    const meanIntervalMs = 60_000 / (wpm * 5)

    const session: InternalSession = {
      text,
      wpm,
      jitterPct,
      countdownMs,
      typoRate,
      charsTyped: 0,
      meanIntervalMs,
      aborted: false,
      paused: false,
      resumeWaiters: [],
      resumeCountdown: null,
    }
    this.session = session

    try {
      // Countdown phase — gives user time to focus the target window.
      if (countdownMs > 0) {
        this.emitStatus('countdown', true)
        const totalSeconds = Math.ceil(countdownMs / 1000)
        for (let s = totalSeconds; s > 0; s--) {
          if (session.aborted) break
          this.emit('countdown', { secondsLeft: s, totalSeconds })
          await sleep(1000, session)
        }
        if (session.aborted) {
          this.cleanup('done')
          return
        }
      }

      // Load native typing driver lazily; surfaces any binary load errors here
      // rather than at boot.
      const nut = await loadNut()
      const { keyboard, Key } = nut
      // Disable nut-js's own per-key delay; we manage timing ourselves so we
      // can apply jitter and pause/abort responsively.
      keyboard.config.autoDelayMs = 0

      this.emitStatus('typing', true)

      const totalChars = Array.from(text).length
      const tokens = tokenize(text)

      // typeChar abstracts the special-key handling so the typo path and the
      // normal path share the same keystroke logic.
      const typeChar = async (ch: string): Promise<void> => {
        if (ch === '\n') {
          await keyboard.pressKey(Key.Enter)
          await keyboard.releaseKey(Key.Enter)
        } else if (ch === '\t') {
          await keyboard.pressKey(Key.Tab)
          await keyboard.releaseKey(Key.Tab)
        } else if (ch === '\r') {
          // Stray CR — \r\n becomes just Enter via the \n branch.
          return
        } else {
          await keyboard.type(ch)
        }
      }

      const perCharDelay = (ch: string): number => {
        const jitter = (Math.random() - 0.5) * 2 * session.jitterPct * session.meanIntervalMs
        let delay = Math.max(5, session.meanIntervalMs + jitter)
        if (ch === '\n' || ch === '.' || ch === '!' || ch === '?') {
          delay += 80 + Math.random() * 180
        } else if (ch === ',' || ch === ';' || ch === ':') {
          delay += 30 + Math.random() * 80
        }
        return delay
      }

      for (const token of tokens) {
        if (session.aborted) break

        // ── Typo phase (word tokens only) ─────────────────────────────────
        // Decide per-token whether to inject a typo so the choice always
        // reflects the *current* typoRate (the user may have nudged it
        // mid-session via updateSettings).
        if (token.kind === 'word' && shouldTypo(token.text, session.typoRate)) {
          const typo = makeTypo(token.text)
          if (typo !== token.text) {
            // 1. Type the wrong word
            const typoChars = Array.from(typo)
            let typoDone = false
            for (const ch of typoChars) {
              if (session.aborted) { typoDone = false; break }
              await this.waitWhilePaused(session)
              if (session.aborted) { typoDone = false; break }
              try {
                await typeChar(ch)
              } catch (err) {
                this.emitError(totalChars, err)
                return
              }
              await sleep(perCharDelay(ch), session)
              typoDone = true
            }
            if (session.aborted) break

            // 2. Brief "noticing" pause — humans see the mistake before reacting
            if (typoDone) {
              await sleep(180 + Math.random() * 380, session)
              if (session.aborted) break
            }

            // 3. Backspace each character of the wrong word
            for (let i = 0; i < typoChars.length; i++) {
              if (session.aborted) break
              await this.waitWhilePaused(session)
              if (session.aborted) break
              try {
                await keyboard.pressKey(Key.Backspace)
                await keyboard.releaseKey(Key.Backspace)
              } catch (err) {
                this.emitError(totalChars, err)
                return
              }
              // Backspaces are typically a touch faster than typing, but
              // still jittered so they don't all fire at exactly the same
              // cadence.
              await sleep(35 + Math.random() * 70, session)
            }
            if (session.aborted) break

            // 4. Small pause before the correct retry, then fall through to
            //    the normal per-character typing loop below.
            await sleep(60 + Math.random() * 160, session)
            if (session.aborted) break
          }
        }

        // ── Normal typing path (used for delims and for the corrected word) ──
        const chars = Array.from(token.text)
        for (const ch of chars) {
          if (session.aborted) break
          await this.waitWhilePaused(session)
          if (session.aborted) break
          try {
            await typeChar(ch)
          } catch (err) {
            this.emitError(totalChars, err)
            return
          }
          session.charsTyped += 1
          this.maybeEmitProgress(totalChars)
          await sleep(perCharDelay(ch), session)
        }
      }

      // Final progress emit so the UI shows 100% before transitioning.
      if (!session.aborted) {
        this.emit('status', {
          state: 'done',
          charsTyped: session.charsTyped,
          totalChars,
          remainingMs: 0,
        } satisfies AutoTypeStatus)
      }
      this.cleanup('done')
    } catch (err) {
      this.emit('status', {
        state: 'error',
        charsTyped: this.session?.charsTyped ?? 0,
        totalChars: Array.from(text).length,
        remainingMs: 0,
        error: err instanceof Error ? err.message : String(err),
      } satisfies AutoTypeStatus)
      this.cleanup('error')
    }
  }

  pause(): void {
    if (!this.session) return
    // If a resume-countdown is currently ticking, cancel it and stay paused.
    // The session.paused flag was never cleared, so the typing loop remains
    // blocked at waitWhilePaused — no extra state change needed beyond
    // tearing down the countdown.
    if (this.session.resumeCountdown) {
      this.session.resumeCountdown.aborted = true
      this.session.resumeCountdown = null
      this.emitStatus('paused', true)
      return
    }
    if (this.session.paused) return
    this.session.paused = true
    this.emitStatus('paused', true)
  }

  resume(): void {
    if (!this.session) return
    if (!this.session.paused) return
    // Already counting down — let the existing countdown finish; ignore
    // double-taps of the Resume button.
    if (this.session.resumeCountdown) return

    // If no countdown is configured, resume immediately (instant typing).
    if (this.session.countdownMs <= 0) {
      this.actuallyResume()
      return
    }

    // Run the grace countdown so the user can re-focus the target window
    // before keystrokes start firing again.
    const ctrl = { aborted: false }
    this.session.resumeCountdown = ctrl
    this.emitStatus('countdown', true)
    void this.runResumeCountdown(ctrl)
  }

  togglePause(): void {
    if (!this.session) return
    // During a resume-countdown, session.paused is still true — treat the
    // toggle as "pause" so Alt+T cancels the grace timer and keeps the
    // session paused rather than no-opping.
    if (this.session.resumeCountdown) {
      this.pause()
      return
    }
    if (this.session.paused) this.resume()
    else this.pause()
  }

  stop(): void {
    if (!this.session) return
    this.session.aborted = true
    // Cancel any in-flight resume countdown so it doesn't try to flip the
    // session back into typing after we've started tearing down.
    if (this.session.resumeCountdown) {
      this.session.resumeCountdown.aborted = true
      this.session.resumeCountdown = null
    }
    // Release anyone waiting on a pause so the loop can exit cleanly.
    const waiters = this.session.resumeWaiters.splice(0)
    waiters.forEach((fn) => fn())
  }

  /**
   * Adjust pace / typo rate mid-session. Subsequent keystrokes use the new
   * mean interval, jitter, and typo rate immediately — the change applies on
   * the very next sleep / next-word decision. No-op when nothing is running.
   */
  updateSettings(opts: { wpm?: number; jitterPct?: number; typoRate?: number }): void {
    if (!this.session) return
    if (typeof opts.wpm === 'number') {
      const safeWpm = clampInt(opts.wpm, 10, 600, this.session.wpm)
      this.session.wpm = safeWpm
      this.session.meanIntervalMs = 60_000 / (safeWpm * 5)
    }
    if (typeof opts.jitterPct === 'number') {
      this.session.jitterPct = clampFloat(opts.jitterPct, 0, 0.9, this.session.jitterPct)
    }
    if (typeof opts.typoRate === 'number') {
      this.session.typoRate = clampFloat(opts.typoRate, 0, 0.5, this.session.typoRate)
    }
    // Force an immediate status emit so the UI's ETA reflects the new pace
    // even when the user is paused (otherwise the throttled emitter would
    // wait for typing to resume). Preserve the resume-countdown state so the
    // UI doesn't flicker back to "Paused" while the grace timer is ticking.
    const currentState: AutoTyperState = this.session.resumeCountdown
      ? 'countdown'
      : this.session.paused
        ? 'paused'
        : 'typing'
    this.emitStatus(currentState, true)
  }

  // ── Internals ──

  /**
   * Flip the session out of `paused` and release any waiters so the typing
   * loop continues from where it left off. Used both by the no-countdown
   * fast path and by the resume-countdown completion handler.
   */
  private actuallyResume(): void {
    const session = this.session
    if (!session) return
    session.paused = false
    session.resumeCountdown = null
    const waiters = session.resumeWaiters.splice(0)
    waiters.forEach((fn) => fn())
    this.emitStatus('typing', true)
  }

  /**
   * Run the grace countdown that fires before resuming a paused session.
   * Emits the same 'countdown' channel events the initial start countdown
   * uses, so the UI rendering path stays identical. Bails out early if the
   * controller is cancelled (pause/stop pressed during the countdown).
   */
  private async runResumeCountdown(ctrl: { aborted: boolean }): Promise<void> {
    const session = this.session
    if (!session) return
    const totalSeconds = Math.max(1, Math.ceil(session.countdownMs / 1000))
    // sleep() takes a signal that aborts if EITHER the controller is
    // cancelled or the whole session is aborted — combine them so a Stop
    // mid-countdown halts the timer immediately.
    const sig = {
      get aborted() { return ctrl.aborted || session.aborted },
    }
    for (let s = totalSeconds; s > 0; s--) {
      if (sig.aborted) return
      this.emit('countdown', { secondsLeft: s, totalSeconds })
      await sleep(1000, sig)
    }
    if (sig.aborted) return
    // Make sure another pause/stop didn't slip in while we were sleeping
    // and that the session this controller belongs to is still the active
    // one (defensive — start() rejects when a session is already running,
    // but cleanup() could in theory race).
    if (this.session !== session) return
    if (session.resumeCountdown !== ctrl) return
    this.actuallyResume()
  }

  private cleanup(_finalState: AutoTyperState): void {
    this.session = null
    this.emit('status', {
      state: 'idle',
      charsTyped: 0,
      totalChars: 0,
      remainingMs: 0,
    } satisfies AutoTypeStatus)
  }

  private waitWhilePaused(session: InternalSession): Promise<void> {
    if (!session.paused) return Promise.resolve()
    return new Promise<void>((resolve) => {
      session.resumeWaiters.push(resolve)
    })
  }

  private emitError(totalChars: number, err: unknown): void {
    this.emit('status', {
      state: 'error',
      charsTyped: this.session?.charsTyped ?? 0,
      totalChars,
      remainingMs: 0,
      error: err instanceof Error ? err.message : String(err),
    } satisfies AutoTypeStatus)
    this.cleanup('error')
  }

  private emitStatus(state: AutoTyperState, force: boolean): void {
    const session = this.session
    if (!session) return
    if (!force && Date.now() - this.lastStatusAt < 100) return
    this.lastStatusAt = Date.now()
    const total = Array.from(session.text).length
    const remainingChars = Math.max(0, total - session.charsTyped)
    const remainingMs = Math.round(remainingChars * session.meanIntervalMs)
    this.emit('status', {
      state,
      charsTyped: session.charsTyped,
      totalChars: total,
      remainingMs,
    } satisfies AutoTypeStatus)
  }

  private maybeEmitProgress(total: number): void {
    const session = this.session
    if (!session) return
    const now = Date.now()
    if (now - this.lastStatusAt < 100) return
    this.lastStatusAt = now
    const remainingChars = Math.max(0, total - session.charsTyped)
    const remainingMs = Math.round(remainingChars * session.meanIntervalMs)
    this.emit('status', {
      state: session.paused ? 'paused' : 'typing',
      charsTyped: session.charsTyped,
      totalChars: total,
      remainingMs,
    } satisfies AutoTypeStatus)
  }
}

// Singleton — only one typing session can run at a time, and main-process
// global hotkeys need a stable reference to call togglePause / stop.
export const autoTyper = new AutoTyper()
