import { useEffect, useRef, useState } from 'react'

interface DashboardMetrics {
  totalSessions: number
  totalQAs: number
  totalTranscriptLines: number
  avgDurationMins: number
  topCompany: string | null
  recentSessions: {
    session_id: string
    company: string
    target_role: string
    started_at: number
    ended_at: number | null
    qa_count: number
  }[]
}

interface Props {
  onNewSession: () => void
  onPastSessions: () => void
  onMockInterview: () => void
  onOnlineTest: () => void
  onDock: () => void
  user: User
  onLogout: () => void
  onCvsChange?: () => void
}

export default function Dashboard({ onNewSession, onPastSessions, onMockInterview, onOnlineTest, onDock, user, onLogout, onCvsChange }: Props) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [showSnapGrid, setShowSnapGrid] = useState(false)
  const [cvs, setCvs] = useState<CV[]>([])
  const [cvUploading, setCvUploading] = useState(false)
  const [cvError, setCvError] = useState('')
  const cvFileInputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.electronAPI?.getDashboardMetrics().then((m) => setMetrics(m ?? null))
  }, [])

  useEffect(() => {
    loadCvs()
  }, [])

  async function loadCvs() {
    try {
      const list = await window.electronAPI?.listCvs()
      setCvs(list ?? [])
    } catch {}
  }

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCvError('')
    setCvUploading(true)
    try {
      const ext = file.name.toLowerCase().split('.').pop()
      let text = ''
      if (ext === 'pdf' || ext === 'docx' || ext === 'doc') {
        const reader = new FileReader()
        const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          reader.onload = (ev) => resolve(ev.target?.result as ArrayBuffer)
          reader.onerror = reject
          reader.readAsArrayBuffer(file)
        })
        text = await window.electronAPI?.extractResumeText?.(buffer, file.name) ?? ''
        if (!text || text.startsWith('ERROR:')) {
          setCvError(`Could not read file. Try a .txt version.`)
          return
        }
      } else {
        text = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = (ev) => resolve((ev.target?.result as string) || '')
          r.onerror = reject
          r.readAsText(file)
        })
      }
      const name = file.name.replace(/\.[^/.]+$/, '') // strip extension
      await window.electronAPI?.saveCv(name, text)
      await loadCvs()
      onCvsChange?.()
    } catch (err: any) {
      setCvError(err?.message ?? 'Upload failed')
    } finally {
      setCvUploading(false)
      if (cvFileInputRef.current) cvFileInputRef.current.value = ''
    }
  }

  const handleDeleteCv = async (cvId: string) => {
    await window.electronAPI?.deleteCv(cvId)
    await loadCvs()
    onCvsChange?.()
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatDuration(started: number, ended: number | null) {
    if (!ended) return 'In progress'
    const mins = Math.round((ended - started) / 60000)
    if (mins < 1) return '<1m'
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  return (
    <div className="dash-root" ref={rootRef}>
      {/* Window controls — absolute top-right */}
      <div className="dash-win-controls">
        <div className="snap-btn-wrapper">
          <button type="button" className="setup-window-btn" title="Snap layout" onClick={() => setShowSnapGrid(!showSnapGrid)}>✥</button>
          {showSnapGrid && (
            <div className="snap-grid-dropdown">
              <div className="snap-grid-row">
                <button type="button" className="snap-grid-cell" title="Top Left"    onClick={() => { window.electronAPI?.snapWindow('tl'); setShowSnapGrid(false) }} />
                <button type="button" className="snap-grid-cell" title="Top Middle"  onClick={() => { window.electronAPI?.snapWindow('tm'); setShowSnapGrid(false) }} />
                <button type="button" className="snap-grid-cell" title="Top Right"   onClick={() => { window.electronAPI?.snapWindow('tr'); setShowSnapGrid(false) }} />
              </div>
              <div className="snap-grid-row">
                <button type="button" className="snap-grid-cell" title="Bottom Left"   onClick={() => { window.electronAPI?.snapWindow('bl'); setShowSnapGrid(false) }} />
                <button type="button" className="snap-grid-cell" title="Bottom Middle" onClick={() => { window.electronAPI?.snapWindow('bm'); setShowSnapGrid(false) }} />
                <button type="button" className="snap-grid-cell" title="Bottom Right"  onClick={() => { window.electronAPI?.snapWindow('br'); setShowSnapGrid(false) }} />
              </div>
            </div>
          )}
        </div>
        <button type="button" className="setup-window-btn" title="Dock" onClick={onDock}>↙</button>
        <button type="button" className="setup-window-btn dash-signout-btn" title="Sign out" onClick={onLogout}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
        <button type="button" className="setup-window-btn close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>✕</button>
      </div>

      {/* Hero */}
      <div className="dash-hero">
        <div className="dash-hero-title">
          Good morning, {user.display_name?.split(' ')[0] || user.email?.split('@')[0] || 'there'} 👋
        </div>
        <div className="dash-hero-sub">Ready for your next interview? Let's get started.</div>
      </div>

      {/* Metrics row — always show */}
      <div className="dash-metrics-row">
        <div className="dash-metric-card">
          <div className="dash-metric-value">{metrics?.totalSessions ?? 0}</div>
          <div className="dash-metric-label">Sessions</div>
        </div>
        <div className="dash-metric-card">
          <div className="dash-metric-value">{metrics?.totalQAs ?? 0}</div>
          <div className="dash-metric-label">This Week</div>
        </div>
        <div className="dash-metric-card">
          <div className="dash-metric-value">{metrics && metrics.avgDurationMins > 0 ? `${metrics.avgDurationMins}m` : '—'}</div>
          <div className="dash-metric-label">Avg Duration</div>
        </div>
      </div>

      {/* Start a Session */}
      <div className="dash-section-title">Start a Session</div>
      <div className="dash-session-cards">
        <div className="dash-session-card">
          <div className="dash-session-card-icon dash-session-card-icon-blue">💼</div>
          <div className="dash-session-card-body">
            <div className="dash-session-card-title">Real Interview</div>
            <div className="dash-session-card-desc">You're ready! Let's ace it and let AI handle the rest.</div>
            <button type="button" className="dash-session-card-btn" onClick={onNewSession}>More Sessions →</button>
          </div>
        </div>
        <div className="dash-session-card">
          <div className="dash-session-card-icon dash-session-card-icon-teal">🎭</div>
          <div className="dash-session-card-body">
            <div className="dash-session-card-title">Mock Interview</div>
            <div className="dash-session-card-desc">Practice with a YouTube interviewer — be as real as a real one.</div>
            <button type="button" className="dash-session-card-btn" onClick={onMockInterview}>Start Mock →</button>
          </div>
        </div>
        <div
          className={`dash-session-card${!user.is_premium ? ' locked' : ''}`}
          title={!user.is_premium ? '🔒 Premium — upgrade to unlock' : undefined}
        >
          <div className="dash-session-card-icon dash-session-card-icon-teal2">🧪</div>
          <div className="dash-session-card-body">
            <div className="dash-session-card-title">Online Test {!user.is_premium && '🔒'}</div>
            <div className="dash-session-card-desc">Solve coding challenges and assessments with ease, using AI.</div>
            <button
              type="button"
              className="dash-session-card-btn"
              onClick={user.is_premium ? onOnlineTest : undefined}
              disabled={!user.is_premium}
            >+ Start Test →</button>
          </div>
        </div>
      </div>

      {/* Recent Sessions */}
      {metrics && metrics.recentSessions.length > 0 && (
        <>
          <div className="dash-section-title dash-section-title-spaced">Recent Sessions</div>
          <div className="dash-recent-list">
            {metrics.recentSessions.map((s) => (
              <div key={s.session_id} className="dash-recent-item">
                <div className="dash-recent-left">
                  <div className="dash-recent-company">{s.company || 'Unknown Company'}</div>
                  <div className="dash-recent-role">{s.target_role ? (s.target_role.length > 80 ? s.target_role.slice(0, 80) + '…' : s.target_role) : 'Interview Session'}</div>
                </div>
                <div className="dash-recent-right">
                  <div className="dash-recent-date">{formatDate(s.started_at)}</div>
                  <div className="dash-recent-meta">{formatDuration(s.started_at, s.ended_at)} · {s.qa_count} Q&As</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="dash-footer">
        <span className="dash-footer-text">RETIAS — Real Time Interview Assistant Software</span>
        <span className="dash-footer-version">v{__APP_VERSION__}</span>
      </div>
    </div>
  )
}
