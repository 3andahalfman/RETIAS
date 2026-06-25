import { useEffect, useMemo, useState } from 'react'
import { loadSettings, saveAutoTyperDefaults } from './Settings'
import { stripMarkdown } from '../lib/markdown-strip'
import WindowControls from './WindowControls'
import { useAutoTypeStatus, AutoTypeEngineState } from '../lib/auto-type-status'

interface Props {
  onDock: () => void
}

type EngineState = AutoTypeEngineState

const COUNTDOWN_PRESETS = [3, 5, 7]

function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function stateLabel(state: EngineState): string {
  switch (state) {
    case 'idle': return 'Ready'
    case 'countdown': return 'Countdown'
    case 'typing': return 'Typing'
    case 'paused': return 'Paused'
    case 'done': return 'Done'
    case 'error': return 'Error'
    default: return state
  }
}

export default function AutoTyper({ onDock }: Props) {
  const initial = useMemo(() => loadSettings(), [])

  const [text, setText] = useState<string>('')
  const [wpm, setWpm] = useState<number>(initial.autoTyperWpm)
  const [jitterPct, setJitterPct] = useState<number>(initial.autoTyperJitterPct)
  const [typoRate, setTypoRate] = useState<number>(initial.autoTyperTypoRate ?? 0.05)
  const [countdownSec, setCountdownSec] = useState<number>(Math.max(1, Math.round(initial.autoTyperCountdownMs / 1000)))

  // Subscribe to the shared Auto-Typer engine state. Multiple components
  // (the AnswerPanel inline strip, this tab, etc.) can all observe the same
  // engine simultaneously via this hook.
  const { status, countdown } = useAutoTypeStatus()
  const engineState = status.state
  const charsTyped = status.charsTyped
  const totalChars = status.totalChars
  const remainingMs = status.remainingMs
  const secondsLeft = countdown?.secondsLeft ?? null
  const errorMsg = engineState === 'error' ? (status.error ?? 'Auto-typing failed') : null

  // Persist user-chosen defaults whenever the controls change so a fresh
  // tab visit (or a Settings reload) reflects the latest values.
  useEffect(() => {
    saveAutoTyperDefaults({
      autoTyperWpm: wpm,
      autoTyperJitterPct: jitterPct,
      autoTyperCountdownMs: countdownSec * 1000,
      autoTyperTypoRate: typoRate,
    })
  }, [wpm, jitterPct, countdownSec, typoRate])

  const isRunning = engineState !== 'idle' && engineState !== 'done' && engineState !== 'error'
  const charCount = text.length
  const canStart = !isRunning && charCount > 0

  const handleStart = async () => {
    if (!canStart) return
    try {
      await window.electronAPI?.autoTypeStart?.({
        text,
        wpm,
        jitterPct,
        countdownMs: countdownSec * 1000,
        typoRate,
      })
    } catch (err) {
      console.error('[AutoTyper] start failed:', err)
    }
  }

  const handlePauseResume = () => {
    if (engineState === 'paused') window.electronAPI?.autoTypeResume?.()
    else if (engineState === 'typing' || engineState === 'countdown') window.electronAPI?.autoTypePause?.()
  }

  const handleStop = () => {
    window.electronAPI?.autoTypeStop?.()
  }

  const handleStripMarkdown = () => {
    setText((prev) => stripMarkdown(prev))
  }

  const handleClear = () => {
    if (isRunning) return
    setText('')
  }

  const progressPct = totalChars > 0
    ? Math.min(100, Math.round((charsTyped / totalChars) * 100))
    : 0

  const pillState = engineState === 'idle' && errorMsg ? 'error' : engineState

  const statusText = useMemo(() => {
    if (errorMsg) return errorMsg
    if (engineState === 'countdown') {
      const left = secondsLeft ?? Math.ceil(countdownSec)
      return `Focus the target textbox — typing starts in ${left}s…`
    }
    if (engineState === 'typing' || engineState === 'paused') {
      return `${charsTyped.toLocaleString()} / ${totalChars.toLocaleString()} characters · ${formatRemaining(remainingMs)} left`
    }
    if (engineState === 'done') {
      return `Done — typed ${charsTyped.toLocaleString()} characters.`
    }
    if (charCount > 0) {
      const estMs = Math.round((charCount / (wpm * 5)) * 60_000)
      return `Ready to type ${charCount.toLocaleString()} characters · ~${formatRemaining(estMs)} at ${wpm} WPM`
    }
    return 'Paste or type text above, then click Start.'
  }, [engineState, secondsLeft, countdownSec, charsTyped, totalChars, remainingMs, errorMsg, charCount, wpm])

  return (
    <div className="auto-typer-page">
      {/* Window controls (mirror other pages) */}
      <div className="setup-inner-topbar">
        <div className="setup-inner-topbar-left">
          <div className="auto-typer-title">⌨ Auto-Typer</div>
        </div>
        <div className="setup-inner-topbar-right">
          <WindowControls onDock={onDock} />
        </div>
      </div>

      <div className="auto-typer-body">
        <div className="auto-typer-text-card">
          <div className="auto-typer-text-toolbar">
            <div className="auto-typer-text-heading">
              <span className="auto-typer-text-label">Text to type</span>
              <span className="auto-typer-text-sub">
                Paste below, then click Start. For AI answers, use the inline
                {' '}<span className="auto-typer-inline-cue">⌨ Auto-Type</span> button in the AI Answer panel instead.
              </span>
            </div>
            <div className="auto-typer-text-actions">
              <span className="auto-typer-char-count">{charCount.toLocaleString()} chars</span>
              <button
                type="button"
                className="auto-typer-mini-btn"
                onClick={handleStripMarkdown}
                disabled={isRunning || charCount === 0}
                title="Strip markdown formatting"
              >
                Strip markdown
              </button>
              <button
                type="button"
                className="auto-typer-mini-btn"
                onClick={handleClear}
                disabled={isRunning || charCount === 0}
                title="Clear text"
              >
                Clear
              </button>
            </div>
          </div>
          <textarea
            className="auto-typer-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isRunning}
            placeholder="Type or paste the text you want the Auto-Typer to send to the focused window…"
            spellCheck={false}
            autoFocus
          />

          {/* Footer combines the status pill + the primary action(s) into one
              row so the Start button lives right next to the textarea — the
              natural place a user's eye lands after typing. */}
          <div className={`auto-typer-text-footer auto-typer-text-footer--${pillState}`}>
            <div className="auto-typer-footer-status">
              <span className="auto-typer-footer-badge">{stateLabel(engineState)}</span>
              <span className="auto-typer-footer-text">{statusText}</span>
              {(engineState === 'typing' || engineState === 'paused') && (
                <div className="auto-typer-footer-progress">
                  <div className="auto-typer-footer-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
              )}
            </div>

            <div className="auto-typer-footer-actions">
              {!isRunning ? (
                <button
                  type="button"
                  className="auto-typer-start-btn"
                  onClick={handleStart}
                  disabled={!canStart}
                >
                  ▶ Start Auto-Typing
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="auto-typer-pause-btn"
                    onClick={handlePauseResume}
                  >
                    {engineState === 'paused' ? '▶ Resume' : '⏸ Pause'}
                  </button>
                  <button
                    type="button"
                    className="auto-typer-stop-btn"
                    onClick={handleStop}
                  >
                    ■ Stop
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="auto-typer-controls-card">
          <div className="auto-typer-control">
            <div className="auto-typer-control-row">
              <label className="auto-typer-control-label">Speed</label>
              <span className="auto-typer-control-value">{wpm} WPM</span>
            </div>
            <input
              type="range"
              className="settings-slider"
              min={20}
              max={300}
              step={5}
              value={wpm}
              onChange={(e) => {
                const next = Number(e.target.value)
                setWpm(next)
                // Live-update the running engine so the new pace kicks in on
                // the very next keystroke (works while typing or paused).
                if (engineState === 'typing' || engineState === 'paused') {
                  window.electronAPI?.autoTypeUpdatePace?.({ wpm: next })
                }
              }}
            />
            <div className="auto-typer-hint">Higher WPM types faster. Most humans land between 40 and 90 WPM.</div>
          </div>

          <div className="auto-typer-control">
            <div className="auto-typer-control-row">
              <label className="auto-typer-control-label">Jitter</label>
              <span className="auto-typer-control-value">{Math.round(jitterPct * 100)}%</span>
            </div>
            <input
              type="range"
              className="settings-slider"
              min={0}
              max={70}
              step={5}
              value={Math.round(jitterPct * 100)}
              onChange={(e) => {
                const next = Number(e.target.value) / 100
                setJitterPct(next)
                if (engineState === 'typing' || engineState === 'paused') {
                  window.electronAPI?.autoTypeUpdatePace?.({ jitterPct: next })
                }
              }}
            />
            <div className="auto-typer-hint">Randomises each keystroke's delay so typing looks more human.</div>
          </div>

          <div className="auto-typer-control">
            <div className="auto-typer-control-row">
              <label className="auto-typer-control-label">Typos</label>
              <span className="auto-typer-control-value">{Math.round(typoRate * 100)}%</span>
            </div>
            <input
              type="range"
              className="settings-slider"
              min={0}
              max={30}
              step={1}
              value={Math.round(typoRate * 100)}
              onChange={(e) => {
                const next = Number(e.target.value) / 100
                setTypoRate(next)
                if (engineState === 'typing' || engineState === 'paused') {
                  window.electronAPI?.autoTypeUpdatePace?.({ typoRate: next })
                }
              }}
            />
            <div className="auto-typer-hint">
              Chance per word of typing it wrong, pausing, backspacing, and correcting. 0% disables typos.
            </div>
          </div>

          <div className="auto-typer-control">
            <div className="auto-typer-control-row">
              <label className="auto-typer-control-label">Countdown</label>
              <span className="auto-typer-control-value">{countdownSec}s</span>
            </div>
            <div className="auto-typer-segmented">
              {COUNTDOWN_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`auto-typer-chip${countdownSec === s ? ' active' : ''}`}
                  onClick={() => setCountdownSec(s)}
                  disabled={isRunning}
                >
                  {s}s
                </button>
              ))}
            </div>
            <div className="auto-typer-hint">Time to focus the target window after clicking Start.</div>
          </div>
        </div>

        <div className="auto-typer-tips">
          <div className="auto-typer-tip-row">
            <span className="auto-typer-tip-key">Alt + T</span>
            <span>Pause / resume during typing</span>
          </div>
          <div className="auto-typer-tip-row">
            <span className="auto-typer-tip-key">Alt + Shift + T</span>
            <span>Stop immediately</span>
          </div>
          <div className="auto-typer-disclaimer">
            Some assessment platforms detect synthetic input. Jittered typing reduces detection risk but does not eliminate it.
          </div>
        </div>
      </div>
    </div>
  )
}
