import { PLAN_FEATURES, PLAN_PRICES, PRICING_FOOTNOTE, PRICING_URL } from '../lib/plan-features'

interface Props {
  onBack: () => void
  onDock?: () => void
}

const TIERS = [
  {
    key: 'free',
    label: 'Free',
    price: PLAN_PRICES.free.amount,
    period: PLAN_PRICES.free.period,
    features: PLAN_FEATURES.free,
    accent: 'free' as const,
    popular: false,
  },
  {
    key: 'premium',
    label: 'Premium',
    price: PLAN_PRICES.premium.amount,
    period: PLAN_PRICES.premium.period,
    features: PLAN_FEATURES.premium,
    accent: 'premium' as const,
    popular: true,
  },
  {
    key: 'premiumPlus',
    label: 'Premium Plus',
    price: PLAN_PRICES.premiumPlus.amount,
    period: PLAN_PRICES.premiumPlus.period,
    features: PLAN_FEATURES.premiumPlus,
    accent: 'plus' as const,
    popular: false,
  },
] as const

export default function PricingPage({ onBack, onDock }: Props) {
  const openWebPricing = () => window.electronAPI?.openExternal?.(PRICING_URL)

  return (
    <div className="pricing-root">
      <div className="pricing-topbar">
        <button type="button" className="pricing-back" onClick={onBack}>← Back</button>
        {onDock && (
          <button type="button" className="pricing-dock" onClick={onDock} title="Dock">⤡</button>
        )}
      </div>

      <div className="pricing-scroll">
        <div className="pricing-header">
          <h1 className="pricing-heading">Simple pricing</h1>
          <p className="pricing-lead">
            Start free with Real Interview, Mock Interview, stealth mode, and context-aware answers.
            Upgrade for screenshot analysis and Online Assessment. Premium Plus adds the Solved Q&A library, Auto-Typer, and paraphrase tools.
          </p>
        </div>

        <div className="pricing-grid">
          {TIERS.map((tier) => (
            <div key={tier.key} className={`pricing-tier pricing-tier--${tier.accent}`}>
              {tier.popular && <span className="pricing-popular">POPULAR</span>}
              <p className="pricing-tier-label">{tier.label}</p>
              <div className="pricing-tier-price">
                <span className="pricing-tier-amount">{tier.price}</span>
                <span className="pricing-tier-period">{tier.period}</span>
              </div>
              <ul className="pricing-features">
                {tier.features.map((f) => (
                  <li key={f} className="pricing-feature">
                    <span className={`pricing-check pricing-check--${tier.accent}`}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {tier.key === 'free' ? (
                <div className="pricing-tier-cta pricing-tier-cta--muted">Current plan</div>
              ) : (
                <button type="button" className="pricing-subscribe" onClick={openWebPricing}>
                  Subscribe on the web
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="pricing-footnote">{PRICING_FOOTNOTE}</p>
        <p className="pricing-note">
          Payment is handled securely on retiasai.com. After you subscribe, return to the app and your premium features unlock automatically.
        </p>
      </div>
    </div>
  )
}
