import { useState, useEffect } from 'react'

interface Props {
  onLogin: (user: User) => void
  isDocked: boolean
  onDock: () => void
  onUndock: () => void
}

type Tab = 'signin' | 'register'

export default function LoginPage({ onLogin, isDocked, onDock, onUndock }: Props) {
  const [tab, setTab] = useState<Tab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleAvailable, setGoogleAvailable] = useState(false)
  const [snapOpen, setSnapOpen] = useState(false)

  useEffect(() => {
    window.electronAPI?.authGoogleAvailable?.().then(setGoogleAvailable).catch(() => {})
  }, [])


  const clearError = () => setError('')

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

  const handleRegister = async () => {
    if (!email.trim()) { setError('Please enter your email.'); return }
    if (!password) { setError('Please enter a password.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    setError('')
    try {
      const user = await window.electronAPI!.authRegister(email.trim(), password, displayName.trim())
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      tab === 'signin' ? handleSignIn() : handleRegister()
    }
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
      {/* Window controls */}
      <div className="login-win-controls">
        <div className="login-snap-wrapper">
          <button type="button" className="login-win-btn" title="Snap layout" onClick={() => setSnapOpen(!snapOpen)}>✥</button>
          {snapOpen && (
            <div className="snap-grid-dropdown">
              <div className="snap-grid-row">
                <button type="button" className="snap-grid-cell" title="Top Left"    onClick={() => { window.electronAPI?.snapWindow('tl'); setSnapOpen(false) }} />
                <button type="button" className="snap-grid-cell" title="Top Middle"  onClick={() => { window.electronAPI?.snapWindow('tm'); setSnapOpen(false) }} />
                <button type="button" className="snap-grid-cell" title="Top Right"   onClick={() => { window.electronAPI?.snapWindow('tr'); setSnapOpen(false) }} />
              </div>
              <div className="snap-grid-row">
                <button type="button" className="snap-grid-cell" title="Bottom Left"   onClick={() => { window.electronAPI?.snapWindow('bl'); setSnapOpen(false) }} />
                <button type="button" className="snap-grid-cell" title="Bottom Middle" onClick={() => { window.electronAPI?.snapWindow('bm'); setSnapOpen(false) }} />
                <button type="button" className="snap-grid-cell" title="Bottom Right"  onClick={() => { window.electronAPI?.snapWindow('br'); setSnapOpen(false) }} />
              </div>
            </div>
          )}
        </div>
        <button type="button" className="login-win-btn" title="Minimise to dock" onClick={onDock}>↙</button>
        <button type="button" className="login-win-btn close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>✕</button>
      </div>

      <div className="login-card">
        {/* Logo + Brand */}
        <div className="login-logo-area">
          <img src="./logo.svg" alt="RETIAS" className="login-logo" />
          <div className="login-brand">RETIAS</div>
          <div className="login-brand-sub">Real Time Interview Assistant</div>
        </div>

        {/* Tabs */}
        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab ${tab === 'signin' ? 'active' : ''}`}
            onClick={() => { setTab('signin'); clearError() }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`login-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); clearError() }}
          >
            Create Account
          </button>
        </div>

        {/* Fields */}
        <div className="login-fields">
          {tab === 'register' && (
            <div className="login-field">
              <label className="login-field-label" htmlFor="login-name">Display Name</label>
              <input
                id="login-name"
                className="login-input"
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="name"
              />
            </div>
          )}

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
                placeholder={tab === 'register' ? 'Min. 8 characters' : 'Your password'}
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
            onClick={tab === 'signin' ? handleSignIn : handleRegister}
            disabled={loading}
          >
            {loading ? 'Please wait…' : tab === 'signin' ? 'Sign In' : 'Create Account'}
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
        </div>
      </div>
    </div>
  )
}
