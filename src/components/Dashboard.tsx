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
  const cvFileInputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.electronAPI?.getDashboardMetrics().then((m) => setMetrics(m ?? null))
  }, [])

  useEffect(() => { loadCvs() }, [])

  async function loadCvs() {
    try {
      const list = await window.electronAPI?.listCvs()
      setCvs(list ?? [])
    } catch {}
  }

  const handleCvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
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
      } else {
        text = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = (ev) => resolve((ev.target?.result as string) || '')
          r.onerror = reject
          r.readAsText(file)
        })
      }
      const name = file.name.replace(/\.[^/.]+$/, '')
      await window.electronAPI?.saveCv(name, text)
      await loadCvs()
      onCvsChange?.()
    } catch {}
    finally { if (cvFileInputRef.current) cvFileInputRef.current.value = '' }
  }

  function formatDate(ts: number) {
    const d = new Date(ts)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (diffDays === 0) return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    if (diffDays === 1) return `Yesterday, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
  }

  function formatDuration(started: number, ended: number | null) {
    if (!ended) return 'In progress'
    const mins = Math.round((ended - started) / 60000)
    if (mins < 1) return '<1m'
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  function getSessionType(company: string, role: string) {
    const c = (company || '').toLowerCase()
    const r = (role || '').toLowerCase()
    if (c.includes('mock') || r.includes('mock')) return 'Mock'
    if (c.includes('online') || r.includes('test') || r.includes('assessment')) return 'Online Test'
    return 'Real Interview'
  }

  function getTypeDotColor(type: string) {
    if (type === 'Mock') return '#15CDCA'
    if (type === 'Online Test') return '#F59E0B'
    return '#4F80E2'
  }

  const firstName = user.display_name?.split(' ')[0] || user.email?.split('@')[0] || 'there'

  return (
    <div className="dash-root" ref={rootRef}>

      {/* ── Window controls ── */}
      <div className="dash-win-controls">
        {/* Bell / notifications */}
        <button type="button" className="dash-wc-btn dash-wc-bell" title="Notifications">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>
        {/* Snap */}
        <div className="snap-btn-wrapper">
          <button type="button" className="dash-wc-btn dash-wc-snap" title="Snap layout" onClick={() => setShowSnapGrid(!showSnapGrid)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
          </button>
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
        {/* Dock */}
        <button type="button" className="dash-wc-btn dash-wc-dock" title="Dock" onClick={onDock}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>
        {/* Close */}
        <button type="button" className="dash-wc-btn dash-wc-close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* ── Hero ── */}
      <div className="dash-hero">
        <div className="dash-hero-title">Good morning, {firstName} 🌅</div>
        <div className="dash-hero-sub">Ready for your next interview? Let's get started.</div>
      </div>

      {/* ── Metrics ── */}
      <div className="dash-metrics-row">
        <div className="dash-metric-card">
          <div className="dash-metric-header">
            <span className="dash-metric-cat">Sessions</span>
            <span className="dash-metric-icon-badge" style={{ background: 'rgba(79,128,226,0.15)', color: '#4F80E2' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </span>
          </div>
          <div className="dash-metric-value">{metrics?.totalSessions ?? 0}</div>
          <div className="dash-metric-desc">Total sessions</div>
        </div>
        <div className="dash-metric-card">
          <div className="dash-metric-header">
            <span className="dash-metric-cat">This Week</span>
            <span className="dash-metric-icon-badge" style={{ background: 'rgba(21,205,202,0.15)', color: '#15CDCA' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
              </svg>
            </span>
          </div>
          <div className="dash-metric-value">{metrics?.totalQAs ?? 0}</div>
          <div className="dash-metric-desc">Sessions this week</div>
        </div>
        <div className="dash-metric-card">
          <div className="dash-metric-header">
            <span className="dash-metric-cat">CVs Saved</span>
            <span className="dash-metric-icon-badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            </span>
          </div>
          <div className="dash-metric-value">{cvs.length}</div>
          <div className="dash-metric-desc">Saved resumes</div>
        </div>
      </div>

      {/* ── Start a Session ── */}
      <div className="dash-section-title">Start a Session</div>
      <div className="dash-session-cards">

        {/* Real Interview */}
        <div className="dash-sc">
          <div className="dash-sc-icon" style={{ background: 'rgba(79,128,226,0.15)', border: '1px solid rgba(79,128,226,0.25)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4F80E2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
          </div>
          <div className="dash-sc-title">Real Interview</div>
          <div className="dash-sc-desc">For a real job application with job URL or description</div>
          <button type="button" className="dash-sc-btn dash-sc-btn-outline" onClick={onNewSession}>+ New Session</button>
        </div>

        {/* Mock Interview */}
        <div className="dash-sc">
          <div className="dash-sc-icon" style={{ background: 'rgba(21,205,202,0.15)', border: '1px solid rgba(21,205,202,0.25)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#15CDCA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div className="dash-sc-title">Mock Interview</div>
          <div className="dash-sc-desc">Practice with a YouTube mock interviewer — AI coaches you live</div>
          <button type="button" className="dash-sc-btn dash-sc-btn-green" onClick={onMockInterview}>▷ Start Mock</button>
        </div>

        {/* Online Test */}
        <div className={`dash-sc${!user.is_premium ? ' dash-sc-locked' : ''}`}
          title={!user.is_premium ? '🔒 Premium — upgrade to unlock' : undefined}>
          <div className="dash-sc-icon" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="dash-sc-title">Online Test {!user.is_premium && <span style={{ fontSize: 12 }}>🔒</span>}</div>
          <div className="dash-sc-desc">Solve coding challenges and assessments with real-time AI help</div>
          <button type="button" className="dash-sc-btn dash-sc-btn-amber"
            onClick={user.is_premium ? onOnlineTest : undefined}
            disabled={!user.is_premium}>
            {'<>'} Start Test
          </button>
        </div>

      </div>

      {/* ── Recent Sessions ── */}
      {metrics && metrics.recentSessions.length > 0 && (
        <>
          <div className="dash-section-title dash-section-title-spaced">Recent Sessions</div>
          <div className="dash-recent-list">
            {metrics.recentSessions.map((s) => {
              const type = getSessionType(s.company, s.target_role)
              const dotColor = getTypeDotColor(type)
              const duration = formatDuration(s.started_at, s.ended_at)
              const date = formatDate(s.started_at)
              return (
                <div key={s.session_id} className="dash-recent-row">
                  <span className="dash-recent-dot" style={{ background: dotColor }} />
                  <div className="dash-recent-info">
                    <div className="dash-recent-title">
                      {s.company || 'Unknown'} — {s.target_role ? (s.target_role.length > 60 ? s.target_role.slice(0, 60) + '…' : s.target_role) : 'Interview'}
                    </div>
                    <div className="dash-recent-sub">{type} · {duration} · {date}</div>
                  </div>
                  <span className={`dash-recent-badge ${s.ended_at ? 'completed' : 'in-progress'}`}>
                    {s.ended_at ? 'Completed' : 'In Progress'}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Hidden CV upload input — preserved for onCvsChange functionality */}
      <input ref={cvFileInputRef} type="file" accept=".txt,.md,.pdf,.docx,.doc"
        title="Upload CV" aria-label="Upload CV file"
        className="dash-cv-file-input" onChange={handleCvUpload} />

      <div className="dash-footer">
        <span className="dash-footer-text">RETIAS — Real Time Interview Assistant Software</span>
        <span className="dash-footer-version">v{__APP_VERSION__}</span>
      </div>
    </div>
  )
}
