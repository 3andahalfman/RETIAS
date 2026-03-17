interface Props {
  onStart: (testType: string) => void
  onBack: () => void
  onDock: () => void
}

const TEST_TYPES = [
  {
    id: 'english',
    icon: '📝',
    label: 'English / Verbal',
    desc: 'Grammar, comprehension & verbal reasoning',
  },
  {
    id: 'coding',
    icon: '💻',
    label: 'Coding Assessment',
    desc: 'LeetCode, HackerRank & coding challenges',
  },
  {
    id: 'ai-ml',
    icon: '🤖',
    label: 'AI / ML Test',
    desc: 'Machine learning, data science & statistics',
  },
  {
    id: 'numerical',
    icon: '🔢',
    label: 'Numerical Reasoning',
    desc: 'Maths, aptitude & number series',
  },
  {
    id: 'technical',
    icon: '⚙️',
    label: 'Technical Assessment',
    desc: 'Domain-specific technical questions',
  },
  {
    id: 'onboarding',
    icon: '🏢',
    label: 'Onboarding / Compliance',
    desc: 'Company policy, H&S & e-learning modules',
  },
]

const ROLE_TYPES = [
  { id: 'role:Senior Software Engineer in Test',       icon: '🧪', label: 'Senior Software Engineer in Test',    desc: 'QA, automation & testing frameworks' },
  { id: 'role:Automotive Engineer with Python',        icon: '🚗', label: 'Automotive Engineer with Python',     desc: 'Embedded systems, CAN bus & automotive' },
  { id: 'role:Data Science (Python & SQL)',            icon: '📊', label: 'Data Science (Python & SQL)',         desc: 'Data wrangling, analysis & SQL queries' },
  { id: 'role:Electrical Engineer with Python',        icon: '⚡', label: 'Electrical Engineer with Python',    desc: 'Circuits, signals & Python automation' },
  { id: 'role:Energy Engineer with Python',            icon: '🔋', label: 'Energy Engineer with Python',        desc: 'Energy systems, modelling & simulation' },
  { id: 'role:English Writer',                         icon: '✍️', label: 'English Writer',                     desc: 'Writing, editing & content creation' },
  { id: 'role:Freelance Legal Consultant (US Law)',    icon: '⚖️', label: 'Freelance Legal Consultant (US Law)', desc: 'US law, contracts & legal advice' },
  { id: 'role:Legal Consultant (US Law)',              icon: '🏛️', label: 'Legal Consultant (US Law)',          desc: 'US legal research & compliance' },
  { id: 'role:Machine Learning Engineer (Python)',     icon: '🧠', label: 'Machine Learning Engineer (Python)',  desc: 'ML models, training & deployment' },
  { id: 'role:Mathematics Expert with Python',         icon: '📐', label: 'Mathematics Expert with Python',     desc: 'Maths, proofs & numerical computing' },
  { id: 'role:Mechanical Engineer with Python',        icon: '⚙️', label: 'Mechanical Engineer with Python',   desc: 'Mechanics, CAD & Python simulations' },
  { id: 'role:Physics Expert with Python',             icon: '🔬', label: 'Physics Expert with Python',        desc: 'Physics problems & scientific computing' },
  { id: 'role:Senior Consultant (McKinsey / BCG / Bain)', icon: '💼', label: 'Senior Consultant (McKinsey/BCG/Bain)', desc: 'Strategy, case studies & frameworks' },
  { id: 'role:Senior Python Engineer',                 icon: '🐍', label: 'Senior Python Engineer',            desc: 'Python architecture, APIs & best practices' },
  { id: 'role:Statistics Expert with Python',          icon: '📈', label: 'Statistics Expert with Python',     desc: 'Stats, probability & data analysis' },
  { id: 'role:Vibe Coding Web Scraping Expert',        icon: '🕸️', label: 'Vibe Coding Web Scraping Expert',  desc: 'Web scraping, automation & crawling' },
]

export default function OnlineTestSetup({ onStart, onBack, onDock }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="setup-root online-test-root">
      {/* Topbar */}
      <div className="setup-topbar">
        <div className="setup-topbar-left">
          <img src="./logo.svg" alt="RETIAS" className="setup-logo" />
          <span className="setup-brand-name">RETIAS</span>
        </div>
        <div className="setup-topbar-right">
          <button type="button" className="setup-window-btn" title="Dock" onClick={onDock}>↙</button>
          <button type="button" className="setup-window-btn close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>✕</button>
        </div>
      </div>

      {/* Header */}
      <div className="online-test-header">
        <div className="online-test-title">🧪 Online Test & Onboarding</div>
        <div className="online-test-subtitle">
          Select the type of assessment you're taking. The AI will analyse your screen and provide targeted answers.
        </div>
      </div>

      <div className="online-test-body">
        {/* Assessment types */}
        <div className="online-test-section-label">Assessment Types</div>
        <div className="online-test-grid">
          {TEST_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`online-test-card${selected === t.id ? ' selected' : ''}`}
              onClick={() => setSelected(t.id)}
            >
              <span className="online-test-card-icon">{t.icon}</span>
              <span className="online-test-card-label">{t.label}</span>
              <span className="online-test-card-desc">{t.desc}</span>
            </button>
          ))}
        </div>

        {/* Role-based types */}
        <div className="online-test-section-label">Role-Based Expert</div>
        <div className="online-test-grid">
          {ROLE_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`online-test-card${selected === t.id ? ' selected' : ''}`}
              onClick={() => setSelected(t.id)}
            >
              <span className="online-test-card-icon">{t.icon}</span>
              <span className="online-test-card-label">{t.label}</span>
              <span className="online-test-card-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="setup-footer">
        <button type="button" className="setup-btn secondary" onClick={onBack}>
          ← Back
        </button>
        <button
          type="button"
          className="setup-btn primary"
          disabled={!selected}
          onClick={() => selected && onStart(selected)}
        >
          Start Assessment →
        </button>
      </div>
    </div>
  )
}

// React import needed for JSX
import { useState } from 'react'
