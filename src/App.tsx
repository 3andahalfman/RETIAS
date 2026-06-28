import { useState, useEffect, useCallback, useRef } from 'react'
// panelSplit driven via panelsRef.current.style.setProperty('--panel-split', ...) for linter compliance
import Dashboard from './components/Dashboard'
import LoginPage from './components/LoginPage'
import SetupWizard, { SessionConfig } from './components/SetupWizard'
import MockInterviewSetup from './components/MockInterviewSetup'
import OnlineTestSetup from './components/OnlineTestSetup'
import SolvedTestPage from './components/SolvedTestPage'
import PastSessions from './components/PastSessions'
import Tutorial from './components/Tutorial'
import UpdateBanner from './components/UpdateBanner'
import UpdateGate from './components/UpdateGate'
import Toolbar from './components/Toolbar'
import Sidebar, { type SidebarItemId } from './components/Sidebar'
import TranscriptPanel from './components/Transcript'
import AnswerPanel from './components/AnswerPanel'
import AudioCapture from './components/AudioCapture'
import ManualPromptBar from './components/ManualPromptBar'
import CvManager from './components/CvManager'
import Settings, { loadSettings } from './components/Settings'
import { isAdminEmail } from './lib/admin'
import { hasPremiumPlusAccess } from './lib/premium-access'
import { invalidateSupabaseSessionSync } from './lib/supabase'
import PricingPage from './components/PricingPage'
import AutoTyper from './components/AutoTyper'
import './index.css'

type View = 'dashboard' | 'setup' | 'mock-interview' | 'past-sessions' | 'session' | 'online-test' | 'solve-test' | 'cv-manager' | 'auto-typer' | 'settings' | 'pricing'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [updateGatePassed, setUpdateGatePassed] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [cvs, setCvs] = useState<CV[]>([])

  const [view, setView] = useState<View>('dashboard')
  const [showTutorial, setShowTutorial] = useState<boolean>(
    () => !localStorage.getItem('retias_tutorial_seen')
  )
  const [sessionActive, setSessionActive] = useState(false)
  const [isStarted, setIsStarted] = useState(false)
  const [micActive, setMicActive] = useState(true)
  const [isOnlineTest, setIsOnlineTest] = useState(false)
  const [captureQueue, setCaptureQueue] = useState<string[]>([])
  const [isAnalysingCaptures, setIsAnalysingCaptures] = useState(false)
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

  // Restore session after startup update gate clears
  useEffect(() => {
    if (!updateGatePassed) return

    const savedId = localStorage.getItem('retias_user_id')
    if (savedId) {
      window.electronAPI?.authRestore(savedId)
        .then((u) => {
          if (u) {
            invalidateSupabaseSessionSync()
            setUser(u)
            setShowTutorial(!localStorage.getItem('retias_tutorial_seen'))
          } else {
            localStorage.removeItem('retias_user_id')
          }
        })
        .catch(() => localStorage.removeItem('retias_user_id'))
        .finally(() => setAuthLoading(false))
    } else {
      setAuthLoading(false)
    }
  }, [updateGatePassed])

  // Load CVs whenever user changes
  useEffect(() => {
    if (!user) { setCvs([]); return }
    window.electronAPI?.listCvs().then((list) => setCvs(list ?? [])).catch(() => {})
  }, [user])

  const refreshCvs = () => {
    window.electronAPI?.listCvs().then((list) => setCvs(list ?? [])).catch(() => {})
  }

  // Re-check premium status when the app regains focus — e.g. after the user
  // upgrades on the website in their browser, switching back unlocks premium.
  useEffect(() => {
    if (!user) return
    const handleFocus = () => {
      window.electronAPI?.authRefresh?.()
        .then((u) => { if (u) setUser(u) })
        .catch(() => {})
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user?.id])

  // Listen to deep question detector state
  useEffect(() => {
    window.electronAPI?.onConvState((state) => {
      setConvState(state)
    })
    const unsubDone = window.electronAPI?.onAnswerDone?.(() => {
      setIsAnalysingCaptures(false)
    })
    return () => {
      unsubDone?.()
    }
  }, [])

  // Apply persisted window prefs on load (stealth is admin-only; always on for others)
  useEffect(() => {
    const s = loadSettings()
    window.electronAPI?.setWindowOpacity?.(s.windowOpacity)
    window.electronAPI?.setAlwaysOnTop?.(s.alwaysOnTop)
    const stealthEnabled = user && isAdminEmail(user.email) ? s.stealthMode : true
    window.electronAPI?.setStealthMode?.(stealthEnabled)
  }, [user?.email])

  // Only restore the default size once when leaving the docked-mini state
  // (transitioning from a session back to a regular view). All other view
  // changes keep whatever size the user has chosen so the app stays responsive.
  useEffect(() => {
    if (view === 'session') return
    // Don't force-resize on every navigation — let users keep their custom size.
  }, [view])

  const handleLogin = (u: User) => {
    localStorage.setItem('retias_user_id', u.id)
    invalidateSupabaseSessionSync()
    setUser(u)
    setView('dashboard')
    setShowTutorial(!localStorage.getItem('retias_tutorial_seen'))
  }

  const handleLogout = () => {
    if (isDocked) {
      setIsDocked(false)
      window.electronAPI?.undockWindow()
    }
    localStorage.removeItem('retias_user_id')
    invalidateSupabaseSessionSync()
    window.electronAPI?.authLogout()
    setUser(null)
    setCvs([])
    setView('dashboard')
  }

  const handleCreateSession = (config: SessionConfig) => {
    const appSettings = loadSettings()
    let aiModel = config.aiModel || appSettings.aiModel
    // Opus 4.5 is gated to premium — silently downgrade for free users so the
    // session still works even if the option was somehow selected.
    if (aiModel === 'claude-opus-4-5' && !user?.is_premium) {
      aiModel = 'claude-sonnet-4-6'
    }
    setSessionConfig({ ...config, aiModel })
    setView('session')
    window.electronAPI?.startSession({
      resumeText: config.resumeText,
      targetRole: config.targetRole || config.jobDescription || 'Software Engineer',
      company: config.company,
      interviewType: config.interviewType || 'SWE',
      jobDescription: config.jobDescription,
      extraContext: config.extraContext,
      language: config.language,
      aiModel,
    })
    setSessionActive(true)
    setIsStarted(false)
    setMicActive(true)
  }

  const handleCreateOnlineTest = (testType: string) => {
    const appSettings = loadSettings()
    let aiModel = appSettings.aiModel
    if (aiModel === 'claude-opus-4-5' && !user?.is_premium) {
      aiModel = 'claude-sonnet-4-6'
    }
    setSessionConfig({ aiModel } as SessionConfig)
    setView('session')
    window.electronAPI?.startSession({ testType, aiModel })
    setSessionActive(true)
    setIsStarted(true) // auto-start — no intro needed
    setMicActive(false) // no mic for online tests
    setIsOnlineTest(true)
  }

  const handleStartSession = () => setIsStarted(true)

  const handleCapture = async () => {
    if (captureQueue.length >= 5) return
    try {
      const base64 = await window.electronAPI?.captureScreen()
      if (base64) setCaptureQueue(prev => [...prev, base64])
    } catch {}
  }

  const handleAnalyseAll = () => {
    if (captureQueue.length === 0 || isAnalysingCaptures) return
    setIsAnalysingCaptures(true)
    window.electronAPI?.analyseScreens(captureQueue)
    setCaptureQueue([])
  }

  const handleStop = () => {
    window.electronAPI?.stopSession()
    setSessionActive(false)
    setIsStarted(false)
    setIsOnlineTest(false)
    setCaptureQueue([])
    setIsAnalysingCaptures(false)
    setView('dashboard')
    if (isDocked) {
      setIsDocked(false)
      window.electronAPI?.undockWindow()
    }
  }

  const handleToggleMic = () => setMicActive((prev) => !prev)

  // Block auth/login until packaged update check completes (dev skips instantly)
  if (!updateGatePassed) {
    return <UpdateGate onPassed={() => setUpdateGatePassed(true)} />
  }

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
    return (
      <LoginPage
        onLogin={handleLogin}
        isDocked={isDocked}
        onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
        onUndock={() => { setIsDocked(false); window.electronAPI?.undockWindow() }}
      />
    )
  }

  // Docked non-session views
  if (isDocked && (view === 'setup' || view === 'dashboard' || view === 'mock-interview' || view === 'online-test' || view === 'solve-test' || view === 'past-sessions' || view === 'cv-manager' || view === 'auto-typer' || view === 'settings' || view === 'pricing')) {
    return (
      <div className="app-root docked">
        <div
          className="docked-content"
          onClick={() => { setIsDocked(false); window.electronAPI?.undockWindow() }}
          onMouseEnter={() => window.electronAPI?.setIgnoreMouseEvents(false)}
          onMouseLeave={() => window.electronAPI?.setIgnoreMouseEvents(true)}
          title="Click to expand"
        >
          <img className="docked-logo" src="./logo.svg" alt="Logo" />
        </div>
      </div>
    )
  }

  const handleSidebarNavigate = (item: SidebarItemId) => {
    if (item === 'real-interview') setView('setup')
    else if (item === 'mock-interview') setView('mock-interview')
    else if (item === 'online-assessment') setView('online-test')
    else if (item === 'solved-assessment') setView('solve-test')
    else if (item === 'sessions') setView('past-sessions')
    else if (item === 'dashboard') setView('dashboard')
    else if (item === 'cv-manager') setView('cv-manager')
    else if (item === 'auto-typer') setView('auto-typer')
    else if (item === 'settings') setView('settings')
  }

  if (view === 'dashboard') {
    return (
      <div className="app-root">
        <UpdateBanner />
        <div className="page-layout">
          <Sidebar activeItem="dashboard" user={user} onNavigate={handleSidebarNavigate} onLogout={handleLogout} onUpgrade={() => setView('pricing')} />
          <div className="page-main">
            <Dashboard
              onPastSessions={() => setView('past-sessions')}
              onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
              user={user}
              onLogout={handleLogout}
              onCvsChange={refreshCvs}
            />
          </div>
        </div>
        {showTutorial && <Tutorial onDone={() => setShowTutorial(false)} />}
      </div>
    )
  }

  if (view === 'mock-interview') {
    return (
      <div className="app-root">
        <div className="page-layout">
          <Sidebar activeItem="mock-interview" user={user} onNavigate={handleSidebarNavigate} onLogout={handleLogout} onUpgrade={() => setView('pricing')} />
          <div className="page-main">
            <MockInterviewSetup
              onCreateSession={handleCreateSession}
              onBack={() => setView('dashboard')}
              onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
              cvs={cvs}
            />
          </div>
        </div>
      </div>
    )
  }

  if (view === 'setup') {
    return (
      <div className="app-root">
        <div className="page-layout">
          <Sidebar activeItem="real-interview" user={user} onNavigate={handleSidebarNavigate} onLogout={handleLogout} onUpgrade={() => setView('pricing')} />
          <div className="page-main">
            <SetupWizard
              onCreateSession={handleCreateSession}
              onBack={() => setView('dashboard')}
              onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
              cvs={cvs}
              user={user}
            />
          </div>
        </div>
      </div>
    )
  }

  if (view === 'online-test') {
    return (
      <div className="app-root">
        <div className="page-layout">
          <Sidebar activeItem="online-assessment" user={user} onNavigate={handleSidebarNavigate} onLogout={handleLogout} onUpgrade={() => setView('pricing')} />
          <div className="page-main">
            <OnlineTestSetup
              onStart={handleCreateOnlineTest}
              onBack={() => setView('dashboard')}
              onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (view === 'solve-test') {
    return (
      <div className="app-root">
        <div className="page-layout">
          <Sidebar activeItem="solved-assessment" user={user} onNavigate={handleSidebarNavigate} onLogout={handleLogout} onUpgrade={() => setView('pricing')} />
          <div className="page-main">
            <SolvedTestPage
              user={user}
              onBack={() => setView('dashboard')}
              onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (view === 'cv-manager') {
    return (
      <div className="app-root">
        <div className="page-layout">
          <Sidebar activeItem="cv-manager" user={user} onNavigate={handleSidebarNavigate} onLogout={handleLogout} onUpgrade={() => setView('pricing')} />
          <div className="page-main">
            <CvManager
              cvs={cvs}
              onCvsChange={refreshCvs}
              onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (view === 'past-sessions') {
    return (
      <div className="app-root">
        <div className="page-layout">
          <Sidebar activeItem="sessions" user={user} onNavigate={handleSidebarNavigate} onLogout={handleLogout} onUpgrade={() => setView('pricing')} />
          <div className="page-main">
            <PastSessions
              onNewSession={() => setView('setup')}
              onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (view === 'settings') {
    return (
      <div className="app-root">
        <div className="page-layout">
          <Sidebar activeItem="settings" user={user} onNavigate={handleSidebarNavigate} onLogout={handleLogout} onUpgrade={() => setView('pricing')} />
          <div className="page-main">
            <Settings
              user={user}
              onLogout={handleLogout}
              onUserUpdate={(updates) => setUser(prev => prev ? { ...prev, ...updates } : prev)}
              onUpgrade={() => setView('pricing')}
            />
          </div>
        </div>
      </div>
    )
  }

  if (view === 'auto-typer') {
    return (
      <div className="app-root">
        <div className="page-layout">
          <Sidebar activeItem="auto-typer" user={user} onNavigate={handleSidebarNavigate} onLogout={handleLogout} onUpgrade={() => setView('pricing')} />
          <div className="page-main">
            <AutoTyper
              onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
              locked={!hasPremiumPlusAccess(user)}
              onUpgrade={() => setView('pricing')}
            />
          </div>
        </div>
      </div>
    )
  }

  if (view === 'pricing') {
    return (
      <div className="app-root">
        <div className="page-layout">
          <Sidebar activeItem="dashboard" user={user} onNavigate={handleSidebarNavigate} onLogout={handleLogout} onUpgrade={() => setView('pricing')} />
          <div className="page-main">
            <PricingPage
              onBack={() => setView('dashboard')}
              onDock={() => { setIsDocked(true); window.electronAPI?.dockWindow() }}
            />
          </div>
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
    <div className={`app-root session ${isDocked ? 'docked' : ''}`}>
      <AudioCapture active={isStarted && sessionActive && micActive} />

      {isDocked && (
        <div
          className="docked-content"
          onClick={toggleDock}
          onMouseEnter={() => window.electronAPI?.setIgnoreMouseEvents(false)}
          onMouseLeave={() => window.electronAPI?.setIgnoreMouseEvents(true)}
          title="Click to expand"
        >
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
          sessionCompany={sessionConfig?.company}
          sessionRole={sessionConfig?.targetRole || sessionConfig?.jobDescription}
          aiModel={sessionConfig?.aiModel}
          countdownSec={!user?.is_premium && !isOnlineTest ? 10 * 60 : undefined}
        />

        <div className="panels" ref={panelsRef}>
          <TranscriptPanel micActive={micActive} />
          <div className="panel-divider" onMouseDown={handleDividerMouseDown} />
          <AnswerPanel
            isPremium={user?.is_premium ?? false}
            isOnlineTest={isOnlineTest}
            isStarted={isStarted}
            captureQueue={captureQueue}
            onCapture={handleCapture}
            onAnalyseAll={handleAnalyseAll}
            onClearCaptures={() => setCaptureQueue([])}
            isAnalysingCaptures={isAnalysingCaptures}
            canAutoType={user ? hasPremiumPlusAccess(user) : false}
            canParaphrase={user ? hasPremiumPlusAccess(user) : false}
          />
        </div>

        <ManualPromptBar
          sessionActive={sessionActive}
          isPremium={user?.is_premium ?? false}
        />
      </div>
    </div>
  )
}
