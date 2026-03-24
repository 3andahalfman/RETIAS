import { useState, useEffect, useRef } from 'react'

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
  isOnlineTest?: boolean
  sessionCompany?: string
  sessionRole?: string
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
  isPremium = false,
  isOnlineTest = false,
  sessionCompany,
  sessionRole,
}: ToolbarProps) {
  const [elapsed, setElapsed] = useState(0)
  const [snapOpen, setSnapOpen] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [captureQueue, setCaptureQueue] = useState<string[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Session timer
  useEffect(() => {
    if (isStarted) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isStarted])

  const handleAnalyseScreen = async () => {
    if (analysing) return
    setAnalysing(true)
    try {
      await window.electronAPI?.analyseScreen()
    } finally {
      setAnalysing(false)
    }
  }

  const handleCapture = async () => {
    if (captureQueue.length >= 5) return
    try {
      const base64 = await window.electronAPI?.captureScreen()
      if (base64) setCaptureQueue(prev => [...prev, base64])
    } catch {}
  }

  const handleAnalyseAll = () => {
    if (captureQueue.length === 0) return
    window.electronAPI?.analyseScreens(captureQueue)
    setCaptureQueue([])
  }

  useEffect(() => {
    if (!sessionActive) setCaptureQueue([])
  }, [sessionActive])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`

  // Truncate role for display
  const displayRole = sessionRole
    ? sessionRole.length > 40 ? sessionRole.slice(0, 40) + '…' : sessionRole
    : null

  const sessionLabel = sessionCompany && displayRole
    ? `${sessionCompany} — ${displayRole}`
    : sessionCompany || displayRole || 'Interview Session'

  return (
    <div className="toolbar">
      {/* Left — logo + session info */}
      <div className="toolbar-left">
        <div className="toolbar-logo-block">
          <img src="./logo.svg" alt="RETIAS" className="toolbar-logo-img" />
          <span className="toolbar-brand">RETIAS</span>
        </div>

        {sessionActive && (
          <div className="toolbar-session-info">
            <span className={`toolbar-status-dot ${isStarted ? 'live' : 'idle'}`} />
            <span className="toolbar-session-label">{sessionLabel}</span>
            {isStarted && <span className="toolbar-live-pill">Live</span>}
            {!isStarted && (
              <button type="button" className="toolbar-action-btn start" onClick={onStartSession}>
                ▶ Start
              </button>
            )}
          </div>
        )}

        {!sessionActive && (
          <div className="toolbar-session-info">
            <span className="toolbar-session-label muted">No active session</span>
          </div>
        )}
      </div>

      {/* Right — timer + actions + controls */}
      <div className="toolbar-right">
        {/* Conversation state badge */}
        {isStarted && convState === 'LISTENING_CONTEXT' && (
          <span className="state-badge listening">Listening…</span>
        )}
        {isStarted && (convState === 'QUESTION_CANDIDATE' || convState === 'QUESTION_CONFIRMED') && (
          <span className="state-badge processing">Processing…</span>
        )}
        {isStarted && convState === 'ANSWER_IN_PROGRESS' && (
          <span className="state-badge generating">Generating…</span>
        )}

        {/* Timer */}
        {isStarted && (
          <div className="toolbar-timer">
            <span className="timer-dot" />
            {timeStr}
          </div>
        )}

        {/* Capture / Analyse (online test vs regular) */}
        {isStarted && sessionActive && (
          isOnlineTest ? (
            <div className="capture-queue-ui">
              <button
                type="button"
                className="toolbar-action-btn capture-btn"
                onClick={handleCapture}
                disabled={captureQueue.length >= 5}
                title={captureQueue.length >= 5 ? 'Max 5 screenshots' : 'Capture screenshot'}
              >
                📸{captureQueue.length > 0 ? ` ${captureQueue.length}` : ' Capture'}
              </button>
              {captureQueue.length > 0 && (
                <button type="button" className="toolbar-icon-btn" onClick={() => setCaptureQueue([])} title="Clear captures">✕</button>
              )}
              <button
                type="button"
                className="toolbar-action-btn analyse-screen-btn"
                onClick={handleAnalyseAll}
                disabled={captureQueue.length === 0}
                title="Send all screenshots to AI"
              >
                Analyse All →
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`toolbar-action-btn analyse-screen-btn${analysing ? ' loading' : ''}${!isPremium ? ' locked' : ''}`}
              title={isPremium ? 'Analyse Screen' : '🔒 Premium feature'}
              onClick={isPremium ? handleAnalyseScreen : undefined}
              disabled={analysing || !isPremium}
            >
              {analysing ? '⏳' : <>{!isPremium && <span className="analyse-lock">🔒</span>}🖥 Analyse</>}
            </button>
          )
        )}

        {/* Mic toggle */}
        <button
          type="button"
          className={`toolbar-icon-btn ${micActive ? 'mic-active' : 'muted'}`}
          onClick={onToggleMic}
          title={micActive ? 'Mute microphone' : 'Unmute microphone'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          {!micActive && <span className="mic-slash" />}
        </button>

        {/* End session */}
        {sessionActive && (
          <button type="button" className="toolbar-action-btn danger" onClick={onStopSession}>
            ⏹ End Session
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
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
