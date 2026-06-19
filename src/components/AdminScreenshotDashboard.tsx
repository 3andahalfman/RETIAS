import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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
  created_at: string
}

interface CaptureStats {
  totalCaptures: number
  avgOverallScore: number | null
  uniqueUsers: number
}

interface Props {
  onDock?: () => void
}

const STORAGE_BUCKET = 'online-test-screenshots'
const SCREENSHOT_PATH_REGEX = /^[\w-]+\/[\w-]+\/\d+\.png$/

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

async function fetchCaptures(offset: number, limit: number): Promise<{ captures: OnlineTestCapture[]; stats: CaptureStats }> {
  if (isElectron && window.electronAPI?.adminListScreenshots) {
    const result = await window.electronAPI.adminListScreenshots(offset, limit)
    if (!result) throw new Error('Failed to load captures')
    return result
  }

  // Browser path — direct Supabase. RLS must allow admin email to SELECT.
  const { data: rows, error } = await supabase
    .from('online_test_captures')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  const captures = (rows ?? []) as OnlineTestCapture[]

  // Compute stats client-side. For large tables, swap this for a Postgres view.
  const { data: statsRows } = await supabase
    .from('online_test_captures')
    .select('user_id, score_overall')

  const totalCaptures = statsRows?.length ?? 0
  const scored = (statsRows ?? []).filter((r) => r.score_overall != null)
  const avg = scored.length
    ? scored.reduce((sum, r) => sum + Number(r.score_overall), 0) / scored.length
    : null
  const stats: CaptureStats = {
    totalCaptures,
    avgOverallScore: avg != null ? Math.round(avg * 10) / 10 : null,
    uniqueUsers: new Set((statsRows ?? []).map((r) => r.user_id)).size,
  }

  return { captures, stats }
}

async function fetchScreenshotUrl(path: string): Promise<string | null> {
  if (!SCREENSHOT_PATH_REGEX.test(path)) return null

  if (isElectron && window.electronAPI?.adminGetScreenshotUrl) {
    return window.electronAPI.adminGetScreenshotUrl(path) ?? null
  }

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

export default function AdminScreenshotDashboard({ onDock }: Props) {
  const [captures, setCaptures] = useState<OnlineTestCapture[]>([])
  const [stats, setStats] = useState<CaptureStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [detailUrls, setDetailUrls] = useState<string[]>([])
  const [showSnapGrid, setShowSnapGrid] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchCaptures(0, 100)
      setCaptures(result.captures)
      setStats(result.stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load screenshot library')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!captures.length) return
    let cancelled = false

    async function loadThumbs() {
      const urls: Record<string, string> = {}
      await Promise.all(
        captures.slice(0, 50).map(async (cap) => {
          const path = cap.screenshot_paths[0]
          if (!path) return
          const url = await fetchScreenshotUrl(path).catch(() => null)
          if (url && !cancelled) urls[cap.id] = url
        })
      )
      if (!cancelled) setThumbUrls(urls)
    }

    loadThumbs()
    return () => { cancelled = true }
  }, [captures])

  const selected = captures.find((c) => c.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) { setDetailUrls([]); return }
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

  return (
    <div className="dash-root admin-screens-root">
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            </button>
          )}
          <button type="button" className="dash-wc-btn dash-wc-close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      <div className="dash-hero">
        <div className="dash-hero-title">Screenshot Library</div>
        <div className="dash-hero-sub">Scored online test captures from all users — admin only.</div>
      </div>

      <div className="dash-metrics-row">
        <div className="dash-metric-card">
          <div className="dash-metric-header">
            <span className="dash-metric-cat">Total Captures</span>
          </div>
          <div className="dash-metric-value">{stats?.totalCaptures ?? '—'}</div>
          <div className="dash-metric-desc">Stored screenshots</div>
        </div>
        <div className="dash-metric-card">
          <div className="dash-metric-header">
            <span className="dash-metric-cat">Avg Score</span>
          </div>
          <div className="dash-metric-value">{stats?.avgOverallScore ?? '—'}</div>
          <div className="dash-metric-desc">Overall quality (0–100)</div>
        </div>
        <div className="dash-metric-card">
          <div className="dash-metric-header">
            <span className="dash-metric-cat">Users</span>
          </div>
          <div className="dash-metric-value">{stats?.uniqueUsers ?? '—'}</div>
          <div className="dash-metric-desc">Contributing accounts</div>
        </div>
      </div>

      <div className="admin-screens-toolbar">
        <button type="button" className="setup-btn secondary" onClick={loadData} disabled={loading}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {error && <div className="admin-screens-error">{error}</div>}

      <div className="admin-screens-layout">
        <div className="admin-screens-list">
          {!loading && captures.length === 0 && (
            <div className="admin-screens-empty">No captures yet. They appear when users run Online Test and click Analyse All.</div>
          )}
          {captures.map((cap) => (
            <button
              key={cap.id}
              type="button"
              className={`admin-screens-row${selectedId === cap.id ? ' selected' : ''}`}
              onClick={() => setSelectedId(cap.id)}
            >
              <div className="admin-screens-thumb">
                {thumbUrls[cap.id] ? (
                  <img src={thumbUrls[cap.id]} alt="" />
                ) : (
                  <span>📸</span>
                )}
              </div>
              <div className="admin-screens-row-info">
                <div className="admin-screens-row-title">{formatTestType(cap.test_type)}</div>
                <div className="admin-screens-row-sub">{cap.user_email} · {formatDate(cap.created_at)}</div>
              </div>
              <div className="admin-screens-score" style={{ color: scoreColor(cap.score_overall) }}>
                {cap.score_overall != null ? Math.round(cap.score_overall) : '—'}
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="admin-screens-detail">
            <div className="admin-screens-detail-header">
              <div>
                <div className="admin-screens-detail-title">{formatTestType(selected.test_type)}</div>
                <div className="admin-screens-detail-sub">{selected.user_email} · {formatDate(selected.created_at)}</div>
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

            <div className="admin-screens-images">
              {detailUrls.map((url, i) => (
                <img key={url} src={url} alt={`Screenshot ${i + 1}`} className="admin-screens-full-img" />
              ))}
            </div>

            <div className="admin-screens-answer-label">AI Answer</div>
            <pre className="admin-screens-answer">{selected.ai_answer}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
