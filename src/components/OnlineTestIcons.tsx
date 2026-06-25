import type { ComponentType, CSSProperties, ReactNode } from 'react'

export interface OnlineTestAccent {
  color: string
  bg: string
  border: string
}

export const ONLINE_TEST_ACCENTS = {
  blue: { color: '#4F80E2', bg: 'rgba(79,128,226,0.12)', border: 'rgba(79,128,226,0.22)' },
  teal: { color: '#15CDCA', bg: 'rgba(21,205,202,0.12)', border: 'rgba(21,205,202,0.22)' },
  amber: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.22)' },
  violet: { color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.22)' },
  slate: { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.22)' },
  emerald: { color: '#4ADE80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.22)' },
} as const satisfies Record<string, OnlineTestAccent>

const S = { strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const, stroke: 'currentColor' }

export function IconAssessment({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  )
}

export function IconSolvedBank({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8M8 11h6" />
    </svg>
  )
}

export function IconLiveSession({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

export function IconVerbal({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M4 7V4h16v3M9 20h6M12 4v16" />
    </svg>
  )
}

export function IconCoding({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

export function IconAiMl({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V12h2a4 4 0 1 1 0 8h-8a4 4 0 1 1 0-8h2V9.5A4 4 0 0 1 12 2z" />
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconNumerical({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z" />
    </svg>
  )
}

export function IconTechnical({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}

export function IconOnboarding({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3" />
      <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
    </svg>
  )
}

export function IconGeneral({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4l3 3" />
    </svg>
  )
}

export function IconPlatform({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

export function IconAssessmentDoc({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M16 13H8M16 17H8M10 9H8" />
    </svg>
  )
}

export function OnlineTestIconBadge({
  accent,
  children,
  large,
}: {
  accent: OnlineTestAccent
  children: ReactNode
  large?: boolean
}) {
  const style = {
    '--ot-accent': accent.color,
    '--ot-accent-bg': accent.bg,
    '--ot-accent-border': accent.border,
  } as CSSProperties

  return (
    <span className={`online-test-icon-badge${large ? ' online-test-icon-badge--lg' : ''}`} style={style}>
      {children}
    </span>
  )
}

export function IconScreenshot({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

export function IconScore({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M12 20V10M18 20V4M6 20v-4" />
    </svg>
  )
}

export function IconUsers({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export function OnlineTestPageHeader({
  title,
  subtitle,
  accent = ONLINE_TEST_ACCENTS.amber,
  icon: Icon = IconAssessment,
}: {
  title: string
  subtitle: string
  accent?: OnlineTestAccent
  icon?: ComponentType<{ size?: number }>
}) {
  return (
    <div className="online-test-header">
      <div className="online-test-header-main">
        <OnlineTestIconBadge accent={accent} large>
          <Icon size={22} />
        </OnlineTestIconBadge>
        <div className="online-test-header-copy">
          <h1 className="online-test-title">{title}</h1>
          <p className="online-test-subtitle">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}
