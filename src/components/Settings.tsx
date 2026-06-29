import { useState, useEffect, useRef } from 'react'
import { isAdminEmail } from '../lib/admin'
import { hasPremiumPlusAccess } from '../lib/premium-access'
import DockIcon from './DockIcon'

interface Props {
  user: User
  onLogout: () => void
  onUserUpdate: (updates: Partial<User>) => void
  onUpgrade?: () => void
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
  /** Admin-only: hide overlay from screen capture (content protection). */
  stealthMode: boolean
  /** Auto-Typer default speed in words per minute. */
  autoTyperWpm: number
  /** Auto-Typer default jitter fraction (0–0.7). */
  autoTyperJitterPct: number
  /** Auto-Typer default countdown handoff before typing starts. */
  autoTyperCountdownMs: number
  /** Auto-Typer default per-word typo probability (0–0.5). */
  autoTyperTypoRate: number
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
  windowOpacity: 95,
  alwaysOnTop: true,
  stealthMode: true,
  autoTyperWpm: 60,
  autoTyperJitterPct: 0.2,
  autoTyperCountdownMs: 3000,
  autoTyperTypoRate: 0.05,
}

// Models that are still available in the UI. Anything else stored from a
// previous version (e.g. retired claude-opus-4-6) is migrated to the default.
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6',
  'claude-opus-4-5',
  'claude-haiku-4-5-20251001',
  'gpt-4.1-mini',
])

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as AppSettings
      if (!ALLOWED_MODELS.has(merged.aiModel)) {
        merged.aiModel = DEFAULT_SETTINGS.aiModel
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged))
      }
      return merged
    }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

/**
 * Persist Auto-Typer defaults from outside the Settings page (e.g. the
 * Auto-Typer tab updates these as the user fiddles with the sliders so the
 * next launch starts at the same point).
 */
export function saveAutoTyperDefaults(partial: {
  autoTyperWpm?: number
  autoTyperJitterPct?: number
  autoTyperCountdownMs?: number
  autoTyperTypoRate?: number
}) {
  const current = loadSettings()
  const next: AppSettings = { ...current, ...partial }
  saveSettings(next)
}

const SECTIONS = ['AI & Model', 'Audio', 'Interview', 'Auto-Typer', 'Appearance', 'Privacy & Security', 'Account', 'About'] as const
type Section = typeof SECTIONS[number]

const NAV_GROUPS: Array<{ label: string; items: Array<{ id: Section; icon: string }> }> = [
  {
    label: 'Session',
    items: [
      { id: 'AI & Model', icon: '✦' },
      { id: 'Audio', icon: '🎙' },
      { id: 'Interview', icon: '💼' },
      { id: 'Auto-Typer', icon: '⌨' },
    ],
  },
  {
    label: 'Display',
    items: [{ id: 'Appearance', icon: '◐' }],
  },
  {
    label: 'Account',
    items: [
      { id: 'Privacy & Security', icon: '🔒' },
      { id: 'Account', icon: '👤' },
    ],
  },
  {
    label: 'App',
    items: [{ id: 'About', icon: 'ℹ' }],
  },
]

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Mandarin', 'Japanese', 'Arabic', 'Hindi', 'Russian']

export default function Settings({ user, onLogout, onUserUpdate, onUpgrade }: Props) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [activeSection, setActiveSection] = useState<Section>('AI & Model')
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [appVersion, setAppVersion] = useState('1.7.7')
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
      if (key === 'stealthMode') window.electronAPI?.setStealthMode?.(value as boolean)
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
          <DockIcon />
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
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="settings-nav-group">
            <div className="settings-nav-group-label">{group.label}</div>
            {group.items.map(({ id, icon }) => (
              <button
                key={id}
                type="button"
                className={`settings-nav-item${activeSection === id ? ' active' : ''}`}
                onClick={() => setActiveSection(id)}
              >
                <span className="settings-nav-icon" aria-hidden="true">{icon}</span>
                <span className="settings-nav-text">{id}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="settings-content">

        {activeSection === 'AI & Model' && (
          <div className="settings-section settings-section--ai">
            <div className="settings-section-title">AI & Model</div>

            <div className="settings-group">
              <label className="settings-label">Model</label>
              <div className="settings-model-grid">
                {[
                  { value: 'claude-sonnet-4-6',        label: 'Claude Sonnet 4.6', desc: 'Best balance of speed & quality', premium: false },
                  { value: 'claude-opus-4-5',           label: 'Claude Opus 4.5',   desc: 'Top-tier reasoning at lower cost', premium: true },
                  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  desc: 'Fastest Claude responses', premium: false },
                  { value: 'gpt-4.1-mini',              label: 'GPT-4.1 mini',      desc: 'OpenAI — fast & cost-efficient', premium: false },
                ].map(opt => {
                  const locked = opt.premium && !user.is_premium
                  return (
                    <label
                      key={opt.value}
                      className={`settings-model-card${settings.aiModel === opt.value ? ' selected' : ''}${locked ? ' locked' : ''}`}
                      title={locked ? '🔒 Premium only — upgrade to use this model' : undefined}
                    >
                      <input
                        type="radio"
                        name="aiModel"
                        value={opt.value}
                        checked={settings.aiModel === opt.value}
                        disabled={locked}
                        onChange={() => update('aiModel', opt.value)}
                      />
                      <div className="settings-model-card-body">
                        <div className="settings-model-card-top">
                          <span className="settings-model-card-name">{opt.label}</span>
                          {locked && <span className="settings-model-card-badge">Premium</span>}
                        </div>
                        <span className="settings-model-card-desc">{opt.desc}</span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="settings-ai-prefs">
              <div className="settings-group settings-group--compact">
                <label className="settings-label">Answer Style</label>
                <div className="settings-segmented">
                  {[
                    { value: 'concise', label: 'Concise' },
                    { value: 'detailed', label: 'Detailed' },
                    { value: 'bullets', label: 'Bullet Points' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`settings-segmented-btn${settings.answerStyle === opt.value ? ' active' : ''}`}
                      onClick={() => update('answerStyle', opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-group settings-group--compact">
                <label className="settings-label">Response Language</label>
                <select className="settings-select" value={settings.responseLanguage} onChange={e => update('responseLanguage', e.target.value)}>
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
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
                  { value: 'online-test', label: 'Online Assessment' },
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

        {activeSection === 'Auto-Typer' && (
          <div className="settings-section">
            <div className="settings-section-title">Auto-Typer</div>

            {!hasPremiumPlusAccess(user) && (
              <div className="settings-group">
                <div className="settings-hint">
                  Auto-Typer is a Premium Plus feature. Upgrade to unlock typing from AI answers and the dedicated Auto-Typer tab.
                </div>
                {onUpgrade && (
                  <button type="button" className="settings-btn-secondary" onClick={onUpgrade}>
                    Upgrade to Premium Plus
                  </button>
                )}
              </div>
            )}

            <div className={!hasPremiumPlusAccess(user) ? 'settings-section-locked' : undefined}>
            <div className="settings-group">
              <label className="settings-label">Default Speed — {settings.autoTyperWpm} WPM</label>
              <input
                type="range"
                className="settings-slider"
                min={20}
                max={300}
                step={5}
                value={settings.autoTyperWpm}
                disabled={!hasPremiumPlusAccess(user)}
                onChange={e => update('autoTyperWpm', Number(e.target.value))}
              />
              <div className="settings-hint">Used as the starting speed when you open the Auto-Typer tab.</div>
            </div>

            <div className="settings-group">
              <label className="settings-label">Default Jitter — {Math.round(settings.autoTyperJitterPct * 100)}%</label>
              <input
                type="range"
                className="settings-slider"
                min={0}
                max={70}
                step={5}
                value={Math.round(settings.autoTyperJitterPct * 100)}
                disabled={!hasPremiumPlusAccess(user)}
                onChange={e => update('autoTyperJitterPct', Number(e.target.value) / 100)}
              />
              <div className="settings-hint">Randomises per-keystroke delays. Higher values look more human but take longer.</div>
            </div>

            <div className="settings-group">
              <label className="settings-label">Default Typo Rate — {Math.round(settings.autoTyperTypoRate * 100)}%</label>
              <input
                type="range"
                className="settings-slider"
                min={0}
                max={30}
                step={1}
                value={Math.round(settings.autoTyperTypoRate * 100)}
                disabled={!hasPremiumPlusAccess(user)}
                onChange={e => update('autoTyperTypoRate', Number(e.target.value) / 100)}
              />
              <div className="settings-hint">
                Chance per word of being mistyped, paused on, backspaced, and corrected. Set to 0 to disable.
              </div>
            </div>

            <div className="settings-group">
              <label className="settings-label">Default Countdown</label>
              <div className="settings-select-row">
                {[3000, 5000, 7000].map(ms => (
                  <button
                    key={ms}
                    type="button"
                    className={`settings-chip${settings.autoTyperCountdownMs === ms ? ' active' : ''}`}
                    disabled={!hasPremiumPlusAccess(user)}
                    onClick={() => update('autoTyperCountdownMs', ms)}
                  >
                    {ms / 1000}s
                  </button>
                ))}
              </div>
              <div className="settings-hint">Time to focus the target window after clicking Start.</div>
            </div>

            <div className="settings-group">
              <div className="settings-hint">
                Global hotkeys during typing: <strong>Alt + T</strong> pause/resume · <strong>Alt + Shift + T</strong> stop.
              </div>
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

            {isAdminEmail(user.email) && (
              <div className="settings-group">
                <div className="settings-toggle-row">
                  <div>
                    <div className="settings-toggle-label">Stealth Mode</div>
                    <div className="settings-toggle-desc">
                      Hide RETIAS from screen recordings and screenshots. Turn off only for demos or debugging.
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle${settings.stealthMode ? ' on' : ''}`}
                    onClick={() => update('stealthMode', !settings.stealthMode)}
                    aria-label="Toggle stealth mode"
                  >
                    <span className="settings-toggle-thumb" />
                  </button>
                </div>
              </div>
            )}

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
              {user.is_premium_plus ? (
                <div className="settings-plan-badge premium-plus">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Premium Plus Plan
                </div>
              ) : user.is_premium ? (
                <div className="settings-plan-badge premium">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Premium Plan
                </div>
              ) : (
                <div className="settings-free-plan">
                  <div className="settings-plan-badge free">Free Plan</div>
                  <button
                    type="button"
                    className="settings-btn-primary"
                    onClick={() => onUpgrade?.()}
                  >
                    Upgrade to Premium
                  </button>
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
