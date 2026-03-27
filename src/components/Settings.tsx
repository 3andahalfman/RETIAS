import { useState, useEffect, useRef } from 'react'

interface Props {
  user: User
  onLogout: () => void
  onUserUpdate: (updates: Partial<User>) => void
}

const SETTINGS_KEY = 'retias-settings'

interface AppSettings {
  aiModel: string
  answerStyle: string
  responseLanguage: string
  micDeviceId: string
  systemAudioEnabled: boolean
  noiseSuppression: boolean
  defaultSessionType: string
  autoScrollTranscript: boolean
  fontSizeIdx: number
  windowOpacity: number
  alwaysOnTop: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  aiModel: 'claude-sonnet-4-6',
  answerStyle: 'concise',
  responseLanguage: 'English',
  micDeviceId: 'default',
  systemAudioEnabled: true,
  noiseSuppression: false,
  defaultSessionType: 'real',
  autoScrollTranscript: true,
  fontSizeIdx: 0,
  windowOpacity: 90,
  alwaysOnTop: true,
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

const SECTIONS = ['AI & Model', 'Audio', 'Interview', 'Appearance', 'Privacy & Security', 'Account', 'About'] as const
type Section = typeof SECTIONS[number]

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Mandarin', 'Japanese', 'Arabic', 'Hindi', 'Russian']

export default function Settings({ user, onLogout, onUserUpdate }: Props) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [activeSection, setActiveSection] = useState<Section>('AI & Model')
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [appVersion, setAppVersion] = useState('1.6.2')
  const [displayName, setDisplayName] = useState(user.display_name || '')
  const [savingName, setSavingName] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [clearDone, setClearDone] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [snapOpen, setSnapOpen] = useState(false)
  const snapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then(v => v && setAppVersion(v))
    navigator.mediaDevices.enumerateDevices().then(devices => {
      setMicDevices(devices.filter(d => d.kind === 'audioinput'))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (snapRef.current && !snapRef.current.contains(e.target as Node)) setSnapOpen(false)
    }
    if (snapOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [snapOpen])

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      saveSettings(next)
      // Apply side effects immediately
      if (key === 'windowOpacity') window.electronAPI?.setWindowOpacity?.(value as number)
      if (key === 'alwaysOnTop') window.electronAPI?.setAlwaysOnTop?.(value as boolean)
      if (key === 'fontSizeIdx') localStorage.setItem('answer-font-size-idx', String(value))
      return next
    })
  }

  const handleSaveDisplayName = async () => {
    if (!displayName.trim() || displayName === user.display_name) return
    setSavingName(true)
    try {
      await window.electronAPI?.updateDisplayName?.(displayName.trim())
      onUserUpdate({ display_name: displayName.trim() })
    } finally {
      setSavingName(false)
    }
  }

  const handleClearSessions = async () => {
    await window.electronAPI?.clearAllSessions?.()
    setClearConfirm(false)
    setClearDone(true)
    setTimeout(() => setClearDone(false), 3000)
  }

  // suppress unused warning
  void deleteConfirm

  return (
    <div className="settings-root">
      {/* Window controls */}
      <div className="settings-win-controls">
        <div className="snap-btn-wrapper" ref={snapRef}>
          <button type="button" className="dash-wc-btn dash-wc-snap" title="Snap layout" onClick={() => setSnapOpen(!snapOpen)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
          </button>
          {snapOpen && (
            <div className="snap-grid-dropdown">
              <div className="snap-grid-row">
                <button type="button" className="snap-grid-cell" title="Top Left" onClick={() => { window.electronAPI?.snapWindow('tl'); setSnapOpen(false) }} />
                <button type="button" className="snap-grid-cell" title="Top Middle" onClick={() => { window.electronAPI?.snapWindow('tm'); setSnapOpen(false) }} />
                <button type="button" className="snap-grid-cell" title="Top Right" onClick={() => { window.electronAPI?.snapWindow('tr'); setSnapOpen(false) }} />
              </div>
              <div className="snap-grid-row">
                <button type="button" className="snap-grid-cell" title="Bottom Left" onClick={() => { window.electronAPI?.snapWindow('bl'); setSnapOpen(false) }} />
                <button type="button" className="snap-grid-cell" title="Bottom Middle" onClick={() => { window.electronAPI?.snapWindow('bm'); setSnapOpen(false) }} />
                <button type="button" className="snap-grid-cell" title="Bottom Right" onClick={() => { window.electronAPI?.snapWindow('br'); setSnapOpen(false) }} />
              </div>
            </div>
          )}
        </div>
        <button type="button" className="dash-wc-btn dash-wc-dock" title="Dock" onClick={() => window.electronAPI?.minimizeWindow()}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>
        <button type="button" className="dash-wc-btn dash-wc-close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Left nav */}
      <div className="settings-nav">
        <div className="settings-nav-title">Settings</div>
        {SECTIONS.map(s => (
          <button
            key={s}
            type="button"
            className={`settings-nav-item${activeSection === s ? ' active' : ''}`}
            onClick={() => setActiveSection(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="settings-content">

        {activeSection === 'AI & Model' && (
          <div className="settings-section">
            <div className="settings-section-title">AI & Model</div>

            <div className="settings-group">
              <label className="settings-label">Model</label>
              <div className="settings-radio-group">
                {[
                  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', desc: 'Best balance of speed & quality' },
                  { value: 'claude-opus-4-6', label: 'Opus 4.6', desc: 'Most powerful, slower' },
                  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', desc: 'Fastest responses' },
                ].map(opt => (
                  <label key={opt.value} className={`settings-radio-card${settings.aiModel === opt.value ? ' selected' : ''}`}>
                    <input type="radio" name="aiModel" value={opt.value} checked={settings.aiModel === opt.value} onChange={() => update('aiModel', opt.value)} />
                    <div>
                      <div className="settings-radio-label">{opt.label}</div>
                      <div className="settings-radio-desc">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="settings-group">
              <label className="settings-label">Answer Style</label>
              <div className="settings-select-row">
                {[
                  { value: 'concise', label: 'Concise' },
                  { value: 'detailed', label: 'Detailed' },
                  { value: 'bullets', label: 'Bullet Points' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`settings-chip${settings.answerStyle === opt.value ? ' active' : ''}`}
                    onClick={() => update('answerStyle', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-group">
              <label className="settings-label">Response Language</label>
              <select className="settings-select" value={settings.responseLanguage} onChange={e => update('responseLanguage', e.target.value)}>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
        )}

        {activeSection === 'Audio' && (
          <div className="settings-section">
            <div className="settings-section-title">Audio</div>

            <div className="settings-group">
              <label className="settings-label">Microphone</label>
              <select className="settings-select" value={settings.micDeviceId} onChange={e => update('micDeviceId', e.target.value)}>
                <option value="default">Default Microphone</option>
                {micDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 8)}`}</option>
                ))}
              </select>
              <div className="settings-hint">Used when starting a new session</div>
            </div>

            <div className="settings-group">
              <div className="settings-toggle-row">
                <div>
                  <div className="settings-toggle-label">System Audio (Loopback)</div>
                  <div className="settings-toggle-desc">Capture interviewer audio from your speakers</div>
                </div>
                <button
                  type="button"
                  className={`settings-toggle${settings.systemAudioEnabled ? ' on' : ''}`}
                  onClick={() => update('systemAudioEnabled', !settings.systemAudioEnabled)}
                  aria-label="Toggle system audio"
                >
                  <span className="settings-toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="settings-group">
              <div className="settings-toggle-row">
                <div>
                  <div className="settings-toggle-label">Noise Suppression</div>
                  <div className="settings-toggle-desc">Reduce background noise in microphone input</div>
                </div>
                <button
                  type="button"
                  className={`settings-toggle${settings.noiseSuppression ? ' on' : ''}`}
                  onClick={() => update('noiseSuppression', !settings.noiseSuppression)}
                  aria-label="Toggle noise suppression"
                >
                  <span className="settings-toggle-thumb" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'Interview' && (
          <div className="settings-section">
            <div className="settings-section-title">Interview</div>

            <div className="settings-group">
              <label className="settings-label">Default Session Type</label>
              <div className="settings-select-row">
                {[
                  { value: 'real', label: 'Real Interview' },
                  { value: 'mock', label: 'Mock Interview' },
                  { value: 'online-test', label: 'Online Test' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`settings-chip${settings.defaultSessionType === opt.value ? ' active' : ''}`}
                    onClick={() => update('defaultSessionType', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-group">
              <div className="settings-toggle-row">
                <div>
                  <div className="settings-toggle-label">Auto-scroll Transcript</div>
                  <div className="settings-toggle-desc">Automatically scroll to latest transcript line</div>
                </div>
                <button
                  type="button"
                  className={`settings-toggle${settings.autoScrollTranscript ? ' on' : ''}`}
                  onClick={() => update('autoScrollTranscript', !settings.autoScrollTranscript)}
                  aria-label="Toggle auto-scroll"
                >
                  <span className="settings-toggle-thumb" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'Appearance' && (
          <div className="settings-section">
            <div className="settings-section-title">Appearance</div>

            <div className="settings-group">
              <label className="settings-label">Default Answer Font Size</label>
              <div className="settings-select-row">
                {[
                  { value: 0, label: 'Small' },
                  { value: 1, label: 'Medium' },
                  { value: 2, label: 'Large' },
                  { value: 3, label: 'X-Large' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`settings-chip${settings.fontSizeIdx === opt.value ? ' active' : ''}`}
                    onClick={() => update('fontSizeIdx', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-group">
              <label className="settings-label">Window Opacity — {settings.windowOpacity}%</label>
              <input
                type="range"
                className="settings-slider"
                min={40}
                max={100}
                step={5}
                value={settings.windowOpacity}
                onChange={e => update('windowOpacity', Number(e.target.value))}
              />
              <div className="settings-hint">Adjusts the overlay transparency during sessions</div>
            </div>

            <div className="settings-group">
              <div className="settings-toggle-row">
                <div>
                  <div className="settings-toggle-label">Always on Top</div>
                  <div className="settings-toggle-desc">Keep RETIAS above all other windows</div>
                </div>
                <button
                  type="button"
                  className={`settings-toggle${settings.alwaysOnTop ? ' on' : ''}`}
                  onClick={() => update('alwaysOnTop', !settings.alwaysOnTop)}
                  aria-label="Toggle always on top"
                >
                  <span className="settings-toggle-thumb" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'Privacy & Security' && (
          <div className="settings-section">
            <div className="settings-section-title">Privacy & Security</div>

            <div className="settings-group">
              <div className="settings-danger-card">
                <div className="settings-danger-info">
                  <div className="settings-danger-title">Clear All Session Data</div>
                  <div className="settings-danger-desc">Permanently delete all past sessions, transcripts and Q&A history. This cannot be undone.</div>
                </div>
                {clearDone ? (
                  <span className="settings-clear-done">✓ Cleared</span>
                ) : clearConfirm ? (
                  <div className="settings-confirm-row">
                    <span className="settings-confirm-text">Are you sure?</span>
                    <button type="button" className="settings-btn-ghost" onClick={() => setClearConfirm(false)}>Cancel</button>
                    <button type="button" className="settings-btn-danger" onClick={handleClearSessions}>Yes, clear all</button>
                  </div>
                ) : (
                  <button type="button" className="settings-btn-danger-outline" onClick={() => setClearConfirm(true)}>Clear Data</button>
                )}
              </div>
            </div>

            <div className="settings-group">
              <div className="settings-danger-card">
                <div className="settings-danger-info">
                  <div className="settings-danger-title">Delete Account</div>
                  <div className="settings-danger-desc">Permanently delete your account and all associated data. Contact support to proceed.</div>
                </div>
                <button type="button" className="settings-btn-danger-outline" onClick={() => window.electronAPI?.openExternal?.('mailto:support@retias.app?subject=Delete%20Account')}>Contact Support</button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'Account' && (
          <div className="settings-section">
            <div className="settings-section-title">Account</div>

            <div className="settings-group">
              <label className="settings-label">Display Name</label>
              <div className="settings-input-row">
                <input
                  type="text"
                  className="settings-input"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  maxLength={50}
                />
                <button
                  type="button"
                  className="settings-btn-primary"
                  onClick={handleSaveDisplayName}
                  disabled={savingName || !displayName.trim() || displayName === user.display_name}
                >
                  {savingName ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            <div className="settings-group">
              <label className="settings-label">Email</label>
              <div className="settings-static-value">{user.email}</div>
            </div>

            <div className="settings-group">
              <label className="settings-label">Subscription</label>
              {user.is_premium ? (
                <div className="settings-plan-badge premium">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Premium Plan
                </div>
              ) : (
                <div className="settings-free-plan">
                  <div className="settings-plan-badge free">Free Plan</div>
                  <button type="button" className="settings-btn-primary">Upgrade to Premium</button>
                </div>
              )}
            </div>

            <div className="settings-group">
              <button type="button" className="settings-btn-danger-outline" onClick={onLogout}>Sign Out</button>
            </div>
          </div>
        )}

        {activeSection === 'About' && (
          <div className="settings-section">
            <div className="settings-section-title">About</div>

            <div className="settings-group">
              <div className="settings-about-card">
                <img src="./logo.svg" alt="RETIAS" className="settings-about-logo" />
                <div className="settings-about-name">RETIAS</div>
                <div className="settings-about-full">Real Time Interview Assistant Software</div>
                <div className="settings-about-version">Version {appVersion}</div>
              </div>
            </div>

            <div className="settings-group">
              <button type="button" className="settings-btn-secondary" onClick={() => window.electronAPI?.downloadUpdate?.()}>
                Check for Updates
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
