import { useState } from 'react'

interface SetupProps {
  onSessionStart: () => void
}

type Step = 1 | 2 | 3

export default function Setup({ onSessionStart }: SetupProps) {
  const [step, setStep] = useState<Step>(1)
  const [resume, setResume] = useState('')
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [interviewType, setInterviewType] = useState<'SWE' | 'PM' | 'DS'>('SWE')
  const [micDevice, setMicDevice] = useState('')

  const handleStart = () => {
    window.electronAPI?.startSession({
      resumeText: resume,
      targetRole: role,
      company,
      interviewType,
      micDeviceId: micDevice || undefined,
    })
    onSessionStart()
  }

  return (
    <div className="setup-root">
      <div className="setup-card">
        <div className="setup-logo">
          <img className="setup-logo-icon" src="/logo.png" alt="Logo" style={{ width: 48, height: 48, objectFit: 'contain', margin: '0 auto', display: 'block' }} />
          <h1 className="setup-title">Interview Assistant</h1>
          <p className="setup-subtitle">Real-time AI-powered interview help</p>
        </div>

        {/* Step indicator */}
        <div className="setup-steps">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className={`setup-step ${step === s ? 'active' : ''} ${step > s ? 'done' : ''}`}>
              {step > s ? '✓' : s}
            </div>
          ))}
        </div>

        {/* Step 1: Resume */}
        {step === 1 && (
          <div className="setup-section">
            <label className="setup-label">Paste your resume</label>
            <textarea
              className="setup-textarea"
              placeholder="Paste your resume text here… the AI will use it to personalize answers."
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              rows={10}
            />
            <button
              className="btn-primary"
              onClick={() => setStep(2)}
            >
              Next →
            </button>
          </div>
        )}

        {/* Step 2: Role + Company */}
        {step === 2 && (
          <div className="setup-section">
            <label className="setup-label">Target role</label>
            <input
              className="setup-input"
              placeholder="e.g. Senior Software Engineer"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />

            <label className="setup-label">Company</label>
            <input
              className="setup-input"
              placeholder="e.g. Google"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />

            <label className="setup-label">Interview type</label>
            <div className="setup-type-buttons">
              {(['SWE', 'PM', 'DS'] as const).map((t) => (
                <button
                  key={t}
                  className={`btn-type ${interviewType === t ? 'selected' : ''}`}
                  onClick={() => setInterviewType(t)}
                >
                  {t === 'SWE' ? '💻 SWE' : t === 'PM' ? '📋 PM' : '📊 DS'}
                </button>
              ))}
            </div>

            <div className="setup-nav">
              <button className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="btn-primary" onClick={() => setStep(3)}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 3: Audio + Ready */}
        {step === 3 && (
          <div className="setup-section">
            <label className="setup-label">Audio setup</label>
            <p className="setup-hint">
              Your microphone will capture your voice. On Windows, system audio
              (interviewer's voice) is captured via WASAPI loopback — no extra software needed.
            </p>

            <div className="setup-audio-check">
              <span className="setup-check-icon">✅</span>
              Microphone: default device
            </div>
            <div className="setup-audio-check">
              <span className="setup-check-icon">✅</span>
              System loopback: WASAPI (Windows)
            </div>

            <div className="setup-summary">
              <strong>{role || 'Role not set'}</strong> @ {company || 'Company not set'} · {interviewType}
            </div>

            <div className="setup-hotkeys">
              <p><kbd>Alt+H</kbd> Show/hide overlay</p>
              <p><kbd>Alt+R</kbd> Regenerate answer</p>
              <p><kbd>Alt+C</kbd> Copy answer</p>
            </div>

            <div className="setup-nav">
              <button className="btn-secondary" onClick={() => setStep(2)}>← Back</button>
              <button className="btn-primary btn-start" onClick={handleStart}>
                🚀 Start Session
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
