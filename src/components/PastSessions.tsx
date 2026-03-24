import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

interface Props {
  onNewSession?: () => void
  onDock?: () => void
}

export default function PastSessions({ onNewSession, onDock }: Props) {
  const [sessions, setSessions] = useState<PastSession[]>([])
  const [selected, setSelected] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'qa' | 'transcript'>('qa')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'interview' | 'mock' | 'online-test'>('all')

  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions() {
    setLoading(true)
    try {
      const data = await window.electronAPI?.getPastSessions()
      setSessions(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function openSession(sessionId: string) {
    setDetailLoading(true)
    setActiveTab('qa')
    try {
      const detail = await window.electronAPI?.getSessionDetail(sessionId)
      setSelected(detail ?? null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleDelete(sessionId: string) {
    await window.electronAPI?.deleteSession(sessionId)
    setConfirmDelete(null)
    if (selected?.session_id === sessionId) setSelected(null)
    await loadSessions()
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function formatDuration(started: number, ended: number | null) {
    if (!ended) return 'In progress'
    const mins = Math.round((ended - started) / 60000)
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  function getSessionType(s: PastSession): string {
    const company = (s.company || '').toLowerCase()
    const role = (s.target_role || '').toLowerCase()
    if (company.includes('mock') || role.includes('mock')) return 'Mock'
    if (company.includes('online') || role.includes('test') || role.includes('assessment')) return 'Online Test'
    return 'Interview'
  }

  function getStatusBadge(s: PastSession) {
    if (!s.ended_at) return { label: 'Only Started', cls: 'started' }
    const mins = Math.round((s.ended_at - s.started_at) / 60000)
    if (mins > 60) return { label: 'Long Running', cls: 'long' }
    return { label: 'Completed', cls: 'completed' }
  }

  function badgeColor(type: string) {
    const map: Record<string, string> = {
      behavioral: '#3b82f6',
      technical: '#8b5cf6',
      'system-design': '#f59e0b',
      coding: '#10b981',
      general: '#6b7280',
    }
    return map[type] ?? '#6b7280'
  }

  const filterTypeLabel = (s: PastSession) => {
    const t = getSessionType(s).toLowerCase()
    if (filterType === 'all') return true
    if (filterType === 'interview') return t === 'interview'
    if (filterType === 'mock') return t === 'mock'
    if (filterType === 'online-test') return t === 'online test'
    return true
  }

  const filteredSessions = sessions.filter((s) => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (s.company || '').toLowerCase().includes(q) ||
      (s.target_role || '').toLowerCase().includes(q)
    return matchSearch && filterTypeLabel(s)
  })

  if (loading) {
    return (
      <div className="ps-page-root">
        <div className="past-sessions-placeholder">Loading sessions...</div>
      </div>
    )
  }

  return (
    <>
      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="validation-overlay">
          <div className="validation-modal">
            <p>Delete this session? This cannot be undone.</p>
            <div className="validation-modal-footer ps-confirm-footer">
              <button
                type="button"
                className="validation-ok-btn ps-confirm-cancel"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="validation-ok-btn ps-confirm-delete"
                onClick={() => handleDelete(confirmDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="ps-page-root">
        {/* Window controls */}
        <div className="ps-win-controls">
          <button type="button" className="setup-window-btn" title="Minimise to dock" onClick={onDock}>↙</button>
          <button type="button" className="setup-window-btn close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>✕</button>
        </div>

        {/* Header */}
        <div className="ps-page-header">
          <div>
            <div className="ps-page-title">Past Sessions</div>
            <div className="ps-page-subtitle">Review and revisit your previous interview sessions.</div>
          </div>
          {onNewSession && (
            <button type="button" className="ps-new-session-btn" onClick={onNewSession}>
              + New Session
            </button>
          )}
        </div>

        {/* Search */}
        <input
          className="ps-search-bar"
          placeholder="Search sessions by company or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Filter tabs */}
        <div className="ps-filter-tabs">
          {(['all', 'interview', 'mock', 'online-test'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`ps-filter-tab${filterType === f ? ' active' : ''}`}
              onClick={() => setFilterType(f)}
            >
              {f === 'all' ? 'All' : f === 'online-test' ? 'Online Test' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Table or empty state */}
        {filteredSessions.length === 0 ? (
          <div className="past-sessions-placeholder ps-empty-flex">
            <div className="ps-empty-icon">🗂</div>
            <p className="ps-empty-title">
              {sessions.length === 0 ? 'No past sessions yet' : 'No sessions match your filter'}
            </p>
            <p className="ps-empty-sub">
              {sessions.length === 0
                ? 'Sessions are saved automatically as you interview.'
                : 'Try adjusting your search or filter.'}
            </p>
          </div>
        ) : (
          <div className="ps-table-wrapper">
            <table className="ps-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>SESSION</th>
                  <th>TYPE</th>
                  <th>DURATION</th>
                  <th>STATUS</th>
                  <th className="ps-table-col-actions">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((s) => {
                  const status = getStatusBadge(s)
                  const sType = getSessionType(s)
                  return (
                    <tr key={s.session_id}>
                      <td className="ps-table-col-date">{formatDate(s.started_at)}</td>
                      <td>
                        <div className="ps-table-session-title">{s.company || 'Unknown Company'}</div>
                        <div className="ps-table-session-sub">{s.target_role || 'Interview Session'}</div>
                      </td>
                      <td>
                        <span className="ps-type-badge">{sType}</span>
                      </td>
                      <td className="ps-table-col-duration">
                        {formatDuration(s.started_at, s.ended_at)}
                      </td>
                      <td>
                        <span className={`ps-status-badge ${status.cls}`}>{status.label}</span>
                      </td>
                      <td>
                        <div className="ps-table-actions">
                          <button
                            type="button"
                            className="ps-table-view-btn"
                            onClick={() => openSession(s.session_id)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="ps-table-del-btn"
                            title="Delete session"
                            onClick={() => setConfirmDelete(s.session_id)}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail side panel */}
      {(selected || detailLoading) && (
        <div className="ps-detail-panel">
          {detailLoading && <div className="past-sessions-placeholder">Loading...</div>}

          {!detailLoading && selected && (
            <>
              <div className="ps-detail-header">
                <div className="ps-detail-panel-header-row">
                  <div>
                    <div className="ps-detail-company">{selected.company || 'Unknown Company'}</div>
                    <div className="ps-detail-role">{selected.target_role || 'Interview Session'}</div>
                    <div className="ps-detail-meta">
                      {formatDate(selected.started_at)} · {formatTime(selected.started_at)} · {formatDuration(selected.started_at, selected.ended_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="setup-window-btn ps-detail-close-btn"
                    title="Close panel"
                    onClick={() => setSelected(null)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="ps-detail-tabs">
                <button
                  type="button"
                  className={`ps-tab ${activeTab === 'qa' ? 'active' : ''}`}
                  onClick={() => setActiveTab('qa')}
                >
                  Q&amp;A ({selected.qa.length})
                </button>
                <button
                  type="button"
                  className={`ps-tab ${activeTab === 'transcript' ? 'active' : ''}`}
                  onClick={() => setActiveTab('transcript')}
                >
                  Transcript ({selected.transcript.length})
                </button>
              </div>

              <div className="ps-detail-body">
                {activeTab === 'qa' && (
                  <>
                    {selected.qa.length === 0 && (
                      <p className="ps-empty-sub ps-empty-padding">No Q&As recorded for this session.</p>
                    )}
                    {selected.qa.map((qa) => (
                      <div key={qa.id} className="ps-qa-card">
                        <div className="ps-qa-header">
                          <span
                            className="ps-qa-badge"
                            style={{
                              background: `${badgeColor(qa.question_type)}22`,
                              color: badgeColor(qa.question_type),
                              border: `1px solid ${badgeColor(qa.question_type)}44`,
                            }}
                          >
                            {qa.question_type}
                          </span>
                          <span className="ps-qa-time">{formatTime(qa.timestamp)}</span>
                        </div>
                        <div className="ps-qa-question">❓ {qa.question}</div>
                        <div className="ps-qa-answer"><ReactMarkdown>{qa.answer}</ReactMarkdown></div>
                      </div>
                    ))}
                  </>
                )}

                {activeTab === 'transcript' && (
                  <>
                    {selected.transcript.length === 0 && (
                      <p className="ps-empty-sub ps-empty-padding">No transcript recorded for this session.</p>
                    )}
                    {selected.transcript.map((line) => (
                      <div key={line.id} className={`ps-tx-line ${line.role}`}>
                        <span className="ps-tx-role">{line.role === 'interviewer' ? '🎤 Interviewer' : '👤 Candidate'}</span>
                        <span className="ps-tx-time">{formatTime(line.timestamp)}</span>
                        <div className="ps-tx-text">{line.text}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
