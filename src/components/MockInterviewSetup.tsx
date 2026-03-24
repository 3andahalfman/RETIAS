import { useRef, useState } from 'react'
import type { SessionConfig } from './SetupWizard'

interface Props {
  onCreateSession: (config: SessionConfig) => void
  onBack: () => void
  onDock: () => void
  cvs?: CV[]
}

export default function MockInterviewSetup({ onCreateSession, onBack, onDock, cvs = [] }: Props) {
  const [resumeText, setResumeText] = useState('')
  const [resumeFileName, setResumeFileName] = useState('')
  const [generatedJD, setGeneratedJD] = useState('')
  const [editableJD, setEditableJD] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [showSnapGrid, setShowSnapGrid] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setResumeFileName(file.name)
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext === 'pdf' || ext === 'docx' || ext === 'doc') {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const buffer = ev.target?.result as ArrayBuffer
        const text = await window.electronAPI?.extractResumeText?.(buffer, file.name) ?? ''
        if (!text || text.startsWith('ERROR:')) {
          setError(`Could not extract text from this file${text.startsWith('ERROR:') ? ': ' + text.slice(7) : ''}. Try pasting your resume instead.`)
          setResumeText('')
          setResumeFileName('')
          if (fileInputRef.current) fileInputRef.current.value = ''
        } else {
          setError('')
          setResumeText(text)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = (ev) => setResumeText((ev.target?.result as string) || '')
      reader.readAsText(file)
    }
  }

  const handleGenerateJD = async () => {
    if (!resumeText.trim()) {
      setError('Please paste or upload your resume first.')
      return
    }
    setError('')
    setGenerating(true)
    try {
      const jd = await window.electronAPI?.generateMockJD(resumeText.trim())
      if (!jd) throw new Error('No job description returned')
      setGeneratedJD(jd)
      setEditableJD(jd)
    } catch (err: any) {
      setError(`Failed to generate job description: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleStart = () => {
    onCreateSession({
      sessionType: 'interview',
      company: '🎭 Mock Interview',
      jobUrl: '',
      jobDescription: editableJD,
      resumeText: resumeText.trim(),
      language: 'English',
      extraContext: 'This is a mock interview. Answer confidently and concisely.',
      autoGenerate: true,
      aiModel: 'claude-sonnet',
    })
  }

  return (
    <div className="setup-root mock-root">
      {/* Inner topbar — breadcrumb + window controls */}
      <div className="setup-inner-topbar">
        <div className="setup-inner-topbar-left">
          <button type="button" className="setup-breadcrumb-btn" onClick={onBack}>
            ← Back to Dashboard
          </button>
        </div>
        <div className="setup-inner-topbar-right">
          <div className="snap-btn-wrapper">
            <button type="button" className="setup-window-btn" title="Snap layout" onClick={() => setShowSnapGrid(!showSnapGrid)}>✥</button>
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
          <button type="button" className="setup-window-btn" title="Dock" onClick={onDock}>↙</button>
          <button type="button" className="setup-window-btn close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>✕</button>
        </div>
      </div>

      <div className="setup-body">
        {/* Header */}
        <div className="mock-header">
          <div className="mock-header-icon">🎭</div>
          <div>
            <div className="mock-header-title">Mock Interview</div>
            <div className="mock-header-sub">Practice with a real interviewer — AI coaches you in real time</div>
          </div>
        </div>

        {/* Step 1 — YouTube instruction */}
        <div className="mock-step-card">
          <div className="mock-step-num">1</div>
          <div className="mock-step-body">
            <div className="mock-step-title">Open the mock interviewer</div>
            <div className="mock-step-desc">
              Click the link below to open the YouTube video, then skip to <strong>1:30</strong> to start the interview.
            </div>
            <a
              className="mock-yt-link"
              href="https://www.youtube.com/watch?v=srw4r3htm4U"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault()
                window.electronAPI?.openExternal?.('https://www.youtube.com/watch?v=srw4r3htm4U')
              }}
            >
              <span className="mock-yt-icon">▶</span>
              <span>
                <span className="mock-yt-label">Mock Interview Video</span>
                <span className="mock-yt-url">youtube.com/watch?v=srw4r3htm4U</span>
              </span>
            </a>
            <div className="mock-yt-hint">⏩ Skip to <strong>1:30</strong> when the video opens</div>
          </div>
        </div>

        {/* Step 2 — Resume upload */}
        <div className="mock-step-card">
          <div className="mock-step-num">2</div>
          <div className="mock-step-body">
            <div className="mock-step-title">
              Upload your resume <span className="setup-jd-required">*</span>
            </div>
            <div className="mock-step-desc">
              The AI will generate a matching job description automatically — no JD needed.
            </div>

            {cvs.length > 0 && (
              <div className="cv-picker-row">
                <span className="cv-picker-label">Use saved CV:</span>
                <select
                  className="cv-picker-select"
                  title="Select a saved CV"
                  defaultValue=""
                  onChange={(e) => {
                    const cv = cvs.find(c => c.id === e.target.value)
                    if (cv) { setResumeText(cv.content); setResumeFileName(cv.name) }
                  }}
                >
                  <option value="">— pick a CV —</option>
                  {cvs.map(cv => <option key={cv.id} value={cv.id}>{cv.name}</option>)}
                </select>
              </div>
            )}

            <div className="setup-field">
              <div className="setup-field-row">
                <label className="setup-label">Resume</label>
                <button type="button" className="setup-upload-btn" onClick={() => fileInputRef.current?.click()}>
                  📎 {resumeFileName || 'Upload .txt / .pdf / .docx'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.text,.pdf,.doc,.docx"
                  title="Upload resume file"
                  aria-label="Upload resume file"
                  className="mock-file-input-hidden"
                  onChange={handleFileUpload}
                />
              </div>
              <textarea
                className="setup-textarea"
                placeholder="Or paste your resume text here…"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={6}
              />
            </div>

            {!generatedJD && (
              <button
                type="button"
                className="mock-gen-btn"
                onClick={handleGenerateJD}
                disabled={generating || !resumeText.trim()}
              >
                {generating ? (
                  <><span className="mock-spinner" /> Generating JD…</>
                ) : (
                  '✨ Generate Job Description'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Step 3 — Generated JD preview (shown after generation) */}
        {generatedJD && (
          <div className="mock-step-card">
            <div className="mock-step-num">3</div>
            <div className="mock-step-body">
              <div className="mock-step-title">Review generated job description</div>
              <div className="mock-step-desc">
                Edit if needed — this will be used to coach your answers in real time.
              </div>
              <textarea
                className="setup-textarea mock-jd-textarea"
                title="Generated job description"
                placeholder="Generated job description will appear here…"
                value={editableJD}
                onChange={(e) => setEditableJD(e.target.value)}
                rows={10}
              />
              <button
                type="button"
                className="mock-regen-btn"
                onClick={() => { setGeneratedJD(''); setEditableJD('') }}
                disabled={generating}
              >
                ↺ Regenerate
              </button>
            </div>
          </div>
        )}

        {error && <div className="mock-error">{error}</div>}
      </div>

      {/* Footer — always visible outside scrollable body */}
      <div className="mock-fixed-footer">
        <button type="button" className="setup-btn secondary" onClick={onBack} disabled={generating}>
          ← Back
        </button>
        {generatedJD && (
          <button
            type="button"
            className="setup-btn primary"
            onClick={handleStart}
            disabled={!editableJD.trim()}
          >
            Start Mock Interview →
          </button>
        )}
      </div>
    </div>
  )
}
