import { useState, useEffect } from 'react'
import WindowControls from './WindowControls'

interface Props {
  onLogin: (user: User) => void
  isDocked: boolean
  onDock: () => void
  onUndock: () => void
}

const SIGNUP_URL = 'https://www.retiasai.com/signup'

const LOGIN_FEATURES = [
  {
    icon: '🎙',
    style: { background: 'rgba(21,205,202,0.15)', borderColor: 'rgba(21,205,202,0.3)' },
    label: 'Live interview coaching',
    desc: 'Real-time transcription and AI answers tailored to your CV and job description.',
  },
  {
    icon: '▶',
    style: { background: 'rgba(79,128,226,0.15)', borderColor: 'rgba(79,128,226,0.3)' },
    label: 'Mock interview practice',
    desc: 'Run practice sessions against YouTube mock interviews with live AI coaching.',
  },
  {
    icon: '🧪',
    style: { background: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.3)' },
    label: 'Online assessment assist',
    desc: 'Capture your screen and get targeted help for coding, aptitude, and onboarding tests.',
  },
  {
    icon: '📚',
    style: { background: 'rgba(167,139,250,0.15)', borderColor: 'rgba(167,139,250,0.35)' },
    label: 'Solved Q&A library',
    desc: 'Browse curated, humanized answers from past assessments — study or go live.',
  },
  {
    icon: '⌨',
    style: { background: 'rgba(74,222,128,0.12)', borderColor: 'rgba(74,222,128,0.28)' },
    label: 'Auto-Typer',
    desc: 'Premium Plus — type any answer into a field at a natural human pace.',
  },
  {
    icon: '🛡',
    style: { background: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.3)' },
    label: 'Stealth overlay',
    desc: 'Invisible to screen sharing — dock to a corner and expand when you need it.',
  },
] as const

export default function LoginPage({ onLogin, isDocked, onDock, onUndock }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleAvailable, setGoogleAvailable] = useState(false)
  const [deviceOwnerEmail, setDeviceOwnerEmail] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI?.authGoogleAvailable?.().then(setGoogleAvailable).catch(() => {})
    window.electronAPI?.authDeviceOwner?.().then((email) => setDeviceOwnerEmail(email)).catch(() => {})
  }, [])

  const friendlyAuthError = (err: any): string => {
    const msg: string = (err?.message ?? '').toLowerCase()
    if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('email not confirmed') || msg.includes('wrong password'))
      return 'Wrong email or password. Please try again.'
    if (msg.includes('user already registered') || msg.includes('already exists'))
      return 'An account with this email already exists. Try signing in.'
    if (msg.includes('email') && msg.includes('not found'))
      return 'No account found with this email.'
    if (msg.includes('rate limit') || msg.includes('too many'))
      return 'Too many attempts. Please wait a moment and try again.'
    if (msg.includes('network') || msg.includes('fetch'))
      return 'Network error. Please check your connection.'
    if (msg.includes('already registered to another') || msg.includes('device_bound'))
      return 'This computer is registered to another account. Sign in with that account or use a different device.'
    if (msg.includes('device_cooldown') || msg.includes('wait one hour'))
      return 'This device was recently signed out. Please wait one hour before signing in with a different account.'
    return err?.message ?? 'Something went wrong. Please try again.'
  }

  const handleSignIn = async () => {
    if (!email.trim()) { setError('Please enter your email.'); return }
    if (!password) { setError('Please enter your password.'); return }
    setLoading(true)
    setError('')
    try {
      const user = await window.electronAPI!.authLogin(email.trim(), password)
      onLogin(user)
    } catch (err: any) {
      setError(friendlyAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setLoading(true)
    setError('')
    try {
      const user = await window.electronAPI!.authGoogle()
      onLogin(user)
    } catch (err: any) {
      setError(friendlyAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  const openSignup = () => {
    window.electronAPI?.openExternal?.(SIGNUP_URL)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSignIn()
  }

  if (isDocked) {
    return (
      <div className="app-root docked">
        <div
          className="docked-content"
          onClick={onUndock}
          onMouseEnter={() => window.electronAPI?.setIgnoreMouseEvents(false)}
          onMouseLeave={() => window.electronAPI?.setIgnoreMouseEvents(true)}
          title="Click to expand"
        >
          <img className="docked-logo" src="./logo.svg" alt="Logo" />
        </div>
      </div>
    )
  }

  return (
    <div className="login-root">
      <div className="login-hero-panel">
        <div className="login-hero-brand">
          <img src="./logo.svg" className="login-hero-logo" alt="RETIAS" />
          <span className="login-hero-brand-name">RETIAS</span>
        </div>
        <div className="login-hero-content">
          <h1 className="login-hero-title">Your AI copilot for interviews and online assessments</h1>
          <p className="login-hero-subtitle">
            RETIAS coaches you through live interviews, analyses assessment screens in real time,
            and gives you curated answers when you need them — all from a discreet desktop overlay.
          </p>
          <div className="login-features">
            {LOGIN_FEATURES.map((f) => (
              <div key={f.label} className="login-feature-row">
                <div className="login-feature-icon" style={f.style}>{f.icon}</div>
                <div>
                  <div className="login-feature-label">{f.label}</div>
                  <div className="login-feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-win-controls">
          <WindowControls
            onDock={onDock}
            showNotifications={false}
            dockTitle="Minimise to dock"
          />
        </div>

        <div className="login-card">
          <div className="login-welcome-area">
            <div className="login-welcome-title">Welcome back</div>
            <div className="login-welcome-sub">
              Sign in to your dashboard — interviews, assessments, and session history.
            </div>
            {deviceOwnerEmail && (
              <div className="login-device-note">
                This device is registered to <strong>{deviceOwnerEmail}</strong>.
              </div>
            )}
          </div>

          <div className="login-fields">
            <div className="login-field">
              <label className="login-field-label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="login-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="email"
              />
            </div>

            <div className="login-field">
              <label className="login-field-label" htmlFor="login-password">Password</label>
              <div className="login-password-wrapper">
                <input
                  id="login-password"
                  className="login-input login-input-pw"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-pw-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              type="button"
              className="login-btn-primary"
              onClick={handleSignIn}
              disabled={loading}
            >
              {loading ? 'Please wait…' : 'Sign In →'}
            </button>

            {googleAvailable && (
              <>
                <div className="login-divider"><span>or</span></div>

                <button
                  type="button"
                  className="login-btn-google"
                  onClick={handleGoogle}
                  disabled={loading}
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" className="login-google-icon">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Continue with Google
                </button>
              </>
            )}

            <div className="login-register-link">
              Don&apos;t have an account?{' '}
              <button type="button" className="login-register-link-btn" onClick={openSignup}>
                Create one on the website
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
