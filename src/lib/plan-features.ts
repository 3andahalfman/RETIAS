/** Keep in sync with RETIAS-Web/lib/plan-features.ts */

export const PLAN_PRICES = {
  free: { amount: '$0', period: 'Forever free' },
  premium: { amount: '$10', period: '/ month' },
  premiumPlus: { amount: '$25', period: '/ month' },
} as const

export const PLAN_FEATURES = {
  free: [
    '10-minute Real Interview sessions',
    'Real-time transcription',
    'Context-aware answers',
    'Mock Interview mode',
    'Stealth mode overlay',
    'CV-aware answers (3 CVs)',
    'Session history & web dashboard',
  ],
  premium: [
    'Everything in Free',
    'Unlimited Real & Mock sessions',
    'Screenshot capture & Analyse All',
    'Online Assessment & Onboarding',
    'Manual prompt bar',
    'Choose your AI model (Sonnet)',
    'Priority email support',
  ],
  premiumPlus: [
    'Everything in Premium',
    'Solved Assessment library',
    'Auto-Typer',
    'Paraphrase & Humanize answers',
    'Claude Opus 4.5 model',
    'Early access to new features',
    'Dedicated support channel',
  ],
} as const

export const PRICING_URL = 'https://retiasai.com/pricing'

export const PRICING_FOOTNOTE =
  'Prices shown in USD · Charged in NGN at checkout via Paystack · Cancel anytime'
