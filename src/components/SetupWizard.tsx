import { useState, useRef } from 'react'

const ROLE_PRESETS = [
  'Senior Software Engineer in Test',
  'Automotive Engineer with Python',
  'Data Science (Python & SQL)',
  'Electrical Engineer with Python',
  'Energy Engineer with Python',
  'English Writer',
  'Freelance Legal Consultant (US Law)',
  'Legal Consultant (US Law)',
  'Machine Learning Engineer (Python)',
  'Mathematics Expert with Python',
  'Mechanical Engineer with Python',
  'Physics Expert with Python',
  'Senior Consultant (McKinsey / BCG / Bain)',
  'Senior Python Engineer',
  'Statistics Expert with Python',
  'Vibe Coding Web Scraping Expert',
]

const DEFAULT_EXTRA_CONTEXT = `Do not use generic AI buzzwords or filler phrases. Avoid words like: innovative, cutting-edge, robust, scalable, seamless, dynamic, synergy, transformative, optimized, disruptive, agile, empowering, streamlined, next-generation, impactful. Avoid phrases like: leveraging technology, driving innovation, delivering value, data-driven insights, future-ready, mission-critical, customer-centric, scalable architecture, proven track record, results-oriented, passionate professional, strong team player, go-getter attitude. Use plain, specific, direct language instead.`

interface SetupProps {
  onCreateSession: (config: SessionConfig) => void
  onDock: () => void
  onBack?: () => void
  cvs?: CV[]
}

export interface SessionConfig {
  sessionType: 'interview'
  company: string
  jobUrl: string
  jobDescription: string
  resumeText: string
  language: string
  extraContext: string
  autoGenerate: boolean
  aiModel: string
  targetRole?: string
  interviewType?: 'SWE' | 'PM' | 'DS'
}

function ValidationModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="validation-overlay">
      <div className="validation-modal">
        <p>{message}</p>
        <div className="validation-modal-footer">
          <button type="button" className="validation-ok-btn" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  )
}

export default function SetupWizard({ onCreateSession, onDock, onBack, cvs = [] }: SetupProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [validationMsg, setValidationMsg] = useState('')
  const [scraping, setScraping] = useState(false)

  // Step 1 fields
  const [company, setCompany] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [jobUrl, setJobUrl] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [resumeFileName, setResumeFileName] = useState('')

  // Step 2 fields
  const [language, setLanguage] = useState('English')
  const [simpleLanguage, setSimpleLanguage] = useState(false)
  const [extraContext, setExtraContext] = useState(DEFAULT_EXTRA_CONTEXT)
  const [aiModel, setAiModel] = useState('claude-sonnet')
  const [autoGenerate, setAutoGenerate] = useState(true)

  const [showSnapGrid, setShowSnapGrid] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)


  const handleCreate = () => {
    // Fire-and-forget: pre-warm the context extraction cache so first answer is fast
    window.electronAPI?.prefetchContext({ resumeText, jobDescription, company, extraContext })
    const finalLanguage = simpleLanguage ? `${language} (Simple, easy to understand)` : language
    onCreateSession({
      sessionType: 'interview',
      company,
      jobUrl,
      jobDescription,
      resumeText,
      language: finalLanguage,
      extraContext,
      autoGenerate,
      aiModel,
      targetRole: targetRole || jobDescription || 'Software Engineer',
      interviewType: 'SWE',
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setResumeFileName(file.name)
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext === 'pdf' || ext === 'docx' || ext === 'doc') {
      // Binary formats need server-side extraction
      const buffer = await file.arrayBuffer()
      const text = (await window.electronAPI?.extractResumeText(buffer, file.name)) ?? ''
      if (!text || text.startsWith('ERROR:')) {
        setValidationMsg(`Could not extract text from ${file.name}. Try pasting the text manually.`)
        setResumeFileName('')
      } else {
        setResumeText(text)
      }
    } else {
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result
        if (typeof text === 'string') setResumeText(text)
      }
      reader.readAsText(file)
    }
  }

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    setResumeFileName('')
    setResumeText('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleScrape = async () => {
    if (!jobUrl.trim()) {
      setValidationMsg('Please enter a job post URL first.')
      return
    }
    setScraping(true)
    try {
      const result = await window.electronAPI?.scrapeJobUrl(jobUrl)
      if (result?.success) {
        if (result.jobDescription) setJobDescription(result.jobDescription)
        if (result.company && !company) setCompany(result.company)
        if (result.targetRole && !targetRole) setTargetRole(result.targetRole)
      } else {
        setValidationMsg(`Could not scrape URL: ${result?.error ?? 'Unknown error'}`)
      }
    } catch {
      setValidationMsg('Failed to scrape the URL. Make sure it is a valid public page.')
    } finally {
      setScraping(false)
    }
  }

  return (
    <>
      {validationMsg && <ValidationModal message={validationMsg} onClose={() => setValidationMsg('')} />}
      <div className="setup-root" ref={rootRef}>

        {/* Topbar */}
        <div className="setup-topbar">
          <div className="setup-topbar-left">
            <img src="./logo.svg" alt="RETIAS" className="setup-logo" />
            <span className="setup-brand-name">RETIAS</span>
          </div>
          <div className="setup-topbar-center" />
          <div className="setup-topbar-right">
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

        {/* New Session form */}
        {(
          <div className="setup-body">

            {/* ── Step 1 ── */}
            {step === 1 && (
              <>
                <div className="setup-type-row">
                  <button type="button" className="setup-type-btn active">🏢 Interview</button>
                </div>

                {/* Job URL */}
                <div className="setup-field">
                  <label className="setup-label" htmlFor="job-url">
                    Job Post URL <span className="setup-label-sub">(Optional — click Scrape to auto-fill)</span>
                  </label>
                  <div className="setup-url-row">
                    <input
                      id="job-url"
                      className="setup-input"
                      placeholder="https://company.com/jobs/123"
                      value={jobUrl}
                      onChange={(e) => setJobUrl(e.target.value)}
                    />
                    <button type="button" className="scrape-btn" onClick={handleScrape} disabled={scraping}>
                      {scraping ? '⏳ Scraping...' : '⬇ Scrape & Fill'}
                    </button>
                  </div>
                </div>

                <div className="setup-divider">or input manually</div>

                {/* Company */}
                <div className="setup-field">
                  <label className="setup-label" htmlFor="company">🏢 Company</label>
                  <input id="company" className="setup-input" placeholder="Microsoft..." value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>

                {/* Target Role */}
                <div className="setup-field">
                  <label className="setup-label" htmlFor="target-role">🎯 Target Role <span className="setup-label-sub">(Optional — type or pick a preset)</span></label>
                  <input
                    id="target-role"
                    className="setup-input"
                    list="role-presets"
                    placeholder="e.g. Senior Python Engineer"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                  />
                  <datalist id="role-presets">
                    {ROLE_PRESETS.map((r) => <option key={r} value={r} />)}
                  </datalist>
                </div>

                {/* Job Description */}
                <div className="setup-field">
                  <label className="setup-label" htmlFor="job-desc">
                    📋 Job Description <span className="setup-jd-required">*</span>
                  </label>
                  <textarea
                    id="job-desc"
                    className="setup-textarea"
                    placeholder="Software Engineer versed in Python, SQL, and AWS..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Resume */}
                <div className="setup-field">
                  <label className="setup-label" htmlFor="resume-text">
                    📎 Resume <span className="setup-jd-required">*</span>
                  </label>
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
                  {!resumeFileName && (
                    <textarea
                      id="resume-text"
                      className="setup-textarea setup-textarea-resume"
                      placeholder="Paste your resume text here..."
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                      rows={2}
                    />
                  )}
                  <div className="setup-file-select-wrapper">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="setup-file-input-hidden"
                      accept=".txt,.md,.pdf,.docx"
                      title="Upload resume file"
                      onChange={handleFileUpload}
                    />
                    <div className="setup-file-select" onClick={() => fileInputRef.current?.click()}>
                      <span>{resumeFileName || 'Or Choose File...'}</span>
                      <span>⌄</span>
                    </div>
                    {resumeFileName && <button type="button" className="clear-file-btn" onClick={clearFile}>✕</button>}
                  </div>
                </div>

                <div className="setup-footer">
                  {onBack && (
                    <button type="button" className="setup-btn secondary" onClick={onBack}>Back to Dashboard</button>
                  )}
                  <button type="button" className="setup-btn primary" onClick={() => {
                    if (!jobDescription.trim()) { setValidationMsg('Please provide a Job Description to proceed.'); return }
                    if (!resumeText.trim()) { setValidationMsg('Please provide a Resume to proceed.'); return }
                    // Pre-warm context extraction so first answer is fast
                    window.electronAPI?.prefetchContext({ resumeText, jobDescription, company, extraContext })
                    setStep(2)
                  }}>Next →</button>
                </div>
              </>
            )}

            {/* ── Step 2 ── */}
            {step === 2 && (
              <>
                {/* Language */}
                <div className="setup-lang-row">
                  <div className="setup-field setup-lang-field">
                    <label className="setup-label" htmlFor="language">🌐 Language</label>
                    <select
                      id="language"
                      className="setup-select"
                      title="Response language"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="English">English</option>
                      <option value="Spanish">Spanish</option>
                      <option value="French">French</option>
                    </select>
                  </div>
                  <div className="setup-field setup-field-col">
                    <label className="setup-label" htmlFor="simple-lang">Simple Language</label>
                    <div className="setup-toggle-row">
                      <label className="toggle">
                        <input
                          id="simple-lang"
                          type="checkbox"
                          title="Use simple, easy-to-understand language"
                          checked={simpleLanguage}
                          onChange={(e) => setSimpleLanguage(e.target.checked)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  </div>
                </div>

                {/* AI Model */}
                <div className="setup-field">
                  <label className="setup-label" htmlFor="ai-model">🤖 AI Model</label>
                  <div className="ai-model-select">
                    <span className="setup-ai-icon">⚛️</span>
                    <span className="setup-ai-name">
                      {aiModel === 'claude-sonnet' && 'Claude Sonnet 4.6'}
                      {aiModel === 'claude-haiku' && 'Claude Haiku 4.5'}
                    </span>
                    {aiModel === 'claude-sonnet' && <span className="ai-badge">Recommended</span>}
                    {aiModel === 'claude-haiku' && <span className="ai-speed">Fast</span>}
                    <span className="setup-ai-chevron">⌄</span>
                    <select
                      id="ai-model"
                      title="Select AI model"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                    >
                      <option value="claude-sonnet">Claude Sonnet 4.6</option>
                      <option value="claude-haiku">Claude Haiku 4.5</option>
                    </select>
                  </div>
                </div>

                {/* Extra Context */}
                <div className="setup-field">
                  <label className="setup-label" htmlFor="extra-context">📝 Extra Context/Instructions</label>
                  <textarea
                    id="extra-context"
                    className="setup-textarea"
                    placeholder="Be more technical, focus on leadership examples..."
                    value={extraContext}
                    onChange={(e) => setExtraContext(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="setup-divider setup-divider-spaced" />

                {/* Auto Generate */}
                <div className="setup-field">
                  <div className="setup-toggle-row setup-auto-row">
                    <span className="setup-auto-label">Auto Generate AI Response</span>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        title="Automatically generate AI answers when a question is detected"
                        checked={autoGenerate}
                        onChange={(e) => setAutoGenerate(e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                    <span className="badge-new">New</span>
                  </div>
                  <p className="setup-auto-hint">
                    When enabled, the AI automatically detects questions and generates answers in real time.
                  </p>
                </div>

                <div className="setup-footer setup-footer-step2">
                  <button type="button" className="setup-btn secondary" onClick={() => setStep(1)}>Back</button>
                  <button type="button" className="setup-btn primary" onClick={handleCreate}>Start Session →</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
