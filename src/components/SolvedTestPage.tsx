import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, syncSupabaseSession } from '../lib/supabase'
import AnswerTextareaWithRewrite from './AnswerTextareaWithRewrite'
import Toolbar from './Toolbar'
import TranscriptPanel from './Transcript'
import AnswerPanel from './AnswerPanel'
import AudioCapture from './AudioCapture'
import ManualPromptBar from './ManualPromptBar'
import { loadSettings } from './Settings'
import { AutoTypeHeaderButton, AutoTypeStatusStrip } from './InlineAutoTyper'
import WindowControls from './WindowControls'
import {
  IconAssessmentDoc,
  IconPlatform,
  IconSolvedBank,
  ONLINE_TEST_ACCENTS,
  OnlineTestIconBadge,
  OnlineTestPageHeader,
} from './OnlineTestIcons'

interface SolvedQuestion {
  id: string
  platform: string
  assessment_type: string
  question: string
  answer: string
  answer_variants: string[] | null
  paraphrase_enabled?: boolean
  source_url: string | null
  created_at: string
}

interface Props {
  user: User
  onBack: () => void
  onDock: () => void
}

type Level = 'platforms' | 'assessments' | 'questions'

interface SavedNav {
  level: Level
  activePlatform: string | null
  activeAssessment: string | null
  questionIndex: number
  search: string
}

const NAV_KEY = 'retias-solved-nav'

function readSavedNav(): SavedNav | null {
  try {
    const raw = sessionStorage.getItem(NAV_KEY)
    if (!raw) return null
    const nav = JSON.parse(raw) as SavedNav
    if (nav.level === 'questions' && (!nav.activePlatform || !nav.activeAssessment)) return null
    if (nav.level === 'assessments' && !nav.activePlatform) return null
    return nav
  } catch {
    return null
  }
}

function writeSavedNav(nav: SavedNav) {
  sessionStorage.setItem(NAV_KEY, JSON.stringify(nav))
}

function clearSavedNav() {
  sessionStorage.removeItem(NAV_KEY)
}

export default function SolvedTestPage({ user, onBack, onDock }: Props) {
  const saved = readSavedNav()
  const [rows, setRows] = useState<SolvedQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState<Level>(saved?.level ?? 'platforms')
  const [activePlatform, setActivePlatform] = useState<string | null>(saved?.activePlatform ?? null)
  const [activeAssessment, setActiveAssessment] = useState<string | null>(saved?.activeAssessment ?? null)
  const [search, setSearch] = useState(saved?.search ?? '')
  const [questionIndex, setQuestionIndex] = useState(saved?.questionIndex ?? 0)
  const [answerById, setAnswerById] = useState<Record<string, string>>({})

  // Live assessment mode (online test capture from solved Q&A)
  const [liveActive, setLiveActive] = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [captureQueue, setCaptureQueue] = useState<string[]>([])
  const [convState, setConvState] = useState('IDLE')
  const [isDocked, setIsDocked] = useState(false)
  const panelsRef = useRef<HTMLDivElement>(null)
  const aiModel = loadSettings().aiModel

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.listSolvedQuestions) {
        const data = await window.electronAPI.listSolvedQuestions()
        setRows(data as SolvedQuestion[])
      } else {
        await syncSupabaseSession(true)
        const { data, error: qErr } = await supabase
          .from('solved_questions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000)
        if (qErr) throw new Error(qErr.message)
        setRows((data ?? []) as SolvedQuestion[])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load solved questions')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Keep navigation in sessionStorage so docking (which unmounts this
  // component via App.tsx's docked early-return) doesn't reset the user
  // back to the platform picker when they expand again.
  useEffect(() => {
    writeSavedNav({ level, activePlatform, activeAssessment, questionIndex, search })
  }, [level, activePlatform, activeAssessment, questionIndex, search])

  useEffect(() => {
    window.electronAPI?.onConvState((state) => setConvState(state))
  }, [])

  const persistNav = useCallback(() => {
    writeSavedNav({ level, activePlatform, activeAssessment, questionIndex, search })
  }, [level, activePlatform, activeAssessment, questionIndex, search])

  const handleDock = useCallback(() => {
    persistNav()
    onDock()
  }, [persistNav, onDock])

  const handleExit = useCallback(() => {
    clearSavedNav()
    onBack()
  }, [onBack])

  const goToAssessmentsFromQA = () => {
    if (liveActive) {
      window.electronAPI?.stopSession()
      setLiveActive(false)
      setCaptureQueue([])
    }
    goToAssessments(activePlatform!)
  }

  const handleStartLive = () => {
    let model = aiModel
    if (model === 'claude-opus-4-5' && !user.is_premium) {
      model = 'claude-sonnet-4-6'
    }
    const testType = activeAssessment || activePlatform || 'online-test'
    window.electronAPI?.startSession({ testType, aiModel: model })
    setLiveActive(true)
    setMicActive(false)
  }

  const handleEndLive = () => {
    window.electronAPI?.stopSession()
    setLiveActive(false)
    setCaptureQueue([])
  }

  const handleCapture = async () => {
    if (captureQueue.length >= 5) return
    try {
      const base64 = await window.electronAPI?.captureScreen()
      if (base64) setCaptureQueue((prev) => [...prev, base64])
    } catch {}
  }

  const handleAnalyseAll = () => {
    if (captureQueue.length === 0) return
    window.electronAPI?.analyseScreens(captureQueue)
    setCaptureQueue([])
  }

  const toggleDock = () => {
    const next = !isDocked
    if (next) persistNav()
    setIsDocked(next)
    if (next) onDock()
    else window.electronAPI?.undockWindow()
  }

  const tree = useMemo(() => {
    const map = new Map<string, Map<string, SolvedQuestion[]>>()
    for (const row of rows) {
      const platform = row.platform || 'Unknown'
      const assessment = row.assessment_type || 'General'
      if (!map.has(platform)) map.set(platform, new Map())
      const inner = map.get(platform)!
      if (!inner.has(assessment)) inner.set(assessment, [])
      inner.get(assessment)!.push(row)
    }
    return map
  }, [rows])

  const platforms = useMemo(() => Array.from(tree.keys()).sort(), [tree])
  const assessmentTypes = useMemo(() => {
    if (!activePlatform) return []
    return Array.from(tree.get(activePlatform)?.keys() ?? []).sort()
  }, [tree, activePlatform])
  const questions = useMemo(() => {
    if (!activePlatform || !activeAssessment) return []
    const list = tree.get(activePlatform)?.get(activeAssessment) ?? []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter((row) =>
      row.question.toLowerCase().includes(q) ||
      row.answer.toLowerCase().includes(q),
    )
  }, [tree, activePlatform, activeAssessment, search])

  const goToPlatforms = () => {
    setLevel('platforms')
    setActivePlatform(null)
    setActiveAssessment(null)
    setSearch('')
    setQuestionIndex(0)
  }
  const goToAssessments = (platform: string) => {
    setActivePlatform(platform)
    setActiveAssessment(null)
    setLevel('assessments')
    setSearch('')
    setQuestionIndex(0)
  }
  const goToQuestions = (assessment: string) => {
    setActiveAssessment(assessment)
    setLevel('questions')
    setSearch('')
    setQuestionIndex(0)
  }

  const headerTitle =
    level === 'platforms' ? 'Solved Assessment'
    : level === 'assessments' ? activePlatform
    : `${activePlatform} · ${activeAssessment}`

  const safeIndex = Math.min(questionIndex, Math.max(0, questions.length - 1))
  const current = questions[safeIndex]

  const headerSubtitle =
    level === 'platforms' ? 'Pick a platform to browse curated assessments.'
    : level === 'assessments' ? 'Pick an assessment type.'
    : questions.length === 0
      ? '0 solved questions'
      : `Question ${safeIndex + 1} of ${questions.length}`

  const goPrev = () => setQuestionIndex((i) => Math.max(0, i - 1))
  const goNext = () => setQuestionIndex((i) => Math.min(questions.length - 1, i + 1))

  const displayAnswer = current ? (answerById[current.id] ?? current.answer) : ''

  const setDisplayAnswer = (text: string) => {
    if (!current) return
    setAnswerById((prev) => ({ ...prev, [current.id]: text }))
  }

  // Stable getter so the inline Auto-Type button always grabs the current
  // (possibly user-edited) answer at click-time rather than at render-time.
  const displayAnswerRef = useRef('')
  useEffect(() => { displayAnswerRef.current = displayAnswer }, [displayAnswer])
  const getSolvedAnswer = useCallback(() => displayAnswerRef.current || null, [])

  // ── Q&A session layout (interview-style) ─────────────────────────────────
  if (level === 'questions' && activePlatform && activeAssessment) {
    const sessionLabel = `${activePlatform} · ${activeAssessment}`

    return (
      <div className={`app-root session solved-qa-session${isDocked ? ' docked' : ''}`}>
        <AudioCapture active={liveActive && micActive} />

        {isDocked && (
          <div
            className="docked-content"
            onClick={toggleDock}
            onMouseEnter={() => window.electronAPI?.setIgnoreMouseEvents(false)}
            onMouseLeave={() => window.electronAPI?.setIgnoreMouseEvents(true)}
            title="Click to expand"
          >
            <img className="docked-logo" src="./logo.svg" alt="Logo" />
          </div>
        )}

        <div className={isDocked ? 'session-panels-hidden' : 'session-panels'}>
          <Toolbar
            variant="solved"
            sessionActive
            isStarted={liveActive}
            solvedLiveActive={liveActive}
            onStartLive={handleStartLive}
            onStartSession={handleStartLive}
            onStopSession={handleEndLive}
            micActive={micActive}
            onToggleMic={() => setMicActive((v) => !v)}
            isDocked={isDocked}
            onToggleDock={toggleDock}
            convState={convState}
            isPremium={user.is_premium}
            sessionCompany={activePlatform}
            sessionRole={activeAssessment}
            aiModel={aiModel}
            onBack={goToAssessmentsFromQA}
          />

          <div className="panels solved-qa-panels" ref={panelsRef}>
            {liveActive ? (
              <>
                <TranscriptPanel micActive={micActive} />
                <div className="panel-divider" />
                <AnswerPanel
                  isPremium={user.is_premium}
                  isOnlineTest
                  isStarted={liveActive}
                  captureQueue={captureQueue}
                  onCapture={handleCapture}
                  onAnalyseAll={handleAnalyseAll}
                  onClearCaptures={() => setCaptureQueue([])}
                />
              </>
            ) : (
              <>
                <div className="transcript-panel solved-question-panel">
                  <div className="panel-header-row">
                    <div className="panel-header-left">
                      <span className="panel-title">Question</span>
                      {questions.length > 0 && (
                        <span className="panel-nav-count solved-qa-count">
                          {safeIndex + 1} / {questions.length}
                        </span>
                      )}
                    </div>
                    <div className="panel-header-right">
                      <div className="panel-nav-arrows">
                        <button type="button" className="panel-nav-btn" onClick={goPrev} disabled={safeIndex === 0} title="Previous question">←</button>
                        <button type="button" className="panel-nav-btn" onClick={goNext} disabled={safeIndex >= questions.length - 1} title="Next question">→</button>
                      </div>
                    </div>
                  </div>
                  <div className="solved-qa-search-wrap">
                    <input
                      type="text"
                      placeholder="Search questions or answers…"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setQuestionIndex(0) }}
                      className="solved-test-search-bar solved-qa-search"
                    />
                  </div>
                  <div className="transcript-content solved-question-content">
                    {!current ? (
                      <p className="panel-placeholder">No questions match your search.</p>
                    ) : (
                      <>
                        <div className="solved-qa-q-badge">Q{safeIndex + 1}</div>
                        <pre className="solved-test-block solved-qa-question-text">{current.question}</pre>
                        {current.source_url && (
                          <div className="solved-test-detail-url">{current.source_url}</div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="panel-divider" />

                <div className="answer-panel solved-answer-panel">
                  <div className="panel-header-row">
                    <div className="panel-header-left">
                      <span className="panel-title">Answer</span>
                      {current?.paraphrase_enabled && (
                        <span className="solved-test-rewrite-badge"> · rewrite tools below</span>
                      )}
                    </div>
                    <div className="panel-header-right panel-header-right--muted">
                      <AutoTypeHeaderButton
                        getText={getSolvedAnswer}
                        disabled={!displayAnswer}
                        title="Auto-type this answer into the focused window"
                      />
                      <span className="panel-disabled-hint">Live capture available after Start</span>
                    </div>
                  </div>
                  <AutoTypeStatusStrip dense />
                  <div className="answer-content solved-answer-content">
                    {!current ? (
                      <p className="panel-placeholder">Select a question to view the answer.</p>
                    ) : (
                      <AnswerTextareaWithRewrite
                        key={current.id}
                        questionId={current.id}
                        value={displayAnswer}
                        onChange={setDisplayAnswer}
                        paraphraseEnabled={!!current.paraphrase_enabled}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <ManualPromptBar
            sessionActive={liveActive}
            isPremium={user.is_premium}
            browseMode={!liveActive}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="setup-root">
      <div className="setup-inner-topbar">
        <div className="setup-inner-topbar-left">
          {level === 'platforms' ? (
            <button type="button" className="setup-breadcrumb-btn" onClick={handleExit}>
              ← Back to Dashboard
            </button>
          ) : (
            <button type="button" className="setup-breadcrumb-btn" onClick={goToPlatforms}>
              ← Platforms
            </button>
          )}
        </div>
        <div className="setup-inner-topbar-right">
          <WindowControls onDock={handleDock} />
        </div>
      </div>

      {level === 'platforms' ? (
        <OnlineTestPageHeader
          title="Solved Assessment"
          subtitle={headerSubtitle}
          accent={ONLINE_TEST_ACCENTS.blue}
          icon={IconSolvedBank}
        />
      ) : (
        <div className="online-test-header online-test-header--compact">
          <h1 className="online-test-title">{headerTitle}</h1>
          <p className="online-test-subtitle">{headerSubtitle}</p>
        </div>
      )}

      <div className="online-test-body">
        {loading && <div className="solved-test-empty">Loading…</div>}
        {error && <div className="solved-test-error">{error}</div>}

        {!loading && !error && rows.length === 0 && (
          <div className="solved-test-empty">
            No solved questions yet. The admin transfers them from the Screenshot Library.
          </div>
        )}

        {!loading && !error && level === 'platforms' && rows.length > 0 && (
          <div className="solved-test-grid">
            {platforms.map((p) => {
              const types = tree.get(p)!
              const total = Array.from(types.values()).reduce((sum, arr) => sum + arr.length, 0)
              return (
                <button
                  key={p}
                  type="button"
                  className="solved-test-card"
                  onClick={() => goToAssessments(p)}
                >
                  <div className="online-test-card-top">
                    <OnlineTestIconBadge accent={ONLINE_TEST_ACCENTS.teal}>
                      <IconPlatform size={18} />
                    </OnlineTestIconBadge>
                    <div className="solved-test-card-title">{p}</div>
                  </div>
                  <div className="solved-test-card-meta">
                    {types.size} assessment{types.size === 1 ? '' : 's'} · {total} question{total === 1 ? '' : 's'}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {!loading && !error && level === 'assessments' && activePlatform && (
          <div className="solved-test-grid">
            {assessmentTypes.map((a) => {
              const count = tree.get(activePlatform)?.get(a)?.length ?? 0
              return (
                <button
                  key={a}
                  type="button"
                  className="solved-test-card"
                  onClick={() => goToQuestions(a)}
                >
                  <div className="online-test-card-top">
                    <OnlineTestIconBadge accent={ONLINE_TEST_ACCENTS.blue}>
                      <IconAssessmentDoc size={18} />
                    </OnlineTestIconBadge>
                    <div className="solved-test-card-title">{a}</div>
                  </div>
                  <div className="solved-test-card-meta">{count} question{count === 1 ? '' : 's'}</div>
                </button>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
