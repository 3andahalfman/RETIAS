interface SidebarProps {
  activeItem: 'dashboard' | 'sessions' | 'cv-manager' | 'settings'
  user: User
  onNavigate: (item: 'dashboard' | 'sessions' | 'cv-manager' | 'settings') => void
}

const navItems: { id: 'dashboard' | 'sessions' | 'cv-manager' | 'settings'; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
  { id: 'sessions',  label: 'Sessions',  icon: '⏱' },
  { id: 'cv-manager',label: 'CV Manager',icon: '📄' },
  { id: 'settings',  label: 'Settings',  icon: '⚙' },
]

export default function Sidebar({ activeItem, user, onNavigate }: SidebarProps) {
  const initials = (user.display_name || user.email || '?').slice(0, 2).toUpperCase()

  return (
    <div className="page-sidebar">
      <div className="sidebar-brand">
        <img src="./logo.svg" alt="RETIAS" style={{ width: 28, height: 28 }} />
        <span className="sidebar-brand-name">RETIAS</span>
      </div>

      <div className="sidebar-section-label">MAIN</div>

      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`sidebar-nav-item${activeItem === item.id ? ' active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}

      <div className="sidebar-spacer" />

      <div className="sidebar-upgrade-card">
        <div className="sidebar-upgrade-title">
          <span>Free Plan</span>
          <span className="sidebar-upgrade-badge">FREE</span>
        </div>
        <div className="sidebar-upgrade-desc">
          Upgrade for premium AI features and unlimited sessions
        </div>
        <button type="button" className="sidebar-upgrade-btn">
          Upgrade to Premium
        </button>
      </div>

      <div className="sidebar-profile">
        <div className="sidebar-avatar">{initials}</div>
        <div className="sidebar-profile-info">
          <div className="sidebar-profile-name">{user.display_name || user.email}</div>
          <div className="sidebar-profile-email">{user.email}</div>
        </div>
      </div>
    </div>
  )
}
