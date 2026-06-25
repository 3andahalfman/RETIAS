import { useEffect, useRef, useState } from 'react'
import WindowControls from './WindowControls'
import AdminSolvedManager from './AdminSolvedManager'
import { isAdminEmail } from '../lib/admin'

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

const SESSION_TYPES = [
  {
    id: 'real',
    title: 'Real Interview',
    desc: 'Live coaching for a real job application',
    color: '#4F80E2',
    bg: 'rgba(79,128,226,0.12)',
    border: 'rgba(79,128,226,0.22)',
    btnClass: 'dash-action-btn-blue',
    label: 'New Session',
    onClick: (p: Props) => p.onNewSession,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    id: 'mock',
    title: 'Mock Interview',
    desc: 'Practice with a YouTube mock interviewer',
    color: '#15CDCA',
    bg: 'rgba(21,205,202,0.12)',
    border: 'rgba(21,205,202,0.22)',
    btnClass: 'dash-action-btn-teal',
    label: 'Start Mock',
    onClick: (p: Props) => p.onMockInterview,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    id: 'test',
    title: 'Online Assessment',
    desc: 'Coding challenges with real-time AI help',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.22)',
    btnClass: 'dash-action-btn-amber',
    label: 'Start Test',
    premium: true,
    onClick: (p: Props) => p.onOnlineTest,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
] as const

export default function Dashboard({ onNewSession, onPastSessions, onMockInterview, onOnlineTest, onDock, user, onLogout, onCvsChange }: Props) {
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

  const firstName = user.display_name?.split(' ')[0] || user.email?.split('@')[0] || 'there'
  const hasRecent = metrics && metrics.recentSessions.length > 0
  const showAdminSolved = isAdminEmail(user.email)

  const stats = [
    { label: 'Total sessions', value: metrics?.totalSessions ?? 0, color: '#4F80E2' },
    { label: 'This week', value: metrics?.totalQAs ?? 0, color: '#15CDCA' },
    { label: 'Saved CVs', value: cvs.length, color: '#F59E0B' },
  ]

  const props = { onNewSession, onPastSessions, onMockInterview, onOnlineTest, onDock, user, onLogout, onCvsChange }

  return (
    <div className="dash-root" ref={rootRef}>
      <header className="dash-header">
        <div className="dash-header-text">
          <h1 className="dash-header-title">Welcome, {firstName}</h1>
          <p className="dash-header-sub">What would you like to work on today?</p>
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

        <section className="dash-actions-section" aria-label="Start a session">
          <div className="dash-actions-grid">
            {SESSION_TYPES.map((s) => {
              const locked = s.premium && !user.is_premium
              const handler = s.onClick(props)
              return (
                <div
                  key={s.id}
                  className={`dash-action-card${locked ? ' dash-action-locked' : ''}`}
                  style={{ '--action-accent': s.color, '--action-bg': s.bg, '--action-border': s.border } as React.CSSProperties}
                >
                  <div className="dash-action-top">
                    <span className="dash-action-icon" style={{ background: s.bg, borderColor: s.border, color: s.color }}>
                      {s.icon}
                    </span>
                    <div className="dash-action-copy">
                      <div className="dash-action-title">
                        {s.title}
                        {locked && <span className="dash-action-lock" aria-label="Premium feature">🔒</span>}
                      </div>
                      <p className="dash-action-desc">{s.desc}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`dash-action-btn ${s.btnClass}`}
                    onClick={locked ? undefined : handler}
                    disabled={locked}
                  >
                    {s.label}
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        {showAdminSolved && <AdminSolvedManager />}

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
