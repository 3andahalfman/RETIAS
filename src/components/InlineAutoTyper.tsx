import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadSettings } from './Settings'
import { prepareAutoTypeText } from '../lib/markdown-strip'
import { useAutoTypeStatus, AutoTypeEngineState } from '../lib/auto-type-status'

/**
 * Inline Auto-Typer controls that live inside the AnswerPanel and other
 * Q&A surfaces. Provides:
 *   - <AutoTypeHeaderButton/>   — a compact CTA placed in a panel header.
 *   - <AutoTypeStatusStrip/>    — a horizontal status bar with progress,
 *                                  pause/resume, and stop controls. Renders
 *                                  itself only when an Auto-Typer session is
 *                                  in flight (or just finished).
 *
 * Both components consume the shared engine state from `useAutoTypeStatus`,
 * so they update in lockstep regardless of where they're rendered. Multiple
 * instances can safely subscribe simultaneously.
 */

function isActiveState(state: AutoTypeEngineState): boolean {
  return state === 'countdown' || state === 'typing' || state === 'paused'
}

function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function stateLabel(state: AutoTypeEngineState): string {
  switch (state) {
    case 'countdown': return 'Countdown'
    case 'typing':    return 'Typing'
    case 'paused':    return 'Paused'
    case 'done':      return 'Done'
    case 'error':     return 'Error'
    default:          return 'Ready'
  }
}

interface AutoTypeHeaderButtonProps {
  /** Returns the text that should be auto-typed when the user clicks Start. */
  getText: () => string | null | undefined
  /** Disable the button entirely (e.g. no answer yet, generating in progress). */
  disabled?: boolean
  /** Optional override for the button label/title. */
  title?: string
  /** Optional compact mode — icon only, no text. */
  compact?: boolean
  /** Premium Plus gate — renders a disabled locked button. */
  locked?: boolean
}

/**
 * Compact button intended for a panel header. When the engine is idle, it
 * starts a new Auto-Typer session using the current default settings and the
 * markdown-stripped value of `getText()`. While a session is in flight the
 * button hides itself so the status strip below can take over.
 */
export function AutoTypeHeaderButton({ getText, disabled, title, compact, locked }: AutoTypeHeaderButtonProps) {
  const { status } = useAutoTypeStatus()
  const active = isActiveState(status.state)

  const handleClick = useCallback(() => {
    if (active || locked) return
    const raw = getText()
    if (!raw) return
    const text = prepareAutoTypeText(raw)
    if (!text.trim()) return
    const s = loadSettings()
    window.electronAPI?.autoTypeStart?.({
      text,
      wpm: s.autoTyperWpm,
      jitterPct: s.autoTyperJitterPct,
      countdownMs: s.autoTyperCountdownMs,
      typoRate: s.autoTyperTypoRate ?? 0,
    }).catch(() => {})
  }, [active, getText, locked])

  if (active) return null

  if (locked) {
    return (
      <button
        type="button"
        className="panel-action-btn autotype-header-btn locked"
        disabled
        title={title ?? 'Premium Plus — upgrade to unlock Auto-Typer'}
      >
        {compact ? '🔒' : '🔒 Auto-Type'}
      </button>
    )
  }

  return (
    <button
      type="button"
      className="panel-action-btn autotype-header-btn"
      onClick={handleClick}
      disabled={disabled}
      title={title ?? 'Type this answer into the focused window'}
    >
      {compact ? '⌨' : '⌨ Auto-Type'}
    </button>
  )
}

interface AutoTypeStatusStripProps {
  /**
   * When true, the strip will appear with a slightly thinner padding,
   * suitable for embedding directly under a panel header.
   */
  dense?: boolean
}

/**
 * Inline status strip with live progress + Pause / Resume / Stop controls.
 * Renders nothing when the engine is fully idle. After a session finishes
 * the strip lingers briefly so the user gets a "Done" confirmation.
 */
export function AutoTypeStatusStrip({ dense }: AutoTypeStatusStripProps) {
  const { status, countdown } = useAutoTypeStatus()
  const active = isActiveState(status.state)

  const [lingerDone, setLingerDone] = useState(false)
  const lingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (status.state === 'done' || status.state === 'error') {
      setLingerDone(true)
      if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current)
      lingerTimerRef.current = setTimeout(() => setLingerDone(false), 2200)
    } else if (active) {
      setLingerDone(false)
      if (lingerTimerRef.current) { clearTimeout(lingerTimerRef.current); lingerTimerRef.current = null }
    }
    return () => {
      if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current)
    }
  }, [status.state, active])

  const visible = active || lingerDone

  const progressPct = useMemo(() => {
    if (status.totalChars <= 0) return 0
    return Math.min(100, Math.round((status.charsTyped / status.totalChars) * 100))
  }, [status.charsTyped, status.totalChars])

  const description = useMemo(() => {
    if (status.state === 'countdown') {
      const left = countdown?.secondsLeft ?? Math.ceil((status.remainingMs ?? 0) / 1000)
      return `Focus the target textbox — typing starts in ${Math.max(0, left)}s`
    }
    if (status.state === 'typing' || status.state === 'paused') {
      return `${status.charsTyped.toLocaleString()} / ${status.totalChars.toLocaleString()} chars · ${formatRemaining(status.remainingMs)} left`
    }
    if (status.state === 'done') {
      return `Done — typed ${status.charsTyped.toLocaleString()} characters.`
    }
    if (status.state === 'error') {
      return status.error ?? 'Auto-typing failed.'
    }
    return ''
  }, [status, countdown])

  if (!visible) return null

  const handlePauseResume = () => {
    if (status.state === 'paused') window.electronAPI?.autoTypeResume?.()
    else if (status.state === 'typing' || status.state === 'countdown') window.electronAPI?.autoTypePause?.()
  }

  const handleStop = () => {
    window.electronAPI?.autoTypeStop?.()
  }

  return (
    <div className={`inline-autotype-strip inline-autotype-strip--${status.state}${dense ? ' inline-autotype-strip--dense' : ''}`}>
      <span className="inline-autotype-badge">{stateLabel(status.state)}</span>

      {(status.state === 'typing' || status.state === 'paused') && (
        <div className="inline-autotype-progress">
          <div className="inline-autotype-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      <span className="inline-autotype-text">{description}</span>

      <div className="inline-autotype-controls">
        {(status.state === 'typing' || status.state === 'paused' || status.state === 'countdown') && (
          <button
            type="button"
            className="inline-autotype-btn inline-autotype-btn--pause"
            onClick={handlePauseResume}
            title={status.state === 'paused' ? 'Resume (Alt+T)' : 'Pause (Alt+T)'}
          >
            {status.state === 'paused' ? '▶' : '⏸'}
          </button>
        )}
        {active && (
          <button
            type="button"
            className="inline-autotype-btn inline-autotype-btn--stop"
            onClick={handleStop}
            title="Stop (Alt+Shift+T)"
          >
            ■
          </button>
        )}
        {(status.state === 'done' || status.state === 'error') && (
          <button
            type="button"
            className="inline-autotype-btn inline-autotype-btn--dismiss"
            onClick={() => setLingerDone(false)}
            title="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
