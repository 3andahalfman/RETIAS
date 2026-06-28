import { useState } from 'react'
import { hasPremiumPlusAccess } from '../lib/premium-access'

export type SidebarItemId =
  | 'dashboard'
  | 'real-interview'
  | 'mock-interview'
  | 'online-assessment'
  | 'sessions'
  | 'cv-manager'
  | 'auto-typer'
  | 'settings'

interface SidebarProps {
  activeItem: SidebarItemId
  user: User
  onNavigate: (item: SidebarItemId) => void
  onLogout?: () => void
  onUpgrade?: () => void
}

const COLLAPSED_KEY = 'retias-sidebar-collapsed'

interface NavItem {
  id: SidebarItemId
  label: string
  icon: string
  accent?: string
  premium?: boolean
  premiumPlus?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Home',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: '⊞' }],
  },
  {
    label: 'Start',
    items: [
      { id: 'real-interview', label: 'Real Interview', icon: '◫', accent: '#4F80E2' },
      { id: 'mock-interview', label: 'Mock Interview', icon: '◎', accent: '#15CDCA' },
      { id: 'online-assessment', label: 'Online Assessment', icon: '⟨⟩', accent: '#F59E0B', premium: true },
    ],
  },
  {
    label: 'Interview',
    items: [
      { id: 'sessions', label: 'Past Sessions', icon: '⏱' },
      { id: 'cv-manager', label: 'CV Manager', icon: '📄' },
      { id: 'auto-typer', label: 'Auto-Typer', icon: '⌨', premiumPlus: true },
    ],
  },
  {
    label: 'Account',
    items: [{ id: 'settings', label: 'Settings', icon: '⚙' }],
  },
]

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
  const sections = NAV_SECTIONS

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  const profileTitle = `${user.display_name || user.email}${user.email ? `\n${user.email}` : ''}`

  const isNavItemLocked = (item: NavItem) => {
    if (item.premiumPlus) return !hasPremiumPlusAccess(user)
    if (item.premium) return !user.is_premium
    return false
  }

  const lockedNavTitle = (item: NavItem) => {
    if (item.premiumPlus) return `${item.label} — Premium Plus feature`
    if (item.premium) return `${item.label} — Premium feature`
    return item.label
  }

  const handleNavClick = (item: NavItem) => {
    if (isNavItemLocked(item)) {
      onUpgrade?.()
      return
    }
    onNavigate(item.id)
  }

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

      <nav className="sidebar-nav" aria-label="Main navigation">
        {sections.map((section) => (
          <div key={section.label} className="sidebar-nav-section">
            <div className="sidebar-section-label">{section.label}</div>
            {section.items.map((item) => {
              const locked = isNavItemLocked(item)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-nav-item${activeItem === item.id ? ' active' : ''}${locked ? ' locked' : ''}`}
                  title={locked ? lockedNavTitle(item) : item.label}
                  onClick={() => handleNavClick(item)}
                >
                  <span
                    className="sidebar-nav-icon"
                    style={item.accent ? { color: item.accent } : undefined}
                  >
                    {item.icon}
                  </span>
                  <span className="sidebar-nav-label">
                    {item.label}
                    {locked && <span className="sidebar-nav-lock" aria-hidden>🔒</span>}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

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
