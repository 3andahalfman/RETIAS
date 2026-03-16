import { useState, useEffect, useCallback, useRef } from 'react'
// panelSplit driven via panelsRef.current.style.setProperty('--panel-split', ...) for linter compliance
import Dashboard from './components/Dashboard'
import LoginPage from './components/LoginPage'
import SetupWizard, { SessionConfig } from './components/SetupWizard'
import MockInterviewSetup from './components/MockInterviewSetup'
import PastSessions from './components/PastSessions'
import Tutorial from './components/Tutorial'
import UpdateBanner from './components/UpdateBanner'
import Toolbar from './components/Toolbar'
import TranscriptPanel from './components/Transcript'
import AnswerPanel from './components/AnswerPanel'
import AudioCapture from './components/AudioCapture'
import './index.css'

type View = 'dashboard' | 'setup' | 'mock-interview' | 'past-sessions' | 'session'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [cvs, setCvs] = useState<CV[]>([])

  const [view, setView] = useState<View>('dashboard')
  const [showTutorial, setShowTutorial] = useState<boolean>(
    () => !localStorage.getItem('retias_tutorial_seen')
  )
  const [sessionActive, setSessionActive] = useState(false)
  const [isStarted, setIsStarted] = useState(false)
  const [micActive, setMicActive] = useState(true)
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null)
  const [convState, setConvState] = useState<string>('IDLE')
  const [isDocked, setIsDocked] = useState(false)
  const isDraggingRef = useRef(false)
  const panelsRef = useRef<HTMLDivElement>(null)

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    const onMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !panelsRef.current) return
      const rect = panelsRef.current.getBoundingClientRect()
      const pct = Math.min(60, Math.max(20, ((moveEvent.clientX - rect.left) / rect.width) * 100))
      panelsRef.current.style.setProperty('--panel-split', `${Math.round(pct)}%`)
    }
    const onUp = () => {
      isDraggingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Restore session on app start
  useEffect(() => {
    const savedId = localStorage.getItem('retias_user_id')
    if (savedId) {
      window.electronAPI?.authRestore(savedId)
        .then((u) => {
          if (u) {
            setUser(u)
          } else {
            localStorage.removeItem('retias_user_id')
          }
        })
        .catch(() => localStorage.removeItem('retias_user_id'))
        .finally(() => setAuthLoading(false))
    } else {
      setAuthLoading(false)
    }
  }, [])

  // Load CVs whenever user changes
  useEffect(() => {
    if (!user) { setCvs([]); return }
    window.electronAPI?.listCvs().then((list) => setCvs(list ?? [])).catch(() => {})
  }, [user])

  // Listen to deep question detector state
  useEffect(() => {
    window.electronAPI?.onConvState((state) => {
      setConvState(state)
    })
  }, [])

  // Handle window resizing when view changes
  useEffect(() => {
    if (view === 'session') {
      window.electronAPI?.resizeWindow(1100, 750, true)
    } else if (view === 'past-sessions') {
      window.electronAPI?.resizeWindow(860, 660, false)
    }
  }, [view])

  const handleLogin = (u: User) => {
    localStorage.setItem('retias_user_id', u.id)
    setUser(u)
  }

  const handleLogout = () => {
    localStorage.removeItem('retias_user_id')
    window.electronAPI?.authLogout()
    setUser(null)
    setCvs([])
  }

  const handleCreateSession = (config: SessionConfig) => {
    setSessionConfig(config)
    setView('session')
    window.electronAPI?.startSession({
      resumeText: config.resumeText,
      targetRole: config.targetRole || config.jobDescription || 'Software Engineer',
      company: config.company,
      interviewType: config.interviewType || 'SWE',
      jobDescription: config.jobDescription,
      extraContext: config.extraContext,
      language: config.language,
    })
    setSessionActive(true)
    setIsStarted(false)
    setMicActive(true)
  }

  const handleStartSession = () => setIsStarted(true)

  const handleStop = () => {
    window.electronAPI?.stopSession()
    setSessionActive(false)
    setIsStarted(false)
    setView('dashboard')
    if (isDocked) {
      setIsDocked(false)
      window.electronAPI?.undockWindow()
    }
  }

  const handleToggleMic = () => setMicActive((prev) => !prev)

  // Loading splash
  if (authLoading) {
    return (
      <div className="app-root auth-loading-root">
        <img src="./logo.svg" alt="RETIAS" className="auth-loading-logo" />
      </div>
    )
  }

  // Auth gate
  if (!user) {
    return <LoginPage onLogin={handleLogin} />
  }

  // Docked non-session views
  if (isDocked && (view === 'setup' || view === 'dashboard' || view === 'mock-interview')) {
    return (
      <div className="app-root docked">
        <div className="docked-content" onClick={() => {
          setIsDocked(false)
          window.electronAPI?.undockWindow()
        }}>
          <img className="docked-logo" src="./logo.svg" alt="Logo" title="Click to expand" />
        </div>
      </div>
    )
  }

  if (view === 'dashboard') {
    return (
      <div className="app-root">
        <UpdateBanner />
        <Dashboard
          onNewSession={() => setView('setup')}
          onPastSessions={() => setView('past-sessions')}
          onMockInterview={() => setView('mock-interview')}
          onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
          user={user}
          onLogout={handleLogout}
        />
        {showTutorial && <Tutorial onDone={() => setShowTutorial(false)} />}
      </div>
    )
  }

  if (view === 'mock-interview') {
    return (
      <div className="app-root">
        <MockInterviewSetup
          onCreateSession={handleCreateSession}
          onBack={() => setView('dashboard')}
          onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
          cvs={cvs}
        />
      </div>
    )
  }

  if (view === 'setup') {
    return (
      <div className="app-root">
        <SetupWizard
          onCreateSession={handleCreateSession}
          onBack={() => setView('dashboard')}
          onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
          cvs={cvs}
        />
      </div>
    )
  }

  if (view === 'past-sessions') {
    return (
      <div className="app-root setup-root setup-root-history">
        <div className="ps-history-container">
          <PastSessions />
        </div>
        <div className="setup-footer setup-footer-history">
          <button type="button" className="setup-btn secondary" onClick={() => setView('dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const toggleDock = () => {
    const newDocked = !isDocked
    setIsDocked(newDocked)
    if (newDocked) window.electronAPI?.dockWindow()
    else window.electronAPI?.undockWindow()
  }

  return (
    <div className={`app-root ${isDocked ? 'docked' : ''}`}>
      <AudioCapture active={isStarted && sessionActive && micActive} />

      {isDocked && (
        <div className="docked-content" onClick={toggleDock}>
          <img className="docked-logo" src="./logo.svg" alt="Logo" />
          <div className={`docked-bars ${isStarted && sessionActive && micActive ? 'active' : ''}`}>
            <span /><span /><span />
          </div>
        </div>
      )}

      <div className={isDocked ? 'session-panels-hidden' : 'session-panels'}>
        <Toolbar
          sessionActive={sessionActive}
          isStarted={isStarted}
          onStartSession={handleStartSession}
          onStopSession={handleStop}
          micActive={micActive}
          onToggleMic={handleToggleMic}
          isDocked={isDocked}
          onToggleDock={toggleDock}
          convState={convState}
          isPremium={user?.is_premium ?? false}
        />

        <div className="panels" ref={panelsRef}>
          <TranscriptPanel />
          <div className="panel-divider" onMouseDown={handleDividerMouseDown} />
          <AnswerPanel />
        </div>
      </div>
    </div>
  )
}
