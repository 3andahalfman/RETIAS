import { useState } from 'react'
import { createPortal } from 'react-dom'

const STEPS = [
  {
    emoji: '✨',
    title: 'Welcome to RETIAS',
    desc: 'RETIAS is your real-time AI coaching assistant for job interviews. It listens to conversations live and surfaces tailored answers — so you can focus on the conversation, not the recall.',
  },
  {
    emoji: '📄',
    title: 'Upload Your CV',
    desc: 'Head to the My CVs section on the dashboard and click + to upload your resume. You can store multiple CVs and reuse them across sessions. PDF, DOCX, and TXT files are all supported.',
  },
  {
    emoji: '🚀',
    title: 'Start a Session',
    desc: 'Click New Session, paste the job description (or drop in a URL to auto-fill), then select a CV. On step 2 you can pick your AI model, response language, and auto-generate mode.',
  },
  {
    emoji: '🤖',
    title: 'Real-Time AI Help',
    desc: 'Once the session is running, RETIAS listens and streams contextual answers as the interviewer speaks. Press Alt+H to hide the window instantly. Press Alt+R to regenerate the last answer.',
  },
  {
    emoji: '🎭',
    title: 'Mock Interviews',
    desc: 'Use Mock Interview to practice solo. RETIAS acts as the interviewer, drawing questions from your CV and the job description — no video call needed.',
  },
  {
    emoji: '🗂',
    title: 'Review Past Sessions',
    desc: 'After every interview, visit Past Sessions to read Q&A pairs, full transcripts, and session metadata. Use it to spot patterns and prepare for follow-ups.',
  },
]

interface Props {
  onDone: () => void
}

export default function Tutorial({ onDone }: Props) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  const dismiss = () => {
    localStorage.setItem('retias_tutorial_seen', '1')
    onDone()
  }

  return createPortal(
    <div className="tutorial-overlay" role="dialog" aria-modal="true" onClick={dismiss}>
      <div className="tutorial-card" onClick={e => e.stopPropagation()}>
        <button type="button" className="tutorial-skip" onClick={dismiss}>Skip</button>
        <div className="tutorial-emoji" aria-hidden="true">{current.emoji}</div>
        <h2 className="tutorial-title">{current.title}</h2>
        <p className="tutorial-desc">{current.desc}</p>
        <div className="tutorial-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`tutorial-dot${i === step ? ' active' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>
        <div className="tutorial-footer">
          <button
            type="button"
            className="tutorial-btn secondary"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
          >
            Back
          </button>
          <button
            type="button"
            className="tutorial-btn primary"
            onClick={isLast ? dismiss : () => setStep(s => s + 1)}
          >
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
