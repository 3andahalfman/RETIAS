import { useCallback, useEffect, useMemo, useState } from 'react'

interface SolvedRow {
  id: string
  platform: string
  assessment_type: string
  question: string
  answer: string
  created_at: string
}

function preview(text: string, max = 90): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return t.slice(0, max) + '…'
}

export default function AdminSolvedManager() {
  const [rows, setRows] = useState<SolvedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await window.electronAPI?.listSolvedQuestions?.()
      setRows((data ?? []) as SolvedRow[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load solved questions')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      r.platform.toLowerCase().includes(q) ||
      r.assessment_type.toLowerCase().includes(q) ||
      r.question.toLowerCase().includes(q) ||
      r.answer.toLowerCase().includes(q),
    )
  }, [rows, search])

  const groups = useMemo(() => {
    const map = new Map<string, SolvedRow[]>()
    for (const row of filtered) {
      const key = `${row.platform}\0${row.assessment_type}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return Array.from(map.entries())
      .map(([key, items]) => {
        const [platform, assessment_type] = key.split('\0')
        return { platform, assessment_type, items }
      })
      .sort((a, b) => a.platform.localeCompare(b.platform) || a.assessment_type.localeCompare(b.assessment_type))
  }, [filtered])

  const handleDeleteQuestion = async (row: SolvedRow) => {
    if (!confirm(`Delete this question from ${row.platform} · ${row.assessment_type}?\n\n"${preview(row.question, 120)}"\n\nThis cannot be undone.`)) {
      return
    }
    setDeletingId(row.id)
    setError(null)
    try {
      await window.electronAPI?.deleteSolvedQuestions?.([row.id])
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteAssessment = async (platform: string, assessment_type: string, count: number) => {
    if (!confirm(`Delete all ${count} question${count !== 1 ? 's' : ''} in "${platform} · ${assessment_type}"?\n\nThis cannot be undone.`)) {
      return
    }
    const groupKey = `${platform}\0${assessment_type}`
    setDeletingGroup(groupKey)
    setError(null)
    try {
      await window.electronAPI?.deleteSolvedAssessment?.({ platform, assessment_type })
      setRows((prev) => prev.filter((r) => !(r.platform === platform && r.assessment_type === assessment_type)))
      if (expanded === groupKey) setExpanded(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingGroup(null)
    }
  }

  const totalCount = rows.length

  return (
    <section className="dash-admin-solved" aria-label="Manage Solved Assessment">
      <div className="dash-admin-solved-head">
        <div>
          <span className="dash-section-label">Admin · Solved Assessment</span>
          <p className="dash-admin-solved-sub">
            {loading ? 'Loading…' : `${totalCount} question${totalCount !== 1 ? 's' : ''} in the bank`}
          </p>
        </div>
        <button type="button" className="dash-admin-solved-refresh" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      <input
        type="search"
        className="dash-admin-solved-search"
        placeholder="Search platform, assessment, or question…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="dash-admin-solved-error">{error}</p>}

      {!loading && groups.length === 0 && (
        <p className="dash-admin-solved-empty">
          {search.trim() ? 'No matches.' : 'No solved questions yet. Send captures from the Screenshot Library.'}
        </p>
      )}

      <div className="dash-admin-solved-groups">
        {groups.map(({ platform, assessment_type, items }) => {
          const groupKey = `${platform}\0${assessment_type}`
          const isOpen = expanded === groupKey
          const busy = deletingGroup === groupKey
          return (
            <div key={groupKey} className="dash-admin-solved-group">
              <div className="dash-admin-solved-group-head">
                <button
                  type="button"
                  className="dash-admin-solved-group-toggle"
                  onClick={() => setExpanded(isOpen ? null : groupKey)}
                  aria-expanded={isOpen}
                >
                  <span className={`dash-admin-solved-chevron${isOpen ? ' open' : ''}`}>▾</span>
                  <span className="dash-admin-solved-group-title">{platform}</span>
                  <span className="dash-admin-solved-group-sep">·</span>
                  <span className="dash-admin-solved-group-type">{assessment_type}</span>
                  <span className="dash-admin-solved-group-count">{items.length}</span>
                </button>
                <button
                  type="button"
                  className="dash-admin-solved-delete-group"
                  disabled={busy || !!deletingId}
                  onClick={() => handleDeleteAssessment(platform, assessment_type, items.length)}
                  title={`Delete all ${items.length} in this assessment`}
                >
                  {busy ? 'Deleting…' : 'Delete all'}
                </button>
              </div>

              {isOpen && (
                <ul className="dash-admin-solved-list">
                  {items.map((row) => (
                    <li key={row.id} className="dash-admin-solved-row">
                      <div className="dash-admin-solved-row-body">
                        <p className="dash-admin-solved-q">{preview(row.question, 140)}</p>
                        <p className="dash-admin-solved-a">{preview(row.answer, 100)}</p>
                      </div>
                      <button
                        type="button"
                        className="dash-admin-solved-delete-one"
                        disabled={deletingId === row.id || busy}
                        onClick={() => handleDeleteQuestion(row)}
                        title="Delete this question"
                      >
                        {deletingId === row.id ? '…' : '🗑'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
