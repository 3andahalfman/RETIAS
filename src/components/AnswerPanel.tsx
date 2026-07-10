import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import 'katex/dist/katex.min.css'
import { AutoTypeHeaderButton, AutoTypeStatusStrip } from './InlineAutoTyper'
import AnswerSelectionToolbar from './AnswerSelectionToolbar'
import { replacePlainSelectionInMarkdown } from '../lib/markdown-selection'
import { displayQuestionText } from '../lib/question-text'
import { getMeetingPromptLabel } from '../lib/meeting-types'
import ProjectInstructionsPanel from './ProjectInstructionsPanel'
import { useTextSelection } from '../lib/use-text-selection'

interface AnswerEntry {
  question: string
  questionType: string
  answer: string
  timestamp: number
  generating: boolean
}

const FONT_SIZES = [13, 15, 17, 19]

interface Props {
  isPremium?: boolean
  isOnlineTest?: boolean
  isProjectOnboarding?: boolean
  projectInstructions?: string
  onApplyProjectInstructions?: (instructions: string) => void
  isMeeting?: boolean
  meetingType?: 'standup' | 'general'
  isStarted?: boolean
  captureQueue?: string[]
  onCapture?: () => void
  onAnalyseAll?: () => void
  onClearCaptures?: () => void
  isAnalysingCaptures?: boolean
  canAutoType?: boolean
  canParaphrase?: boolean
}

export default function AnswerPanel({
  isPremium = false,
  isOnlineTest = false,
  isProjectOnboarding = false,
  projectInstructions = '',
  onApplyProjectInstructions,
  isMeeting = false,
  meetingType,
  isStarted = false,
  captureQueue = [],
  onCapture,
  onAnalyseAll,
  onClearCaptures,
  isAnalysingCaptures = false,
  canAutoType = false,
  canParaphrase = false,
}: Props) {
  const [answers, setAnswers] = useState<AnswerEntry[]>([])
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [analysing, setAnalysing] = useState(false)
  const [fontSizeIdx, setFontSizeIdx] = useState(() => {
    const saved = localStorage.getItem('answer-font-size-idx')
    return saved ? Math.min(Number(saved), FONT_SIZES.length - 1) : 0
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const answerTextRef = useRef<HTMLDivElement>(null)
  const { selection, clearSelection } = useTextSelection(
    answerTextRef,
    undefined,
    false,
  )

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.onQuestionDetected((question, type) => {
      const newEntry: AnswerEntry = {
        question,
        questionType: type,
        answer: '',
        timestamp: Date.now(),
        generating: true,
      }
      setAnswers((prev) => {
        const next = [...prev, newEntry]
        setCurrentIdx((idx) => (idx < 0 || idx >= prev.length - 1) ? next.length - 1 : idx)
        return next
      })
    })

    // question:update = compound question continuation — replace the last generating entry
    // so it refreshes in-place rather than creating a second answer card
    api.onQuestionUpdate?.((question, type) => {
      setAnswers((prev) => {
        if (prev.length === 0) {
          // No existing entry — treat as a fresh question:detected
          const newEntry: AnswerEntry = { question, questionType: type, answer: '', timestamp: Date.now(), generating: true }
          setCurrentIdx(0)
          return [newEntry]
        }
        // Replace last entry: update question text, clear answer, keep generating
        const updated = [...prev.slice(0, -1), { ...prev[prev.length - 1], question, questionType: type, answer: '', generating: true }]
        setCurrentIdx(updated.length - 1)
        return updated
      })
    })

    api.onToken((token) => {
      setAnswers((prev) => {
        if (prev.length === 0) return prev
        const last = prev[prev.length - 1]
        return [...prev.slice(0, -1), { ...last, answer: last.answer + token }]
      })
    })

    const unsubDone = api.onAnswerDone(() => {
      setAnswers((prev) => {
        if (prev.length === 0) return prev
        return [...prev.slice(0, -1), { ...prev[prev.length - 1], generating: false }]
      })
    })

    return () => {
      unsubDone()
      api.removeAllListeners('question:detected')
      api.removeAllListeners('question:update')
      api.removeAllListeners('llm:token')
    }
  }, [])

  useEffect(() => {
    const current = answers[currentIdx]
    if (current?.generating && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [answers, currentIdx])

  const current = currentIdx >= 0 ? answers[currentIdx] : null
  const displayQuestion = current ? displayQuestionText(current.question) : ''

  // Capture the latest answer at click-time (not render-time) so the
  // Auto-Typer always grabs whatever's currently on screen, including text
  // that may have streamed in between renders.
  const currentRef = useRef<AnswerEntry | null>(null)
  useEffect(() => { currentRef.current = current }, [current])
  const getCurrentAnswer = useCallback(() => currentRef.current?.answer ?? null, [])

  const updateCurrentAnswer = useCallback((nextAnswer: string) => {
    setAnswers((prev) => {
      if (currentIdx < 0 || currentIdx >= prev.length) return prev
      return prev.map((entry, i) =>
        i === currentIdx ? { ...entry, answer: nextAnswer } : entry,
      )
    })
  }, [currentIdx])

  const handleReplaceSelection = useCallback((replacement: string) => {
    const source = currentRef.current?.answer ?? ''
    if (!selection?.text || !source) return
    try {
      updateCurrentAnswer(replacePlainSelectionInMarkdown(source, selection.text, replacement))
    } catch {
      // If markdown mapping fails, fall back to replacing the raw selection text.
      updateCurrentAnswer(source.replace(selection.text, replacement))
    }
  }, [selection?.text, updateCurrentAnswer])

  const handleCopy = () => {
    if (current?.answer) window.electronAPI?.copyAnswer(current.answer)
  }

  const handleDelete = () => {
    if (!current || answers.length === 0) return
    setAnswers((prev) => {
      const next = prev.filter((_, i) => i !== currentIdx)
      setCurrentIdx((idx) => Math.max(0, Math.min(idx, next.length - 1)))
      return next
    })
  }

  const handleRefresh = () => {
    if (answers.length === 0) return
    setAnswers((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      return [...prev.slice(0, -1), { ...last, answer: '', generating: true }]
    })
    setCurrentIdx(answers.length - 1)
    window.electronAPI?.regenerateAnswer()
  }

  const handlePrev = () => setCurrentIdx((i) => Math.max(0, i - 1))
  const handleNext = () => setCurrentIdx((i) => Math.min(answers.length - 1, i + 1))

  const handleFontDecrease = () => setFontSizeIdx((i) => {
    const next = Math.max(0, i - 1)
    localStorage.setItem('answer-font-size-idx', String(next))
    return next
  })
  const handleFontIncrease = () => setFontSizeIdx((i) => {
    const next = Math.min(FONT_SIZES.length - 1, i + 1)
    localStorage.setItem('answer-font-size-idx', String(next))
    return next
  })

  const [copied, setCopied] = useState(false)
  const hasNewerAnswer = current && !current.generating && currentIdx < answers.length - 1
  const canRefresh = answers.length > 0 && !answers[answers.length - 1].generating

  const handleCopyWithToast = () => {
    handleCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleAnalyseScreen = async () => {
    if (analysing || !isPremium) return
    setAnalysing(true)
    try { await window.electronAPI?.analyseScreen() }
    finally { setAnalysing(false) }
  }

  const answerQuickTools = (
    <>
      <button type="button" className="panel-action-btn" onClick={handleFontDecrease} title="Decrease text size" disabled={fontSizeIdx === 0}>A-</button>
      <button type="button" className="panel-action-btn" onClick={handleFontIncrease} title="Increase text size" disabled={fontSizeIdx === FONT_SIZES.length - 1}>A+</button>
      <span className="panel-action-divider" />
      <button type="button" className="panel-action-btn copy-btn" onClick={handleCopyWithToast} title="Copy answer" disabled={!current?.answer}>
        {copied ? <span className="copy-toast">✓ Copied!</span> : '📋'}
      </button>
      <button type="button" className="panel-action-btn" onClick={handleRefresh} title="Regenerate last answer" disabled={!canRefresh}>↺</button>
      <button type="button" className="panel-action-btn" onClick={handleDelete} title="Delete answer" disabled={!current}>🗑</button>
    </>
  )

  const autoTypeTool = (
    <AutoTypeHeaderButton
      getText={getCurrentAnswer}
      disabled={!current?.answer || current.generating}
      locked={!canAutoType}
      title={
        !canAutoType
          ? 'Premium Plus — upgrade to unlock Auto-Typer'
          : current?.generating
            ? 'Waiting for answer to finish generating…'
            : 'Auto-type full answer — highlight a section to type just that part'
      }
    />
  )

  const selectionToolsEnabled = isOnlineTest && !current?.generating && !!current?.answer

  const answerTools = (
    <>
      {answerQuickTools}
      {autoTypeTool}
    </>
  )

  const screenTools = isOnlineTest ? (
    <>
      <button
        type="button"
        className="panel-capture-btn"
        onClick={onCapture}
        disabled={captureQueue.length >= 5}
        title={captureQueue.length >= 5 ? 'Max 5 screenshots' : 'Capture screenshot'}
      >
        📸{captureQueue.length > 0 ? ` ${captureQueue.length}` : ' Capture'}
      </button>
      {captureQueue.length > 0 && (
        <button type="button" className="panel-action-btn" onClick={onClearCaptures} title="Clear captures">✕</button>
      )}
      <button
        type="button"
        className="panel-analyse-btn"
        onClick={onAnalyseAll}
        disabled={captureQueue.length === 0 || isAnalysingCaptures}
        title={isAnalysingCaptures ? 'Analysis in progress…' : 'Send all screenshots to AI'}
      >
        Analyse All →
      </button>
    </>
  ) : isMeeting ? null : (
    <button
      type="button"
      className={`panel-analyse-btn${analysing ? ' loading' : ''}${!isPremium ? ' locked' : ''}`}
      onClick={handleAnalyseScreen}
      disabled={analysing || !isPremium || !isStarted}
      title={!isStarted ? 'Click Start first' : isPremium ? 'Analyse Screen' : '🔒 Premium feature'}
    >
      {!isPremium && '🔒 '}{analysing ? '⏳' : '🖥 Analyse Screen'}
    </button>
  )

  return (
    <div className="answer-panel" data-font-size={fontSizeIdx}>
      <div className={`panel-header${isOnlineTest ? ' panel-header--stacked' : ''}`}>
        <div className="panel-header-row panel-header-row--primary">
          <div className="panel-tabs">
            <span className="panel-tab active">AI Answer</span>
            <span className="panel-tab-sep" />
            <div className="panel-nav-arrows">
              <button type="button" className="panel-nav-btn" onClick={handlePrev} disabled={currentIdx <= 0} title="Previous answer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <span className="panel-nav-count">{answers.length > 0 ? `${currentIdx + 1} / ${answers.length}` : '—'}</span>
              <button type="button" className="panel-nav-btn" onClick={handleNext} disabled={currentIdx >= answers.length - 1} title="Next answer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
            {hasNewerAnswer && (
              <button type="button" className="panel-tab new-answer-hint" onClick={() => setCurrentIdx(answers.length - 1)} title="Jump to latest">↓ Latest</button>
            )}
          </div>

          {isOnlineTest ? (
            <div className="panel-header-right">
              {answerQuickTools}
            </div>
          ) : (
            <div className="panel-header-right">
              {screenTools}
              <span className="panel-action-divider" />
              {answerTools}
            </div>
          )}
        </div>

        {isOnlineTest && (
          <div className="panel-header-row panel-header-row--tools">
            {isProjectOnboarding && onApplyProjectInstructions && (
              <ProjectInstructionsPanel
                instructions={projectInstructions}
                onApply={onApplyProjectInstructions}
              />
            )}
            <div className="panel-header-row panel-header-row--tools-inner">
              <div className="panel-tool-group panel-tool-group--screen">
                {screenTools}
              </div>
              <div className="panel-tool-group panel-tool-group--answer">
                {autoTypeTool}
              </div>
            </div>
          </div>
        )}
      </div>

      <AutoTypeStatusStrip dense />

      <div className="answer-content" ref={scrollRef}>
        {!current ? (
          <p className="panel-placeholder">
            {isMeeting
              ? 'Talking points will appear here when meeting prompts are detected…'
              : 'AI answers will appear here when questions are detected…'}
          </p>
        ) : (
          <>
            {isMeeting && (
              <div className="answer-meeting-label">{getMeetingPromptLabel(meetingType)}</div>
            )}
            {displayQuestion && (
              <div className="answer-question">
                <span className="answer-question-icon">🎯</span>
                {displayQuestion}
              </div>
            )}
            {(current.answer || current.generating) && (
              <div className="answer-body">
                <div className="answer-label"><span>{isMeeting ? '💬' : '⭐'}</span> {isMeeting ? 'Talking points' : 'Answer'}</div>
                <div
                  ref={answerTextRef}
                  className={`answer-text${selectionToolsEnabled ? ' answer-text--selectable' : ''}`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, output: 'html' }]]}
                    components={{
                      code({ node, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '')
                        const isBlock = !props.inline && match
                        return isBlock ? (
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match[1]}
                            PreTag="div"
                            className="answer-code-block"
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className="answer-inline-code" {...props}>
                            {children}
                          </code>
                        )
                      },
                    }}
                  >
                    {current.answer}
                  </ReactMarkdown>
                  {current.generating && <span className="answer-cursor">▌</span>}
                </div>
                {selectionToolsEnabled && (
                  <p className="answer-selection-hint">
                    Highlight any part of the answer to auto-type, paraphrase, or humanize just that section.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {selectionToolsEnabled && selection && (
        <AnswerSelectionToolbar
          selection={selection}
          onDismiss={clearSelection}
          onReplaceSelection={handleReplaceSelection}
          canAutoType={canAutoType}
          canParaphrase={canParaphrase}
          autoTypeLocked={!canAutoType}
          paraphraseLocked={!canParaphrase}
        />
      )}
    </div>
  )
}
