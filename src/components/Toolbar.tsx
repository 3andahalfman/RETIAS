import { useEffect, useRef, useState } from 'react'
import DockIcon from './DockIcon'

interface ToolbarProps {
  sessionActive: boolean
  isStarted: boolean
  onStartSession: () => void
  onStopSession: () => void
  micActive: boolean
  onToggleMic: () => void
  isDocked: boolean
  onToggleDock: () => void
  convState?: string
  isPremium?: boolean
  sessionCompany?: string
  sessionRole?: string
  aiModel?: string
  countdownSec?: number
  /** Solved Assessment Q&A — browse curated answers or switch to live capture */
  variant?: 'session' | 'solved'
  solvedLiveActive?: boolean
  onStartLive?: () => void
  onBack?: () => void
}

function formatModelLabel(model?: string): string {
  if (!model) return 'Sonnet 4.6'
  // Claude IDs look like "claude-sonnet-4-6", "claude-haiku-4-5-20251001"
  // (date suffix dropped), or single-version names like "claude-fable-5".
  const claude = model.match(/^claude-(sonnet|opus|haiku|fable)-(\d+)(?:-(\d+))?/i)
  if (claude) {
    const name = claude[1][0].toUpperCase() + claude[1].slice(1).toLowerCase()
    const version = claude[3] ? `${claude[2]}.${claude[3]}` : claude[2]
    return `${name} ${version}`
  }
  if (model.startsWith('gpt-')) return model.toUpperCase().replace('GPT-', 'GPT ')
  return model
}

export default function Toolbar({
  sessionActive,
  isStarted,
  onStartSession,
  onStopSession,
  micActive,
  onToggleMic,
  isDocked,
  onToggleDock,
  convState = 'IDLE',
  sessionCompany,
  sessionRole,
  aiModel,
  countdownSec,
  variant = 'session',
  solvedLiveActive = false,
  onStartLive,
  onBack,
}: ToolbarProps) {
  const isSolved = variant === 'solved'
  const liveRunning = isSolved ? solvedLiveActive : isStarted
  const [elapsed, setElapsed] = useState(0)
  const [snapOpen, setSnapOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (liveRunning) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      if (!isSolved) setElapsed(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [liveRunning, isSolved])

  const isCountdown = typeof countdownSec === 'number' && countdownSec > 0
  const displaySeconds = isCountdown
    ? Math.max(0, countdownSec - elapsed)
    : elapsed
  const minutes = Math.floor(displaySeconds / 60)
  const seconds = displaySeconds % 60
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`
  const timeLow = isCountdown && displaySeconds <= 60   // last minute → red
  const timeWarn = isCountdown && displaySeconds <= 180 && !timeLow  // last 3 min → amber

  // Auto-stop the session when the free-tier countdown reaches zero
  useEffect(() => {
    if (isCountdown && liveRunning && displaySeconds === 0) {
      onStopSession()
    }
  }, [isCountdown, liveRunning, displaySeconds, onStopSession])

  const displayRole = sessionRole
    ? (sessionRole.length > 32 ? sessionRole.slice(0, 32) + '…' : sessionRole)
    : null
  const sessionLabel = sessionCompany && displayRole
    ? `${sessionCompany} — ${displayRole}`
    : sessionCompany || displayRole || null

  return (
    <div className="toolbar">
      {/* Left — logo + session info (drag region) */}
      <div className="toolbar-drag-region">
        <div className="toolbar-logo-block">
          <img src="./logo.svg" alt="RETIAS" className="toolbar-logo-img" />
          <span className="toolbar-brand">RETIAS</span>
        </div>
        {(sessionActive || isSolved) && sessionLabel && (
          <div className="toolbar-session-info">
            <span className={`toolbar-status-dot ${liveRunning ? 'live' : 'idle'}`} />
            <span className="toolbar-session-label">{sessionLabel}</span>
            {liveRunning && <span className="toolbar-live-pill">{isSolved ? 'Live Assessment' : 'Live'}</span>}
            {isSolved && !liveRunning && <span className="toolbar-solved-pill">Solved</span>}
          </div>
        )}
        {isSolved && onBack && !solvedLiveActive && (
          <button type="button" className="toolbar-breadcrumb-btn" onClick={onBack} title="Back to assessment">
            ← Back to Assessment
          </button>
        )}
      </div>

      {/* Right-side compact controls */}
      <div className="toolbar-right">

        {/* Conversation state */}
        {liveRunning && convState === 'LISTENING_CONTEXT' && <span className="state-badge listening">Listening…</span>}
        {liveRunning && (convState === 'QUESTION_CANDIDATE' || convState === 'QUESTION_CONFIRMED') && <span className="state-badge processing">Processing…</span>}
        {liveRunning && convState === 'ANSWER_IN_PROGRESS' && <span className="state-badge generating">Generating…</span>}

        {sessionActive && !isStarted && !isSolved && (
          <button type="button" className="toolbar-action-btn start" onClick={onStartSession}>
            ▶ Start
          </button>
        )}

        {(isSolved || liveRunning) && (
          <div
            className={`toolbar-timer${!liveRunning ? ' idle' : ''}${timeLow ? ' low' : ''}${timeWarn ? ' warn' : ''}`}
            title={!liveRunning ? 'Timer starts when live assessment begins' : isCountdown ? 'Free plan limit — session ends at 0:00' : undefined}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {timeStr}
            {isCountdown && liveRunning && <span className="toolbar-timer-tag">FREE</span>}
          </div>
        )}

        {(liveRunning || isSolved) && aiModel && (
          <div className="toolbar-model-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            {formatModelLabel(aiModel)}
          </div>
        )}

        {/* Mic toggle */}
        <button type="button"
          className={`toolbar-icon-btn ${micActive ? 'mic-active' : 'muted'}${isSolved && !liveRunning ? ' disabled' : ''}`}
          onClick={onToggleMic}
          disabled={isSolved && !liveRunning}
          title={isSolved && !liveRunning ? 'Available in live assessment' : micActive ? 'Mute microphone' : 'Unmute microphone'}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          {!micActive && <span className="mic-slash" />}
        </button>

        {isSolved ? (
          solvedLiveActive ? (
            <button type="button" className="toolbar-action-btn danger" onClick={onStopSession}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
              End Session
            </button>
          ) : (
            <button type="button" className="toolbar-action-btn start" onClick={onStartLive}>
              ▶ Go Live
            </button>
          )
        ) : sessionActive && (
          <button type="button" className="toolbar-action-btn danger" onClick={onStopSession}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            End Session
          </button>
        )}

        <div className="toolbar-divider" />

        {/* Snap layout */}
        {!isDocked && (
          <div className="snap-btn-wrapper">
            <button type="button" className="toolbar-icon-btn" title="Snap layout" onClick={() => setSnapOpen(!snapOpen)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </button>
            {snapOpen && (
              <div className="snap-grid-dropdown">
                <div className="snap-grid-row">
                  <button type="button" className="snap-grid-cell" title="Top Left"    onClick={() => { window.electronAPI?.snapWindow('tl'); setSnapOpen(false) }} />
                  <button type="button" className="snap-grid-cell" title="Top Middle"  onClick={() => { window.electronAPI?.snapWindow('tm'); setSnapOpen(false) }} />
                  <button type="button" className="snap-grid-cell" title="Top Right"   onClick={() => { window.electronAPI?.snapWindow('tr'); setSnapOpen(false) }} />
                </div>
                <div className="snap-grid-row">
                  <button type="button" className="snap-grid-cell" title="Bottom Left"   onClick={() => { window.electronAPI?.snapWindow('bl'); setSnapOpen(false) }} />
                  <button type="button" className="snap-grid-cell" title="Bottom Middle" onClick={() => { window.electronAPI?.snapWindow('bm'); setSnapOpen(false) }} />
                  <button type="button" className="snap-grid-cell" title="Bottom Right"  onClick={() => { window.electronAPI?.snapWindow('br'); setSnapOpen(false) }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dock */}
        <button type="button" className="toolbar-icon-btn" onClick={onToggleDock} title={isDocked ? 'Expand' : 'Dock'}>
          <DockIcon />
        </button>

        {/* Close */}
        <button type="button" className="toolbar-icon-btn close" onClick={() => window.electronAPI?.closeWindow()} title="Close">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
