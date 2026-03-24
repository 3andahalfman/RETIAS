import { useEffect, useState, useRef } from 'react'

interface TranscriptLine {
  text: string
  isFinal: boolean
  timestamp: number
}

interface Props { micActive?: boolean }

export default function TranscriptPanel({ micActive = true }: Props) {
  const [lines, setLines] = useState<TranscriptLine[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.onTranscript((text, isFinal) => {
      setLines((prev) => {
        if (isFinal) {
          const withoutPartials = prev.filter((l) => l.isFinal)
          return [...withoutPartials, { text, isFinal: true, timestamp: Date.now() }].slice(-50)
        } else {
          const finals = prev.filter((l) => l.isFinal)
          return [...finals, { text, isFinal: false, timestamp: Date.now() }]
        }
      })
    })

    return () => api.removeAllListeners('transcript:update')
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, autoScroll])

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const handleClear = () => setLines([])

  return (
    <div className="transcript-panel">
      {/* Panel header */}
      <div className="panel-header-row">
        <div className="panel-header-left">
          <span className="panel-title">Live Transcript</span>
        </div>
        <div className="panel-header-right">
          <span className={`panel-mic-badge${micActive ? '' : ' muted'}`}>
            <span className="panel-mic-dot" />
            {micActive ? 'Mic Active' : 'Mic Muted'}
          </span>
          <label className="autoscroll-toggle" title="Auto-scroll">
            <input
              type="checkbox"
              aria-label="Auto-scroll"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span className="autoscroll-slider" />
          </label>
          <button className="panel-action-btn" onClick={handleClear} title="Clear transcript">🗑</button>
        </div>
      </div>

      {/* Lines */}
      <div className="transcript-lines" ref={scrollRef}>
        {lines.length === 0 && (
          <p className="panel-placeholder">Transcript will appear here…</p>
        )}
        {lines.map((line, i) => (
          <div key={i} className={`transcript-entry ${line.isFinal ? 'final' : 'partial'}`}>
            <span className="transcript-text">{line.text}</span>
            {line.isFinal && (
              <span className="transcript-time">{formatTime(line.timestamp)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
