import { useEffect, useRef, useState } from 'react'

type QuestionType = 'behavioral' | 'system-design' | 'technical' | 'coding' | 'general'

const TYPE_LABELS: Record<QuestionType, string> = {
  behavioral: '🧠 BEHAVIORAL',
  'system-design': '🏗️ SYSTEM DESIGN',
  technical: '⚙️ TECHNICAL',
  coding: '💻 CODING',
  general: '💬 GENERAL',
}

const TYPE_COLORS: Record<QuestionType, string> = {
  behavioral: '#60a5fa',
  'system-design': '#38bdf8',
  technical: '#34d399',
  coding: '#fb923c',
  general: '#94a3b8',
}

export default function Overlay() {
  const [tokens, setTokens] = useState<string>('')
  const [questionType, setQuestionType] = useState<QuestionType>('general')
  const [questionText, setQuestionText] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [visible, setVisible] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.onQuestionDetected((question, type) => {
      setQuestionText(question)
      setQuestionType(type as QuestionType)
      setTokens('')
      setIsGenerating(true)
      setVisible(true)
    })

    api.onToken((token) => {
      setTokens((prev) => prev + token)
    })

    api.onAnswerDone(() => {
      setIsGenerating(false)
    })

    return () => {
      api.removeAllListeners('question:detected')
      api.removeAllListeners('llm:token')
      api.removeAllListeners('llm:done')
    }
  }, [])

  // Auto-scroll to bottom as tokens stream in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [tokens])

  const handleCopy = () => {
    window.electronAPI?.copyAnswer(tokens)
  }

  const typeColor = TYPE_COLORS[questionType] || TYPE_COLORS.general
  const typeLabel = TYPE_LABELS[questionType] || TYPE_LABELS.general

  if (!visible) return null

  return (
    <div className="overlay-root" style={{ '--type-color': typeColor } as React.CSSProperties}>
      {/* Drag handle + header */}
      <div className="overlay-header">
        <div className="overlay-type-badge" style={{ color: typeColor, borderColor: typeColor }}>
          {typeLabel}
        </div>
        <div className="overlay-controls">
          {isGenerating && <span className="overlay-pulse" />}
          <button className="overlay-btn" onClick={handleCopy} title="Copy (Alt+C)">⎘</button>
          <button className="overlay-btn overlay-btn-close" onClick={() => setVisible(false)} title="Hide (Alt+H)">✕</button>
        </div>
      </div>

      {/* Question preview */}
      {questionText && (
        <div className="overlay-question">
          {questionText.length > 100 ? questionText.substring(0, 100) + '…' : questionText}
        </div>
      )}

      {/* Streaming answer */}
      <div className="overlay-answer" ref={scrollRef}>
        {tokens ? (
          <pre className="overlay-answer-text">{tokens}</pre>
        ) : (
          <div className="overlay-placeholder">Listening…</div>
        )}
        {isGenerating && <span className="overlay-cursor">▌</span>}
      </div>
    </div>
  )
}
