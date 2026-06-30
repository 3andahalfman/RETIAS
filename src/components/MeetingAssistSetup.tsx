import { useState } from 'react'
import type { SessionConfig } from './SetupWizard'
import { loadSettings } from './Settings'
import WindowControls from './WindowControls'

interface Props {
  onCreateSession: (config: SessionConfig) => void
  onBack: () => void
  onDock: () => void
}

const ROLE_PRESETS = [
  'Senior Software Engineer',
  'Software Engineer',
  'Engineering Manager',
  'Product Manager',
  'Data Scientist',
  'Designer',
  'Team Lead',
]

const MEETING_TYPES = [
  { id: 'standup' as const, label: 'Standup', desc: 'Daily sync — status updates, blockers, and quick prompts' },
  { id: 'general' as const, label: 'General meeting', desc: 'Team discussions, planning, and ad-hoc questions' },
]

export default function MeetingAssistSetup({ onCreateSession, onBack, onDock }: Props) {
  const [meetingType, setMeetingType] = useState<'standup' | 'general'>('standup')
  const [role, setRole] = useState('')
  const [teamContext, setTeamContext] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const handleStart = () => {
    const trimmedRole = role.trim()
    if (!trimmedRole) {
      setError('Please enter your role (e.g. Senior Software Engineer).')
      return
    }
    setError('')

    const contextParts = [teamContext.trim(), notes.trim()].filter(Boolean)
    const meetingContext = contextParts.join('\n\n')

    onCreateSession({
      sessionType: 'meeting',
      sessionMode: 'meeting',
      meetingType,
      meetingRole: trimmedRole,
      meetingContext,
      company: 'Meeting Assist',
      targetRole: trimmedRole,
      jobUrl: '',
      jobDescription: '',
      resumeText: '',
      language: 'English',
      extraContext: meetingContext,
      autoGenerate: false,
      aiModel: loadSettings().aiModel || 'claude-sonnet-4-6',
    })
  }

  return (
    <div className="setup-root mock-root">
      <div className="setup-inner-topbar">
        <div className="setup-inner-topbar-left">
          <button type="button" className="setup-breadcrumb-btn" onClick={onBack}>
            ← Back to Dashboard
          </button>
        </div>
        <div className="setup-inner-topbar-right">
          <WindowControls onDock={onDock} />
        </div>
      </div>

      <div className="setup-body">
        <div className="mock-header">
          <div className="mock-header-icon">🎧</div>
          <div>
            <div className="mock-header-title">Meeting Assist</div>
            <div className="mock-header-sub">
              AI listens to your meeting audio and suggests talking points when you&apos;re prompted
            </div>
          </div>
        </div>

        <div className="setup-field">
          <label className="setup-label">Meeting type</label>
          <div className="online-test-grid" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 560 }}>
            {MEETING_TYPES.map(({ id, label, desc }) => (
              <button
                key={id}
                type="button"
                className={`online-test-card${meetingType === id ? ' selected' : ''}`}
                style={{
                  '--ot-accent': '#6366f1',
                  '--ot-accent-bg': 'rgba(99,102,241,0.12)',
                  '--ot-accent-border': 'rgba(99,102,241,0.35)',
                } as React.CSSProperties}
                onClick={() => setMeetingType(id)}
              >
                <div className="online-test-card-top">
                  <span className="online-test-card-label">{label}</span>
                </div>
                <span className="online-test-card-desc">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setup-field">
          <label className="setup-label">
            Your role <span className="setup-jd-required">*</span>
          </label>
          <input
            className="setup-input"
            type="text"
            placeholder="e.g. Senior Software Engineer"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            list="meeting-role-presets"
          />
          <datalist id="meeting-role-presets">
            {ROLE_PRESETS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        <div className="setup-field">
          <label className="setup-label">Team / project context (optional)</label>
          <textarea
            className="setup-textarea"
            placeholder="Team name, sprint goal, project you're working on…"
            value={teamContext}
            onChange={(e) => setTeamContext(e.target.value)}
            rows={3}
          />
        </div>

        <div className="setup-field">
          <label className="setup-label">Notes (optional)</label>
          <textarea
            className="setup-textarea"
            placeholder="Anything the AI should know — recent work, blockers, topics you expect…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {error && <div className="mock-error">{error}</div>}
      </div>

      <div className="setup-footer">
        <button
          type="button"
          className="setup-btn primary"
          onClick={handleStart}
          disabled={!role.trim()}
        >
          Start Meeting Assist →
        </button>
      </div>
    </div>
  )

}
