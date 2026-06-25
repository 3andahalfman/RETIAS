import { useEffect, useRef, useState } from 'react'
import WindowControls from './WindowControls'

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
  onPastSessions: () => void
  onDock: () => void
  user: User
  onLogout: () => void
  onCvsChange?: () => void
}

export default function Dashboard({ onPastSessions, onDock, user, onLogout, onCvsChange }: Props) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
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
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
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
    if (c.includes('online') || r.includes('test') || r.includes('assessment')) return 'Online Assessment'
    return 'Real Interview'
  }

  function getTypeColor(type: string) {
    if (type === 'Mock') return '#15CDCA'
    if (type === 'Online Assessment') return '#F59E0B'
    return '#4F80E2'
  }

  const greetingName =
    user.display_name?.trim() ||
    user.email?.split('@')[0]?.trim() ||
    'there'
  const firstName = greetingName.split(/\s+/)[0]
  const hasRecent = metrics && metrics.recentSessions.length > 0

  const stats = [
    { label: 'Total sessions', value: metrics?.totalSessions ?? 0, color: '#4F80E2' },
    { label: 'This week', value: metrics?.totalQAs ?? 0, color: '#15CDCA' },
    { label: 'Saved CVs', value: cvs.length, color: '#F59E0B' },
  ]

  return (
    <div className="dash-root" ref={rootRef}>
      <header className="dash-header">
        <div className="dash-header-text">
          <h1 className="dash-header-title">Welcome, {firstName}</h1>
          <p className="dash-header-sub">Your overview and recent activity.</p>
        </div>
        <WindowControls onDock={onDock} />
      </header>

      <main className="dash-main">
        <section className="dash-stats-section" aria-label="Overview">
          <span className="dash-section-label">Overview</span>
          <div className="dash-stats-grid">
            {stats.map((stat) => (
              <div key={stat.label} className="dash-stat-card">
                <span className="dash-stat-dot" style={{ background: stat.color }} />
                <div className="dash-stat-copy">
                  <span className="dash-stat-value">{stat.value}</span>
                  <span className="dash-stat-label">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {hasRecent && (
          <section className="dash-recent-section" aria-label="Recent sessions">
            <div className="dash-recent-head">
              <span className="dash-section-label">Recent sessions</span>
              <button type="button" className="dash-view-all" onClick={onPastSessions}>
                View all
              </button>
            </div>
            <ul className="dash-recent-list">
              {metrics!.recentSessions.map((s) => {
                const type = getSessionType(s.company, s.target_role)
                const accent = getTypeColor(type)
                const role = s.target_role
                  ? (s.target_role.length > 48 ? s.target_role.slice(0, 48) + '…' : s.target_role)
                  : 'Interview'
                return (
                  <li key={s.session_id} className="dash-recent-row">
                    <span className="dash-recent-accent" style={{ background: accent }} />
                    <div className="dash-recent-info">
                      <div className="dash-recent-title">{s.company || 'Unknown'} — {role}</div>
                      <div className="dash-recent-sub">
                        {type} · {formatDuration(s.started_at, s.ended_at)} · {formatDate(s.started_at)}
                      </div>
                    </div>
                    <span className={`dash-recent-badge ${s.ended_at ? 'completed' : 'in-progress'}`}>
                      {s.ended_at ? 'Done' : 'Active'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>

      <input ref={cvFileInputRef} type="file" accept=".txt,.md,.pdf,.docx,.doc"
        title="Upload CV" aria-label="Upload CV file"
        className="dash-cv-file-input" onChange={handleCvUpload} />

      <footer className="dash-footer">
        <span className="dash-footer-text">RETIAS</span>
        <span className="dash-footer-version">v{__APP_VERSION__}</span>
      </footer>
    </div>
  )
}
