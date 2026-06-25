import { useState } from 'react'
import { isAdminEmail } from '../lib/admin'

interface SidebarProps {
  activeItem: 'dashboard' | 'sessions' | 'cv-manager' | 'auto-typer' | 'settings' | 'admin-screenshots'
  user: User
  onNavigate: (item: 'dashboard' | 'sessions' | 'cv-manager' | 'auto-typer' | 'settings' | 'admin-screenshots') => void
  onLogout?: () => void
  onUpgrade?: () => void
}

const COLLAPSED_KEY = 'retias-sidebar-collapsed'

const navItems: { id: 'dashboard' | 'sessions' | 'cv-manager' | 'auto-typer'; label: string; icon: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',  icon: '⊞' },
  { id: 'sessions',   label: 'Sessions',   icon: '⏱' },
  { id: 'cv-manager', label: 'CV Manager', icon: '📄' },
  { id: 'auto-typer', label: 'Auto-Typer', icon: '⌨' },
]

const settingsItem = { id: 'settings' as const, label: 'Settings', icon: '⚙' }
const adminItem = { id: 'admin-screenshots' as const, label: 'Screenshot Library', icon: '📸' }

function CollapseIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {expanded
        ? <polyline points="15 18 9 12 15 6" />
        : <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

export default function Sidebar({ activeItem, user, onNavigate, onLogout, onUpgrade }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false }
  })

  const initials = (user.display_name || user.email || '?').slice(0, 2).toUpperCase()
  const showAdmin = isAdminEmail(user.email)
  const items = showAdmin
    ? [...navItems, adminItem, settingsItem]
    : [...navItems, settingsItem]

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  const profileTitle = `${user.display_name || user.email}${user.email ? `\n${user.email}` : ''}`

  return (
    <div className={`page-sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-brand">
        <img src="./logo.svg" alt="RETIAS" className="sidebar-brand-logo" />
        <span className="sidebar-brand-name">RETIAS</span>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <CollapseIcon expanded={!collapsed} />
        </button>
      </div>

      <div className="sidebar-section-label">MAIN</div>

      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`sidebar-nav-item${activeItem === item.id ? ' active' : ''}`}
          title={item.label}
          onClick={() => onNavigate(item.id)}
        >
          <span className="sidebar-nav-icon">{item.icon}</span>
          <span className="sidebar-nav-label">{item.label}</span>
        </button>
      ))}

      <div className="sidebar-spacer" />

      {!user.is_premium && (
        <div className="sidebar-upgrade-card">
          <div className="sidebar-upgrade-title">
            <span>Free Plan</span>
            <span className="sidebar-upgrade-badge">FREE</span>
          </div>
          <div className="sidebar-upgrade-desc">
            Upgrade for unlimited sessions.
          </div>
          <button
            type="button"
            className="sidebar-upgrade-btn"
            onClick={() => onUpgrade?.()}
          >
            Upgrade to Premium
          </button>
        </div>
      )}

      <div className="sidebar-profile-card">
        <div className="sidebar-profile" title={collapsed ? profileTitle : undefined}>
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-profile-info">
            <div className="sidebar-profile-name">
              <span className="sidebar-profile-name-text">{user.display_name || user.email}</span>
              {user.is_premium_plus
                ? <span className="sidebar-pro-badge plus">PRO+</span>
                : user.is_premium && <span className="sidebar-pro-badge">PRO</span>}
            </div>
            <div className="sidebar-profile-email">{user.email}</div>
          </div>
        </div>
        {onLogout && (
          <button type="button" className="sidebar-signout-btn" title="Sign Out" onClick={onLogout}>
            <span className="sidebar-signout-icon" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            <span className="sidebar-signout-label">Sign Out</span>
          </button>
        )}
      </div>
    </div>
  )
}
