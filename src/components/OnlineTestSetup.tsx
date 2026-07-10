import { useState, type ComponentType, type CSSProperties } from 'react'
import WindowControls from './WindowControls'
import {
  IconCoding,
  IconGeneral,
  IconNumerical,
  IconOnboarding,
  IconTechnical,
  IconVerbal,
  ONLINE_TEST_ACCENTS,
  OnlineTestIconBadge,
  OnlineTestPageHeader,
  type OnlineTestAccent,
} from './OnlineTestIcons'

import ProjectInstructionsFields from './ProjectInstructionsFields'
import { PROJECT_ONBOARDING_TYPE } from '../lib/project-onboarding'

interface Props {
  onStart: (testType: string, extraContext?: string) => void
  onBack: () => void
  onDock: () => void
}

const TEST_TYPES: {
  id: string
  label: string
  desc: string
  accent: OnlineTestAccent
  Icon: ComponentType<{ size?: number }>
}[] = [
  {
    id: 'english',
    label: 'English / Verbal',
    desc: 'Grammar, comprehension & verbal reasoning',
    accent: ONLINE_TEST_ACCENTS.blue,
    Icon: IconVerbal,
  },
  {
    id: 'coding',
    label: 'Coding Assessment',
    desc: 'LeetCode, HackerRank & coding challenges',
    accent: ONLINE_TEST_ACCENTS.teal,
    Icon: IconCoding,
  },
  {
    id: 'numerical',
    label: 'Numerical Reasoning',
    desc: 'Maths, aptitude & number series',
    accent: ONLINE_TEST_ACCENTS.amber,
    Icon: IconNumerical,
  },
  {
    id: 'technical',
    label: 'Technical Assessment',
    desc: 'Domain-specific technical questions',
    accent: ONLINE_TEST_ACCENTS.slate,
    Icon: IconTechnical,
  },
  {
    id: 'onboarding',
    label: 'Project Onboarding',
    desc: 'Company onboarding, training modules & role-specific policy',
    accent: ONLINE_TEST_ACCENTS.violet,
    Icon: IconOnboarding,
  },
  {
    id: 'general',
    label: 'General',
    desc: 'Not sure which type? Works for any mixed or uncategorised test',
    accent: ONLINE_TEST_ACCENTS.emerald,
    Icon: IconGeneral,
  },
]

export default function OnlineTestSetup({ onStart, onBack, onDock }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [instructions, setInstructions] = useState('')

  const handleSelect = (id: string) => {
    setSelected(id)
    if (id !== PROJECT_ONBOARDING_TYPE) setInstructions('')
  }

  return (
    <div className="setup-root online-test-root">
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

      <OnlineTestPageHeader
        title="Online Assessment & Onboarding"
        subtitle="Select the type of assessment you're taking. The AI will analyse your screen and provide targeted answers."
      />

      <div className="online-test-body">
        <div className="online-test-section-label">Assessment Types</div>
        <div className="online-test-grid">
          {TEST_TYPES.map(({ id, label, desc, accent, Icon }) => (
            <button
              key={id}
              type="button"
              className={`online-test-card${selected === id ? ' selected' : ''}`}
              style={{ '--ot-accent': accent.color, '--ot-accent-bg': accent.bg, '--ot-accent-border': accent.border } as CSSProperties}
              onClick={() => handleSelect(id)}
            >
              <div className="online-test-card-top">
                <OnlineTestIconBadge accent={accent}>
                  <Icon size={18} />
                </OnlineTestIconBadge>
                <span className="online-test-card-label">{label}</span>
              </div>
              <span className="online-test-card-desc">{desc}</span>
            </button>
          ))}
        </div>

        {selected === PROJECT_ONBOARDING_TYPE && (
          <div className="online-test-instructions-section">
            <ProjectInstructionsFields value={instructions} onChange={setInstructions} />
          </div>
        )}
      </div>

      <div className="setup-footer">
        <button
          type="button"
          className="setup-btn primary"
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            const extra = selected === PROJECT_ONBOARDING_TYPE ? instructions.trim() : undefined
            onStart(selected, extra || undefined)
          }}
        >
          Start Assessment →
        </button>
      </div>
    </div>
  )
}
