import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, syncSupabaseSession } from '../lib/supabase'
import DockIcon from './DockIcon'
import {
  IconScore,
  IconScreenshot,
  IconUsers,
  ONLINE_TEST_ACCENTS,
  OnlineTestIconBadge,
  OnlineTestPageHeader,
} from './OnlineTestIcons'

interface OnlineTestCapture {
  id: string
  user_id: string
  user_email: string
  session_id: string | null
  test_type: string
  screenshot_paths: string[]
  screenshot_count: number
  ai_answer: string
  score_accuracy: number | null
  score_completeness: number | null
  score_overall: number | null
  score_notes: string | null
  extracted_questions: string | null
  detected_test_type: string | null
  detected_platform: string | null
  source_url: string | null
  created_at: string
}

interface CaptureUserSummary {
  email: string
  userId: string
  captureCount: number
  avgOverallScore: number | null
  lastActiveAt: string
}

type UserSort =
  | 'recent-desc'
  | 'recent-asc'
  | 'email-asc'
  | 'email-desc'
  | 'captures-desc'
  | 'captures-asc'
  | 'score-desc'
  | 'score-asc'

function aggregateUsersFromRows(
  rows: Array<{ user_email: string; user_id: string; score_overall: number | null; created_at: string }>,
): CaptureUserSummary[] {
  const byUser = new Map<string, { email: string; userId: string; rows: typeof rows }>()
  for (const row of rows) {
    const key = row.user_email.trim().toLowerCase()
    const existing = byUser.get(key)
    if (!existing) byUser.set(key, { email: row.user_email, userId: row.user_id, rows: [row] })
    else existing.rows.push(row)
  }
  return Array.from(byUser.values()).map(({ email, userId, rows: caps }) => {
    const scored = caps.filter((c) => c.score_overall != null)
    const avg = scored.length
      ? Math.round((scored.reduce((s, c) => s + Number(c.score_overall), 0) / scored.length) * 10) / 10
      : null
    const lastActiveAt = caps.reduce(
      (max, c) => (c.created_at > max ? c.created_at : max),
      caps[0].created_at,
    )
    return { email, userId, captureCount: caps.length, avgOverallScore: avg, lastActiveAt }
  })
}

function sortCaptureUsers(users: CaptureUserSummary[], sort: UserSort): CaptureUserSummary[] {
  const copy = [...users]
  const compareScore = (a: number | null, b: number | null, desc: boolean) => {
    if (a == null && b == null) return 0
    if (a == null) return 1
    if (b == null) return -1
    return desc ? b - a : a - b
  }
  copy.sort((a, b) => {
    switch (sort) {
      case 'recent-desc': return b.lastActiveAt.localeCompare(a.lastActiveAt)
      case 'recent-asc': return a.lastActiveAt.localeCompare(b.lastActiveAt)
      case 'email-asc': return a.email.localeCompare(b.email)
      case 'email-desc': return b.email.localeCompare(a.email)
      case 'captures-desc': return b.captureCount - a.captureCount
      case 'captures-asc': return a.captureCount - b.captureCount
      case 'score-desc': return compareScore(a.avgOverallScore, b.avgOverallScore, true)
      case 'score-asc': return compareScore(a.avgOverallScore, b.avgOverallScore, false)
      default: return 0
    }
  })
  return copy
}

async function fetchLibraryOverview(): Promise<{ stats: CaptureStats; users: CaptureUserSummary[] }> {
  if (isElectron && window.electronAPI?.adminScreenshotLibraryOverview) {
    return window.electronAPI.adminScreenshotLibraryOverview()
  }

  await syncSupabaseSession()
  const { data: rows, error } = await supabase
    .from('online_test_captures')
    .select('user_email, user_id, score_overall, created_at')

  if (error) throw new Error(error.message)

  const allRows = rows ?? []
  const scored = allRows.filter((r) => r.score_overall != null)
  const avg = scored.length
    ? scored.reduce((sum, r) => sum + Number(r.score_overall), 0) / scored.length
    : null

  return {
    stats: {
      totalCaptures: allRows.length,
      avgOverallScore: avg != null ? Math.round(avg * 10) / 10 : null,
      uniqueUsers: new Set(allRows.map((r) => r.user_id)).size,
    },
    users: aggregateUsersFromRows(allRows),
  }
}

async function fetchCapturesForUser(email: string): Promise<OnlineTestCapture[]> {
  if (isElectron && window.electronAPI?.adminListCapturesForUser) {
    return window.electronAPI.adminListCapturesForUser(email)
  }

  await syncSupabaseSession()
  const normalized = email.trim().toLowerCase()
  const { data, error } = await supabase
    .from('online_test_captures')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(error.message)
  return ((data ?? []) as OnlineTestCapture[]).filter(
    (row) => row.user_email.trim().toLowerCase() === normalized,
  )
}

async function fetchRecentCaptures(limit = 50): Promise<OnlineTestCapture[]> {
  if (isElectron && window.electronAPI?.adminListScreenshots) {
    const result = await window.electronAPI.adminListScreenshots(0, limit)
    return result?.captures ?? []
  }

  await syncSupabaseSession()
  const { data, error } = await supabase
    .from('online_test_captures')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as OnlineTestCapture[]
}

interface CaptureStats {
  totalCaptures: number
  avgOverallScore: number | null
  uniqueUsers: number
}

interface Props {
  onDock?: () => void
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

function formatTestType(type: string) {
  if (type.startsWith('role:')) return type.slice(5)
  return type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function scoreColor(score: number | null) {
  if (score == null) return 'rgba(255,255,255,0.35)'
  if (score >= 80) return '#15CDCA'
  if (score >= 60) return '#F59E0B'
  return '#f87171'
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Data layer: prefer Electron IPC, fall back to direct Supabase ─────────

const STORAGE_BUCKET = 'online-test-screenshots'
const SCREENSHOT_PATH_REGEX = /^[\w-]+\/[\w-]+\/\d+\.png$/

async function fetchScreenshotUrl(path: string): Promise<string | null> {
  if (!SCREENSHOT_PATH_REGEX.test(path)) return null

  if (isElectron && window.electronAPI?.adminGetScreenshotUrl) {
    const ipcUrl = await window.electronAPI.adminGetScreenshotUrl(path).catch(() => null)
    if (ipcUrl) return ipcUrl
  }

  await syncSupabaseSession(true)
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

async function deleteCaptures(ids: string[], paths: string[]): Promise<void> {
  await syncSupabaseSession()
  // Best-effort storage cleanup first, then DB row(s). Storage failures are
  // logged but don't block the DB delete so orphan rows aren't created.
  if (paths.length) {
    const { error: storageErr } = await supabase.storage.from(STORAGE_BUCKET).remove(paths)
    if (storageErr) console.warn('[ScreenshotLibrary] storage delete error:', storageErr.message)
  }
  const { error } = await supabase.from('online_test_captures').delete().in('id', ids)
  if (error) throw new Error(error.message)
}

export default function AdminScreenshotDashboard({ onDock }: Props) {
  const [captures, setCaptures] = useState<OnlineTestCapture[]>([])
  const [recentCaptures, setRecentCaptures] = useState<OnlineTestCapture[]>([])
  const [users, setUsers] = useState<CaptureUserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingUserCaptures, setLoadingUserCaptures] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [detailUrls, setDetailUrls] = useState<string[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [userSort, setUserSort] = useState<UserSort>('recent-desc')
  const [minCaptures, setMinCaptures] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showSnapGrid, setShowSnapGrid] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [level, setLevel] = useState<'users' | 'assessments' | 'detail'>('users')
  const [activeUserEmail, setActiveUserEmail] = useState<string | null>(null)
  const [sendModalCap, setSendModalCap] = useState<OnlineTestCapture | null>(null)
  const [sendPlatform, setSendPlatform] = useState('')
  const [sendAssessment, setSendAssessment] = useState('')
  const [sendQuestionsText, setSendQuestionsText] = useState('')
  const [sendAnswerText, setSendAnswerText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSentSummary, setSendSentSummary] = useState<string | null>(null)
  const [sendParaphraseEnabled, setSendParaphraseEnabled] = useState(false)
  const [sendSent, setSendSent] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [result, recent] = await Promise.all([
        fetchLibraryOverview(),
        fetchRecentCaptures(50),
      ])
      setUsers(result.users)
      setRecentCaptures(recent)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assessment archive')
    } finally {
      setLoading(false)
    }
  }, [])

  const openUser = useCallback(async (email: string) => {
    setActiveUserEmail(email)
    setLevel('assessments')
    setSelectedId(null)
    setLoadingUserCaptures(true)
    setError(null)
    try {
      const rows = await fetchCapturesForUser(email)
      setCaptures(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load captures for this user')
      setCaptures([])
    } finally {
      setLoadingUserCaptures(false)
    }
  }, [])

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    let list = users
    if (q) list = list.filter((u) => u.email.toLowerCase().includes(q))
    if (minCaptures > 0) list = list.filter((u) => u.captureCount >= minCaptures)
    return sortCaptureUsers(list, userSort)
  }, [users, userSearch, userSort, minCaptures])

  useEffect(() => { loadData() }, [loadData])

  const visibleCaptures = level === 'users' ? recentCaptures : captures

  useEffect(() => {
    if (!visibleCaptures.length) {
      setThumbUrls({})
      return
    }
    let cancelled = false

    async function loadThumbs() {
      const urls: Record<string, string> = {}
      await Promise.all(
        visibleCaptures.slice(0, 50).map(async (cap) => {
          const path = cap.screenshot_paths[0]
          if (!path) return
          const url = await fetchScreenshotUrl(path).catch(() => null)
          if (url && !cancelled) urls[cap.id] = url
        }),
      )
      if (!cancelled) setThumbUrls(urls)
    }

    loadThumbs()
    return () => { cancelled = true }
  }, [visibleCaptures])

  const handleDeleteCapture = useCallback(async (cap: OnlineTestCapture) => {
    if (!confirm(`Delete this capture from ${cap.user_email}? This removes the screenshots and AI answer permanently.`)) return
    setDeletingIds(prev => new Set(prev).add(cap.id))
    try {
      await deleteCaptures([cap.id], cap.screenshot_paths)
      setCaptures((prev) => prev.filter((c) => c.id !== cap.id))
      setRecentCaptures((prev) => prev.filter((c) => c.id !== cap.id))
      if (selectedId === cap.id) setSelectedId(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete capture')
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev)
        next.delete(cap.id)
        return next
      })
    }
  }, [selectedId, loadData])

  const handleDeleteSession = useCallback(async (caps: OnlineTestCapture[]) => {
    const sessionLabel = caps[0].session_id ? `session ${caps[0].session_id.slice(0, 8)}` : 'this group'
    if (!confirm(`Delete all ${caps.length} captures in ${sessionLabel}? This cannot be undone.`)) return
    const ids = caps.map(c => c.id)
    setDeletingIds(prev => { const n = new Set(prev); ids.forEach(i => n.add(i)); return n })
    try {
      const paths = caps.flatMap(c => c.screenshot_paths)
      await deleteCaptures(ids, paths)
      setCaptures((prev) => prev.filter((c) => !ids.includes(c.id)))
      setRecentCaptures((prev) => prev.filter((c) => !ids.includes(c.id)))
      if (selectedId && ids.includes(selectedId)) setSelectedId(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session')
    } finally {
      setDeletingIds(prev => { const n = new Set(prev); ids.forEach(i => n.delete(i)); return n })
    }
  }, [selectedId, loadData])

  const openCaptureDetail = useCallback((cap: OnlineTestCapture) => {
    if (level === 'users') {
      void openUser(cap.user_email).then(() => {
        setSelectedId(cap.id)
        setLevel('detail')
      })
      return
    }
    setSelectedId(cap.id)
    setLevel('detail')
  }, [level, openUser])

  const openSendModal = useCallback((cap: OnlineTestCapture) => {
    setSendModalCap(cap)
    setSendPlatform(cap.detected_platform ?? '')
    setSendAssessment(cap.detected_test_type ?? '')
    setSendQuestionsText(cap.extracted_questions ?? '')
    setSendAnswerText(cap.ai_answer ?? '')
    setSendParaphraseEnabled(false)
    setSendError(null)
    setSendSent(false)
    setSendSentSummary(null)
  }, [])

  const closeSendModal = useCallback(() => {
    setSendModalCap(null)
    setSending(false)
    setSendError(null)
    setSendSent(false)
    setSendSentSummary(null)
  }, [])

  const handleSendToSolved = useCallback(async () => {
    if (!sendModalCap) return
    setSending(true)
    setSendError(null)
    setSendSent(false)
    setSendSentSummary(null)
    try {
      const platform = sendPlatform.trim()
      const assessment = sendAssessment.trim()
      const answer = sendAnswerText.trim()
      if (!platform || !assessment) throw new Error('Platform and assessment type are required.')
      if (!answer) throw new Error('Answer cannot be empty.')

      const questions = sendQuestionsText
        .split(/\n\s*\n+/)
        .map((q) => q.trim())
        .filter(Boolean)
      if (!questions.length) throw new Error('No questions to send. Add at least one question (separate multiple with a blank line).')

      const rows = questions.map((q) => ({
        platform,
        assessment_type: assessment,
        question: q,
        answer,
        answer_variants: [] as string[],
        paraphrase_enabled: sendParaphraseEnabled,
        source_capture_id: sendModalCap.id,
        source_url: sendModalCap.source_url,
      }))

      let summary: string
      if (isElectron && window.electronAPI?.adminUpsertSolvedQuestions) {
        const result = await window.electronAPI.adminUpsertSolvedQuestions(rows)
        summary = result.updated > 0
          ? `Sent — ${result.inserted} new, ${result.updated} updated`
          : `Sent — ${result.total} question${result.total === 1 ? '' : 's'} added`
      } else {
        await syncSupabaseSession(true)
        const { error } = await supabase.from('solved_questions').upsert(rows, {
          onConflict: 'platform,assessment_type,question',
        })
        if (error) throw new Error(error.message)
        summary = `Sent — ${rows.length} question${rows.length === 1 ? '' : 's'} saved`
      }

      setSendSentSummary(summary)
      setSendSent(true)
      window.setTimeout(() => closeSendModal(), 1400)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send to Solved Assessment bank.')
    } finally {
      setSending(false)
    }
  }, [sendModalCap, sendPlatform, sendAssessment, sendQuestionsText, sendAnswerText, sendParaphraseEnabled, closeSendModal])

  const selected = captures.find((c) => c.id === selectedId)
    ?? recentCaptures.find((c) => c.id === selectedId)
    ?? null

  useEffect(() => {
    if (!selected) {
      setDetailUrls([])
      return
    }
    let cancelled = false

    async function loadDetail() {
      const urls: string[] = []
      for (const path of selected!.screenshot_paths) {
        const url = await fetchScreenshotUrl(path).catch(() => null)
        if (url) urls.push(url)
      }
      if (!cancelled) setDetailUrls(urls)
    }

    loadDetail()
    return () => { cancelled = true }
  }, [selected])

  const activeUser = useMemo(() => {
    if (!activeUserEmail) return null
    const key = activeUserEmail.trim().toLowerCase()
    return users.find((u) => u.email.trim().toLowerCase() === key) ?? null
  }, [users, activeUserEmail])

  const userStatCards = useMemo(() => {
    if (!activeUserEmail) return []
    const captureCount = activeUser?.captureCount ?? captures.length
    const scored = captures.filter((c) => c.score_overall != null)
    const avgOverallScore = activeUser?.avgOverallScore ?? (
      scored.length
        ? Math.round((scored.reduce((s, c) => s + Number(c.score_overall), 0) / scored.length) * 10) / 10
        : null
    )
    const lastActiveAt = activeUser?.lastActiveAt
      ?? captures.reduce((max, c) => (c.created_at > max ? c.created_at : max), captures[0]?.created_at ?? '')

    return [
      {
        label: 'Total captures',
        value: captureCount || '—',
        hint: 'Stored screenshots',
        accent: ONLINE_TEST_ACCENTS.amber,
        Icon: IconScreenshot,
      },
      {
        label: 'Avg score',
        value: avgOverallScore ?? '—',
        hint: 'Overall quality (0–100)',
        accent: ONLINE_TEST_ACCENTS.teal,
        Icon: IconScore,
      },
      {
        label: 'Last active',
        value: lastActiveAt ? formatDate(lastActiveAt) : '—',
        hint: 'Most recent capture',
        accent: ONLINE_TEST_ACCENTS.blue,
        Icon: IconUsers,
      },
    ]
  }, [activeUser, activeUserEmail, captures])

  return (
    <div className="admin-screens-root">
      {isElectron && (
        <div className="dash-win-controls">
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
          {onDock && (
            <button type="button" className="dash-wc-btn dash-wc-dock" title="Dock" onClick={onDock}>
              <DockIcon />
            </button>
          )}
          <button type="button" className="dash-wc-btn dash-wc-close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      <OnlineTestPageHeader
        title="Assessment Archive"
        subtitle="Browse scored online test captures from all users — admin only."
        accent={ONLINE_TEST_ACCENTS.amber}
        icon={IconScreenshot}
      />

      {level === 'assessments' && activeUserEmail && (
        <div className="admin-screens-stats">
          {userStatCards.map((stat) => (
            <div key={stat.label} className="admin-screens-stat">
              <OnlineTestIconBadge accent={stat.accent}>
                <stat.Icon size={18} />
              </OnlineTestIconBadge>
              <div className="admin-screens-stat-copy">
                <span className="admin-screens-stat-value">{stat.value}</span>
                <span className="admin-screens-stat-label">{stat.label}</span>
                <span className="admin-screens-stat-hint">{stat.hint}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="admin-screens-body">
      <div className="admin-screens-toolbar">
        {level === 'users' && (
          <button type="button" className="setup-btn secondary" onClick={loadData} disabled={loading}>
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        )}
        {level === 'assessments' && (
          <button type="button" className="setup-btn secondary" onClick={() => { setLevel('users'); setActiveUserEmail(null); setCaptures([]); setSelectedId(null) }}>
            ← Back to users
          </button>
        )}
        {level === 'detail' && (
          <button type="button" className="setup-btn secondary" onClick={() => { setLevel('assessments'); setSelectedId(null) }}>
            ← Back to {activeUserEmail}
          </button>
        )}
      </div>

      {error && <div className="admin-screens-error">{error}</div>}

      {/* Level 1 — Users list */}
      {level === 'users' && (
        <>
          <div className="admin-screens-users-toolbar">
            <input
              type="search"
              className="admin-screens-search"
              placeholder="Search by email…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              aria-label="Search users by email"
            />
            <select
              className="admin-screens-sort"
              value={userSort}
              onChange={(e) => setUserSort(e.target.value as UserSort)}
              aria-label="Sort users"
            >
              <option value="recent-desc">Recently active</option>
              <option value="recent-asc">Oldest active</option>
              <option value="email-asc">Email A–Z</option>
              <option value="email-desc">Email Z–A</option>
              <option value="captures-desc">Most captures</option>
              <option value="captures-asc">Fewest captures</option>
              <option value="score-desc">Highest avg score</option>
              <option value="score-asc">Lowest avg score</option>
            </select>
            <select
              className="admin-screens-sort"
              value={minCaptures}
              onChange={(e) => setMinCaptures(Number(e.target.value))}
              aria-label="Minimum captures"
            >
              <option value={0}>All users</option>
              <option value={1}>1+ captures</option>
              <option value={5}>5+ captures</option>
              <option value={10}>10+ captures</option>
            </select>
            <span className="admin-screens-users-count">
              {filteredUsers.length} of {users.length} user{users.length === 1 ? '' : 's'}
            </span>
          </div>

          {loading && (
            <div className="admin-screens-empty">Loading users…</div>
          )}

          {!loading && users.length === 0 && (
            <div className="admin-screens-empty">No captures yet. They appear when users run Online Assessment and click Analyse All.</div>
          )}

          {!loading && users.length > 0 && filteredUsers.length === 0 && (
            <div className="admin-screens-empty">No users match your search or filters.</div>
          )}

          {!loading && filteredUsers.length > 0 && (
            <div className="admin-screens-user-table-wrap">
              <div className="admin-screens-user-table-head" aria-hidden="true">
                <span>User</span>
                <span>Captures</span>
                <span>Avg score</span>
                <span>Last active</span>
              </div>
              <div className="admin-screens-user-table">
                {filteredUsers.map((user) => {
                  const initials = user.email.slice(0, 2).toUpperCase()
                  return (
                    <button
                      key={user.email}
                      type="button"
                      className="admin-screens-user-row"
                      onClick={() => openUser(user.email)}
                    >
                      <span className="admin-screens-user-row-main">
                        <span className="admin-screens-user-avatar admin-screens-user-avatar--sm">{initials}</span>
                        <span className="admin-screens-user-email">{user.email}</span>
                      </span>
                      <span className="admin-screens-user-row-stat">{user.captureCount}</span>
                      <span className="admin-screens-user-row-stat" style={{ color: scoreColor(user.avgOverallScore) }}>
                        {user.avgOverallScore ?? '—'}
                      </span>
                      <span className="admin-screens-user-row-date">{formatDate(user.lastActiveAt)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!loading && recentCaptures.length > 0 && (
            <div className="admin-screens-recent">
              <div className="admin-screens-user-detail-title">Recent captures</div>
              <div className="admin-screens-list">
                {recentCaptures.map((cap) => (
                  <button
                    key={cap.id}
                    type="button"
                    className="admin-screens-row"
                    onClick={() => openCaptureDetail(cap)}
                  >
                    <div className="admin-screens-thumb">
                      {thumbUrls[cap.id] ? (
                        <img src={thumbUrls[cap.id]} alt="" />
                      ) : (
                        <span>📸</span>
                      )}
                    </div>
                    <div className="admin-screens-row-info">
                      <div className="admin-screens-row-title">
                        {formatTestType(cap.detected_test_type || cap.test_type)}
                        {cap.detected_platform && (
                          <span className="admin-screens-platform-badge"> · {cap.detected_platform}</span>
                        )}
                      </div>
                      <div className="admin-screens-row-sub">
                        {cap.user_email} · {formatDate(cap.created_at)} · {cap.screenshot_count} img
                      </div>
                    </div>
                    <div className="admin-screens-score" style={{ color: scoreColor(cap.score_overall) }}>
                      {cap.score_overall != null ? Math.round(cap.score_overall) : '—'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Level 2 — Assessment preview rows for selected user */}
      {level === 'assessments' && activeUserEmail && (
        <div className="admin-screens-user-detail">
          <div className="admin-screens-user-detail-title">{activeUserEmail}</div>
          {loadingUserCaptures && (
            <div className="admin-screens-empty">Loading captures…</div>
          )}
          {!loadingUserCaptures && captures.length === 0 && (
            <div className="admin-screens-empty">No captures for this user.</div>
          )}
          <div className="admin-screens-list">
            {!loadingUserCaptures && captures.map((cap) => (
              <button
                key={cap.id}
                type="button"
                className="admin-screens-row"
                onClick={() => openCaptureDetail(cap)}
              >
                <div className="admin-screens-thumb">
                  {thumbUrls[cap.id] ? (
                    <img src={thumbUrls[cap.id]} alt="" />
                  ) : (
                    <span>📸</span>
                  )}
                </div>
                <div className="admin-screens-row-info">
                  <div className="admin-screens-row-title">
                    {formatTestType(cap.detected_test_type || cap.test_type)}
                    {cap.detected_platform && (
                      <span className="admin-screens-platform-badge"> · {cap.detected_platform}</span>
                    )}
                  </div>
                  <div className="admin-screens-row-sub">
                    {formatDate(cap.created_at)} · {cap.screenshot_count} img
                    {cap.source_url && <> · {cap.source_url}</>}
                  </div>
                </div>
                <div className="admin-screens-score" style={{ color: scoreColor(cap.score_overall) }}>
                  {cap.score_overall != null ? Math.round(cap.score_overall) : '—'}
                </div>
                <span
                  role="button"
                  className="admin-screens-send-row"
                  onClick={(e) => { e.stopPropagation(); openSendModal(cap) }}
                  title="Send to Solved Assessment bank"
                >
                  📤
                </span>
                <span
                  role="button"
                  className="admin-screens-delete-row"
                  onClick={(e) => { e.stopPropagation(); handleDeleteCapture(cap) }}
                  title="Delete this capture"
                  style={{ pointerEvents: deletingIds.has(cap.id) ? 'none' : undefined, opacity: deletingIds.has(cap.id) ? 0.4 : 1 }}
                >
                  {deletingIds.has(cap.id) ? '…' : '🗑'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Level 3 — Full Q&A for the selected capture */}
      {level === 'detail' && selected && (
        <div className="admin-screens-detail standalone">
          <div className="admin-screens-detail-header">
            <div>
              <div className="admin-screens-detail-title">{formatTestType(selected.detected_test_type || selected.test_type)}</div>
              <div className="admin-screens-detail-sub">
                {selected.user_email} · {formatDate(selected.created_at)}
                {selected.detected_platform && <> · {selected.detected_platform}</>}
                {selected.session_id && <> · session {selected.session_id.slice(0, 8)}</>}
              </div>
              {selected.source_url && (
                <div className="admin-screens-source-url">{selected.source_url}</div>
              )}
            </div>
            <div className="admin-screens-scores">
              <span style={{ color: scoreColor(selected.score_accuracy) }}>Acc {selected.score_accuracy ?? '—'}</span>
              <span style={{ color: scoreColor(selected.score_completeness) }}>Comp {selected.score_completeness ?? '—'}</span>
              <span style={{ color: scoreColor(selected.score_overall) }}>Overall {selected.score_overall ?? '—'}</span>
            </div>
          </div>

          {selected.score_notes && (
            <div className="admin-screens-notes">{selected.score_notes}</div>
          )}

          {detailUrls.length > 0 && (
            <div className="admin-screens-images">
              {detailUrls.map((url, i) => (
                <img key={url} src={url} alt={`Screenshot ${i + 1}`} className="admin-screens-full-img" />
              ))}
            </div>
          )}

          {selected.extracted_questions && (
            <>
              <div className="admin-screens-answer-label">Questions</div>
              <pre className="admin-screens-answer">{selected.extracted_questions}</pre>
            </>
          )}

          <div className="admin-screens-answer-label">AI Answer</div>
          <pre className="admin-screens-answer">{selected.ai_answer}</pre>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="button" className="setup-btn primary" onClick={() => openSendModal(selected)}>
              📤 Send to Solved Assessment bank
            </button>
            <button type="button" className="setup-btn secondary" onClick={() => handleDeleteCapture(selected)}>
              🗑 Delete capture
            </button>
          </div>
        </div>
      )}

      </div>

      {sendModalCap && (
        <div className="send-modal-overlay" onClick={sendSent ? undefined : closeSendModal}>
          <div className="send-modal" onClick={(e) => e.stopPropagation()}>
            {sendSent ? (
              <div className="send-modal-sent">
                <div className="send-modal-sent-icon" aria-hidden="true">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="8 12 11 15 16 9" />
                  </svg>
                </div>
                <div className="send-modal-sent-title">Sent</div>
                {sendSentSummary && <div className="send-modal-sent-sub">{sendSentSummary}</div>}
              </div>
            ) : (
              <>
                <div className="send-modal-header">
                  <div className="send-modal-title">Send to Solved Assessment bank</div>
                  <button type="button" className="send-modal-close" onClick={closeSendModal}>✕</button>
                </div>
                <div className="send-modal-hint">
                  Each blank-line-separated question becomes its own row. Re-sending the same question updates it instead of duplicating.
                </div>

                <label className="send-modal-label">Platform</label>
                <input
                  type="text"
                  className="send-modal-input"
                  placeholder="e.g. Outlier, HackerRank, Mettl"
                  value={sendPlatform}
                  onChange={(e) => setSendPlatform(e.target.value)}
                />

                <label className="send-modal-label">Assessment Type</label>
                <input
                  type="text"
                  className="send-modal-input"
                  placeholder="e.g. Aether Onboarding, Skill: Python"
                  value={sendAssessment}
                  onChange={(e) => setSendAssessment(e.target.value)}
                />

                <label className="send-modal-label">Questions (blank line between each)</label>
                <textarea
                  className="send-modal-textarea"
                  rows={6}
                  value={sendQuestionsText}
                  onChange={(e) => setSendQuestionsText(e.target.value)}
                />

                <label className="send-modal-label">Answer</label>
                <textarea
                  className="send-modal-textarea"
                  rows={8}
                  value={sendAnswerText}
                  onChange={(e) => setSendAnswerText(e.target.value)}
                />

                <label className="send-modal-checkbox-row">
                  <input
                    type="checkbox"
                    checked={sendParaphraseEnabled}
                    onChange={(e) => setSendParaphraseEnabled(e.target.checked)}
                  />
                  <span>
                    Allow users to paraphrase / humanize this answer
                    <span className="send-modal-checkbox-hint">
                      When enabled, Premium Plus users can highlight text in the answer field and rewrite it via QuillBot.
                    </span>
                  </span>
                </label>

                {sendError && <div className="send-modal-error">{sendError}</div>}

                <div className="send-modal-footer">
                  <button type="button" className="setup-btn secondary" onClick={closeSendModal} disabled={sending}>
                    Close
                  </button>
                  <button type="button" className="setup-btn primary" onClick={handleSendToSolved} disabled={sending}>
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
