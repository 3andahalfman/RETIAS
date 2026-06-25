import type { CSSProperties } from 'react'
import { isAdminEmail } from '../lib/admin'
import WindowControls from './WindowControls'
import {
  IconLiveSession,
  IconSolvedBank,
  ONLINE_TEST_ACCENTS,
  OnlineTestIconBadge,
  OnlineTestPageHeader,
} from './OnlineTestIcons'

interface Props {
  user: User
  onSolved: () => void
  onNew: () => void
  onBack: () => void
  onDock: () => void
}

export default function OnlineTestEntry({ user, onSolved, onNew, onBack, onDock }: Props) {
  const canViewSolved = user.is_premium_plus || isAdminEmail(user.email)

  return (
    <div className="setup-root online-test-root online-test-entry-page">
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
        subtitle="Pick how you want to study or run a test."
      />

      <div className="online-test-body">
        <div className="online-test-entry-grid">
          <button
            type="button"
            className={`online-test-entry-card${!canViewSolved ? ' locked' : ''}`}
            style={{ '--ot-accent': ONLINE_TEST_ACCENTS.blue.color, '--ot-accent-border': ONLINE_TEST_ACCENTS.blue.border } as CSSProperties}
            disabled={!canViewSolved}
            onClick={() => canViewSolved && onSolved()}
            title={!canViewSolved ? 'Premium Plus — upgrade to unlock the Solved Assessment bank' : undefined}
          >
            {!canViewSolved && (
              <span className="online-test-entry-badge">Premium Plus</span>
            )}
            <div className="online-test-card-top">
              <OnlineTestIconBadge accent={ONLINE_TEST_ACCENTS.blue} large>
                <IconSolvedBank size={22} />
              </OnlineTestIconBadge>
              <span className="online-test-entry-label">Solved Assessment</span>
            </div>
            <p className="online-test-entry-desc">
              Browse curated questions and answers by platform and assessment type — already solved by our AI.
            </p>
          </button>

          <button
            type="button"
            className="online-test-entry-card"
            style={{ '--ot-accent': ONLINE_TEST_ACCENTS.amber.color, '--ot-accent-border': ONLINE_TEST_ACCENTS.amber.border } as CSSProperties}
            onClick={onNew}
          >
            <div className="online-test-card-top">
              <OnlineTestIconBadge accent={ONLINE_TEST_ACCENTS.amber} large>
                <IconLiveSession size={22} />
              </OnlineTestIconBadge>
              <span className="online-test-entry-label">Start New Online Assessment</span>
            </div>
            <p className="online-test-entry-desc">
              Run a live session where the AI analyses your test screenshots in real time and helps you answer.
            </p>
          </button>
        </div>
      </div>
    </div>
  )
}
