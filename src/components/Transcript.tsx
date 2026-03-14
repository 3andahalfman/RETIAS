import { useEffect, useState, useRef } from 'react'

interface TranscriptLine {
  text: string
  isFinal: boolean
  timestamp: number
}

export default function TranscriptPanel() {
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
      <div className="panel-subheader">
        <label className="autoscroll-toggle">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          <span className="autoscroll-slider" />
          Auto-scroll
        </label>
        <div className="panel-actions">
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
