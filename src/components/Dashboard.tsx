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
  onDock: () => void
  user: User
  onLogout: () => void
}

export default function Dashboard({ onNewSession, onPastSessions, onMockInterview, onDock, user, onLogout }: Props) {
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
      {/* Topbar */}
      <div className="setup-topbar">
        <div className="setup-topbar-left">
          <img src="./logo.svg" alt="RETIAS" className="setup-logo" />
          <span className="setup-brand-name">RETIAS</span>
        </div>
        <div className="setup-topbar-center">
          <span className="dash-user-info" title={user.email}>
            {user.display_name || user.email}
          </span>
          {user.is_premium && <span className="dash-premium-badge">✨ PRO</span>}
        </div>
        <div className="setup-topbar-right">
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
      </div>

      {/* Hero */}
      <div className="dash-hero">
        <div className="dash-hero-title">Real Time Interview Assistant</div>
        <div className="dash-hero-sub">AI-powered real-time coaching for your interviews</div>
      </div>

      {/* CTA buttons */}
      <div className="dash-cta-row">
        <button type="button" className="dash-cta-btn primary" onClick={onNewSession}>
          <span className="dash-cta-icon">+</span>
          <span>
            <span className="dash-cta-label">New Session</span>
            <span className="dash-cta-desc">Start a live interview session</span>
          </span>
        </button>
        <button type="button" className="dash-cta-btn secondary" onClick={onPastSessions}>
          <span className="dash-cta-icon">🗂</span>
          <span>
            <span className="dash-cta-label">Past Sessions</span>
            <span className="dash-cta-desc">Review saved interviews & answers</span>
          </span>
        </button>
        <button type="button" className="dash-cta-btn mock" onClick={onMockInterview}>
          <span className="dash-cta-icon">🎭</span>
          <span>
            <span className="dash-cta-label">Mock Interview</span>
            <span className="dash-cta-desc">Practice with a YouTube interviewer</span>
          </span>
        </button>
      </div>

      {/* Metrics */}
      {metrics && (
        <>
          <div className="dash-section-title">Overview</div>
          <div className="dash-metrics-grid">
            <div className="dash-metric-card">
              <div className="dash-metric-value">{metrics.totalSessions}</div>
              <div className="dash-metric-label">Sessions</div>
            </div>
            <div className="dash-metric-card">
              <div className="dash-metric-value">{metrics.totalQAs}</div>
              <div className="dash-metric-label">Q&As Answered</div>
            </div>
            <div className="dash-metric-card">
              <div className="dash-metric-value">{metrics.avgDurationMins > 0 ? `${metrics.avgDurationMins}m` : '—'}</div>
              <div className="dash-metric-label">Avg Duration</div>
            </div>
            <div className="dash-metric-card">
              <div className="dash-metric-value dash-metric-company">{metrics.topCompany ?? '—'}</div>
              <div className="dash-metric-label">Top Company</div>
            </div>
          </div>

          {/* Recent sessions */}
          {metrics.recentSessions.length > 0 && (
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
        </>
      )}

      {/* My CVs section */}
      <div className="dash-cv-section">
        <div className="dash-cv-header">
          <span className="dash-section-title dash-cv-title">My CVs</span>
          <button
            type="button"
            className="dash-cv-add-btn"
            title="Upload a CV"
            onClick={() => cvFileInputRef.current?.click()}
            disabled={cvUploading}
          >
            {cvUploading ? '…' : '+'}
          </button>
          <input
            ref={cvFileInputRef}
            type="file"
            accept=".txt,.md,.pdf,.docx,.doc"
            title="Upload CV"
            aria-label="Upload CV file"
            className="dash-cv-file-input"
            onChange={handleCvUpload}
          />
        </div>
        {cvError && <div className="dash-cv-error">{cvError}</div>}
        {cvs.length === 0 ? (
          <div className="dash-cv-empty">No CVs saved yet. Upload one to reuse across sessions.</div>
        ) : (
          <div className="dash-cv-list">
            {cvs.map((cv) => (
              <div key={cv.id} className="dash-cv-item">
                <div className="dash-cv-name" title={cv.name}>{cv.name}</div>
                <div className="dash-cv-date">{formatDate(cv.created_at)}</div>
                <button
                  type="button"
                  className="dash-cv-delete"
                  title="Delete CV"
                  onClick={() => handleDeleteCv(cv.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dash-footer">
        <span className="dash-footer-text">RETIAS — Real Time Interview Assistant Software</span>
        <span className="dash-footer-version">v1.4.1</span>
      </div>
    </div>
  )
}
