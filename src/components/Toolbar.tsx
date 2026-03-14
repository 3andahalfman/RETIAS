import { useState, useEffect, useRef } from 'react'

/**
 * Toolbar — top bar of the floating overlay.
 * Layout: [🎙 bars] [🎤] [▶ Start] │ AI Answer ✨ [badge] │ ⏱ MM:SS │ [End] [✥] [↙] [✕]
 */

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
  convState = 'IDLE'
}: ToolbarProps) {
  const [elapsed, setElapsed] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [snapOpen, setSnapOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  // Online / offline detection
  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <div className="toolbar">
      {/* Left section: audio controls */}
      <div className="toolbar-left">
        <div className={`toolbar-bars ${sessionActive ? 'active' : ''}`}>
          <span /><span /><span /><span />
        </div>

        <button
          type="button"
          className={`toolbar-icon-btn ${micActive ? '' : 'muted'}`}
          onClick={onToggleMic}
          title={micActive ? 'Mute microphone' : 'Unmute microphone'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          {!micActive && <span className="mic-slash" />}
        </button>

        {!isStarted && (
          <button type="button" className="toolbar-action-btn start" onClick={onStartSession}>
            ▶ Start Interview
          </button>
        )}
      </div>

      {/* Center: label + state badge */}
      <div className="toolbar-center">
        {isStarted && (
          <div className="toolbar-center-inner">
            <span className="toolbar-label">AI Answer ✨</span>
            {convState === 'LISTENING_CONTEXT' && (
              <span className="state-badge listening">Listening...</span>
            )}
            {(convState === 'QUESTION_CANDIDATE' || convState === 'QUESTION_CONFIRMED') && (
              <span className="state-badge processing">Processing...</span>
            )}
            {convState === 'ANSWER_IN_PROGRESS' && (
              <span className="state-badge generating">Generating...</span>
            )}
          </div>
        )}
      </div>

      {/* Right section: timer + controls */}
      <div className="toolbar-right">
        {isStarted && (
          <div className="toolbar-timer">
            <span className="timer-dot" />
            {timeStr}
          </div>
        )}

        {/* End session / menu */}
        <div className="toolbar-menu-wrapper" ref={menuRef}>
          {sessionActive ? (
            <button type="button" className="toolbar-action-btn danger" onClick={() => { onStopSession(); setMenuOpen(false) }}>
              ⏹ End
            </button>
          ) : (
            <button type="button" className="toolbar-icon-btn" onClick={() => setMenuOpen(!menuOpen)} title="Menu">⋮</button>
          )}

          {menuOpen && !sessionActive && (
            <div className="toolbar-dropdown">
              <button type="button" className="dropdown-item" onClick={() => { window.electronAPI?.closeWindow(); setMenuOpen(false) }}>
                ✕ Exit
              </button>
            </div>
          )}
        </div>

        {/* Online indicator */}
        <span className={`net-indicator ${isOnline ? 'online' : 'offline'}`} title={isOnline ? 'Online' : 'No internet connection'} />

        <div className="toolbar-divider" />

        {/* Snap layout */}
        {!isDocked && (
          <div className="snap-btn-wrapper">
            <button type="button" className="toolbar-icon-btn" title="Snap layout" onClick={() => setSnapOpen(!snapOpen)}>✥</button>
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

        {/* Dock / Undock */}
        <button
          type="button"
          className="toolbar-icon-btn"
          onClick={onToggleDock}
          title={isDocked ? 'Expand window' : 'Collapse to mini logo'}
        >
          {isDocked ? '⤡' : '↙'}
        </button>

        {/* Close */}
        <button
          type="button"
          className="toolbar-icon-btn close"
          onClick={() => window.electronAPI?.closeWindow()}
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
