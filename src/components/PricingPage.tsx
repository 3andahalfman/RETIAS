interface Props {
  onBack: () => void
  onDock?: () => void
}

// Where the actual Paystack checkout lives (handled on the website).
const UPGRADE_URL = 'https://retiasai.com/pricing'

const FEATURES = [
  'Unlimited interview & test sessions',
  'Screen analysis on online tests',
  'Manual AI prompts during sessions',
  'Priority support',
]

export default function PricingPage({ onBack, onDock }: Props) {
  return (
    <div className="pricing-root">
      <div className="pricing-topbar">
        <button type="button" className="pricing-back" onClick={onBack}>← Back</button>
        {onDock && (
          <button type="button" className="pricing-dock" onClick={onDock} title="Dock">⤡</button>
        )}
      </div>

      <div className="pricing-center">
        <div className="pricing-card">
          <div className="pricing-badge">PREMIUM</div>
          <h1 className="pricing-title">Upgrade to Premium</h1>
          <p className="pricing-subtitle">Unlock everything RETIAS has to offer.</p>

          <div className="pricing-price">
            <span className="pricing-amount">₦10,000</span>
            <span className="pricing-period">/ month</span>
          </div>

          <ul className="pricing-features">
            {FEATURES.map((f) => (
              <li key={f} className="pricing-feature">
                <span className="pricing-check">✓</span>
                {f}
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="pricing-subscribe"
            onClick={() => window.electronAPI?.openExternal?.(UPGRADE_URL)}
          >
            Subscribe on the web
          </button>
          <p className="pricing-note">
            Payment is securely handled on retias-ai.com. Once you subscribe,
            return to the app and your premium features unlock automatically.
          </p>
        </div>
      </div>
    </div>
  )
}
