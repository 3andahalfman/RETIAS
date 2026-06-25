import { useEffect, useRef, useState } from 'react'
import DockIcon from './DockIcon'
import NotificationPanel from './NotificationPanel'
import { useAppNotifications } from '../lib/notification-store'

const ICON = 12

type SnapPos = 'tl' | 'tm' | 'tr' | 'bl' | 'bm' | 'br'

export function SnapIcon({ size = ICON }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

export function CloseIcon({ size = ICON }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function NotificationIcon({ size = ICON }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function SnapGridDropdown({ onClose }: { onClose: () => void }) {
  const snap = (pos: SnapPos) => {
    window.electronAPI?.snapWindow(pos)
    onClose()
  }
  return (
    <div className="snap-grid-dropdown">
      <div className="snap-grid-row">
        <button type="button" className="snap-grid-cell" title="Top Left" onClick={() => snap('tl')} />
        <button type="button" className="snap-grid-cell" title="Top Middle" onClick={() => snap('tm')} />
        <button type="button" className="snap-grid-cell" title="Top Right" onClick={() => snap('tr')} />
      </div>
      <div className="snap-grid-row">
        <button type="button" className="snap-grid-cell" title="Bottom Left" onClick={() => snap('bl')} />
        <button type="button" className="snap-grid-cell" title="Bottom Middle" onClick={() => snap('bm')} />
        <button type="button" className="snap-grid-cell" title="Bottom Right" onClick={() => snap('br')} />
      </div>
    </div>
  )
}

interface Props {
  onDock: () => void
  className?: string
  showSnap?: boolean
  showDock?: boolean
  showNotifications?: boolean
  dockTitle?: string
}

/** Snap, dock, close (+ notifications on non-session screens). */
export default function WindowControls({
  onDock,
  className = 'win-ctrl-group',
  showSnap = true,
  showDock = true,
  showNotifications = true,
  dockTitle = 'Dock',
}: Props) {
  const [snapOpen, setSnapOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const snapRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)

  const {
    phase,
    version,
    progress,
    hasUnread,
    markRead,
    dismiss,
    download,
    install,
  } = useAppNotifications()

  useEffect(() => {
    if (!snapOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSnapOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [snapOpen])

  useEffect(() => {
    if (!snapOpen && !notifOpen) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (snapOpen && snapRef.current && !snapRef.current.contains(target)) setSnapOpen(false)
      if (notifOpen && notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [snapOpen, notifOpen])

  const toggleNotifications = () => {
    const next = !notifOpen
    setNotifOpen(next)
    if (next) {
      markRead()
      setSnapOpen(false)
    }
  }

  return (
    <>
      {snapOpen && (
        <div
          className="snap-grid-backdrop"
          aria-hidden="true"
          onClick={() => setSnapOpen(false)}
        />
      )}
      <div className={`${className}${snapOpen ? ' is-elevated' : ''}`}>
      {showNotifications && (
        <div className="notif-btn-wrapper" ref={notifRef}>
          <button
            type="button"
            className={`win-ctrl-btn win-ctrl-bell${notifOpen ? ' active' : ''}${hasUnread ? ' has-unread' : ''}`}
            title="Notifications"
            aria-expanded={notifOpen}
            onClick={toggleNotifications}
          >
            <NotificationIcon />
          </button>
          {notifOpen && (
            <NotificationPanel
              phase={phase}
              version={version}
              progress={progress}
              onDownload={() => { download(); setNotifOpen(false) }}
              onInstall={install}
              onDismiss={() => { dismiss(); setNotifOpen(false) }}
            />
          )}
        </div>
      )}
      {showSnap && (
        <div className={`snap-btn-wrapper${snapOpen ? ' is-open' : ''}`} ref={snapRef}>
          <button
            type="button"
            className={`win-ctrl-btn win-ctrl-snap${snapOpen ? ' active' : ''}`}
            title="Snap layout"
            aria-expanded={snapOpen}
            onClick={() => { setSnapOpen((v) => !v); setNotifOpen(false) }}
          >
            <SnapIcon />
          </button>
          {snapOpen && <SnapGridDropdown onClose={() => setSnapOpen(false)} />}
        </div>
      )}
      {showDock && (
        <button type="button" className="win-ctrl-btn win-ctrl-dock" title={dockTitle} onClick={onDock}>
          <DockIcon size={ICON} />
        </button>
      )}
      <button type="button" className="win-ctrl-btn win-ctrl-close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>
        <CloseIcon />
      </button>
      </div>
    </>
  )
}
