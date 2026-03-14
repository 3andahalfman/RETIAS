import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

export default function PastSessions() {
  const [sessions, setSessions] = useState<PastSession[]>([])
  const [selected, setSelected] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'qa' | 'transcript'>('qa')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

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

  if (loading) {
    return <div className="past-sessions-placeholder">Loading sessions...</div>
  }

  if (sessions.length === 0) {
    return (
      <div className="past-sessions-placeholder">
        <div className="ps-empty-icon">🗂</div>
        <p className="ps-empty-title">No past sessions yet</p>
        <p className="ps-empty-sub">Sessions are saved automatically as you interview.</p>
      </div>
    )
  }

  return (
    <div className="ps-root">
      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="validation-overlay">
          <div className="validation-modal">
            <p>Delete this session? This cannot be undone.</p>
            <div className="validation-modal-footer" style={{ gap: 8, display: 'flex' }}>
              <button type="button" className="validation-ok-btn" style={{ background: '#3f3f46', color: '#f4f4f5' }} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button type="button" className="validation-ok-btn" style={{ background: '#ef4444' }} onClick={() => handleDelete(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Left: session list */}
      <div className="ps-list">
        {sessions.map((s) => (
          <div
            key={s.session_id}
            className={`ps-item ${selected?.session_id === s.session_id ? 'active' : ''}`}
            onClick={() => openSession(s.session_id)}
          >
            <div className="ps-item-header">
              <span className="ps-company">{s.company || 'Unknown Company'}</span>
              <button
                type="button"
                className="ps-delete-btn"
                title="Delete session"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(s.session_id) }}
              >
                ✕
              </button>
            </div>
            <div className="ps-role">{s.target_role || 'Interview Session'}</div>
            <div className="ps-meta">
              <span>{formatDate(s.started_at)}</span>
              <span className="ps-dot">·</span>
              <span>{formatDuration(s.started_at, s.ended_at)}</span>
              <span className="ps-dot">·</span>
              <span>{s.qa_count} Q&amp;As</span>
            </div>
          </div>
        ))}
      </div>

      {/* Right: session detail */}
      <div className="ps-detail">
        {detailLoading && <div className="past-sessions-placeholder">Loading...</div>}

        {!detailLoading && !selected && (
          <div className="past-sessions-placeholder">
            <p>Select a session to view details</p>
          </div>
        )}

        {!detailLoading && selected && (
          <>
            <div className="ps-detail-header">
              <div>
                <div className="ps-detail-company">{selected.company || 'Unknown Company'}</div>
                <div className="ps-detail-role">{selected.target_role || 'Interview Session'}</div>
                <div className="ps-detail-meta">
                  {formatDate(selected.started_at)} · {formatTime(selected.started_at)} · {formatDuration(selected.started_at, selected.ended_at)}
                </div>
              </div>
            </div>

            <div className="ps-detail-tabs">
              <button type="button" className={`ps-tab ${activeTab === 'qa' ? 'active' : ''}`} onClick={() => setActiveTab('qa')}>
                Q&amp;A ({selected.qa.length})
              </button>
              <button type="button" className={`ps-tab ${activeTab === 'transcript' ? 'active' : ''}`} onClick={() => setActiveTab('transcript')}>
                Transcript ({selected.transcript.length})
              </button>
            </div>

            <div className="ps-detail-body">
              {activeTab === 'qa' && (
                <>
                  {selected.qa.length === 0 && (
                    <p className="ps-empty-sub" style={{ padding: '24px 0' }}>No Q&As recorded for this session.</p>
                  )}
                  {selected.qa.map((qa) => (
                    <div key={qa.id} className="ps-qa-card">
                      <div className="ps-qa-header">
                        <span className="ps-qa-badge" style={{ background: `${badgeColor(qa.question_type)}22`, color: badgeColor(qa.question_type), border: `1px solid ${badgeColor(qa.question_type)}44` }}>
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
                    <p className="ps-empty-sub" style={{ padding: '24px 0' }}>No transcript recorded for this session.</p>
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
    </div>
  )
}
