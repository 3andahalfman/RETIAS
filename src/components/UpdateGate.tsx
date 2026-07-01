import { useCallback, useEffect, useState, type ReactNode } from 'react'
import WindowControls from './WindowControls'
import UpdateReadyOverlay from './UpdateReadyOverlay'
import {
  downloadUpdate,
  syncUpdateDownloadState,
  useAppNotifications,
} from '../lib/notification-store'

type UpdateCheckStatus = 'skipped' | 'checking' | 'up-to-date' | 'available' | 'error'

interface UpdateGateProps {
  onPassed: () => void
}

function passesGate(status: UpdateCheckStatus): boolean {
  return status === 'skipped' || status === 'up-to-date'
}

function UpdateGateShell({
  children,
  className = 'auth-loading-root',
  onDock,
}: {
  children: ReactNode
  className?: string
  onDock: () => void
}) {
  return (
    <div className={`app-root ${className}`} style={{ position: 'relative' }}>
      <div className="login-win-controls">
        <WindowControls
          onDock={onDock}
          showNotifications={false}
          dockTitle="Minimise to dock"
        />
      </div>
      {children}
    </div>
  )
}

export default function UpdateGate({ onPassed }: UpdateGateProps) {
  const [checkStatus, setCheckStatus] = useState<UpdateCheckStatus>('checking')
  const [version, setVersion] = useState('')
  const [isDocked, setIsDocked] = useState(false)
  const { phase, progress } = useAppNotifications()

  const handleDock = () => {
    setIsDocked(true)
    window.electronAPI?.dockWindow()
  }

  const handleUndock = () => {
    setIsDocked(false)
    window.electronAPI?.undockWindow()
  }

  const applyCheckResult = useCallback((result: {
    status: UpdateCheckStatus
    version?: string | null
    downloadPhase?: 'idle' | 'downloading' | 'ready'
  }) => {
    setCheckStatus(result.status)
    if (result.version) setVersion(result.version)
    syncUpdateDownloadState(result)
    if (passesGate(result.status)) onPassed()
  }, [onPassed])

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.getUpdateCheckStatus) {
      onPassed()
      return
    }

    api.getUpdateCheckStatus().then(applyCheckResult).catch(() => onPassed())

    const unsub = api.onUpdateCheckStatus?.(applyCheckResult)
    return () => unsub?.()
  }, [applyCheckResult, onPassed])

  // Poll main process when progress hits 100% but update:downloaded was missed.
  useEffect(() => {
    if (phase !== 'downloading' || progress < 100) return
    let cancelled = false
    const poll = () => {
      window.electronAPI?.getUpdateCheckStatus?.()
        .then((result) => { if (!cancelled) syncUpdateDownloadState(result) })
        .catch(() => {})
    }
    poll()
    const id = window.setInterval(poll, 400)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [phase, progress])

  const handleRetry = () => {
    setCheckStatus('checking')
    window.electronAPI?.retryUpdateCheck?.()
      .then(applyCheckResult)
      .catch(() => setCheckStatus('error'))
  }

  if (isDocked) {
    return (
      <div className="app-root docked">
        <div
          className="docked-content"
          onClick={handleUndock}
          onMouseEnter={() => window.electronAPI?.setIgnoreMouseEvents(false)}
          onMouseLeave={() => window.electronAPI?.setIgnoreMouseEvents(true)}
          title="Click to expand"
        >
          <img className="docked-logo" src="./logo.svg" alt="RETIAS" />
        </div>
      </div>
    )
  }

  // Checking — minimal splash while main process talks to update server
  if (checkStatus === 'checking') {
    return (
      <UpdateGateShell className="auth-loading-root update-gate-root" onDock={handleDock}>
        <img src="./logo.svg" alt="RETIAS" className="auth-loading-logo" />
        <p className="update-gate-status">Checking for updates…</p>
      </UpdateGateShell>
    )
  }

  // Fail open — offline or server unreachable; user can continue or retry
  if (checkStatus === 'error') {
    return (
      <UpdateGateShell onDock={handleDock}>
        <div className="force-update-overlay">
          <div className="force-update-card">
            <div className="force-update-icon">⚠️</div>
            <h2 className="force-update-title">Update check failed</h2>
            <p className="force-update-body">
              Could not reach the update server. You can continue with the current version or try again.
            </p>
            <button type="button" className="force-update-btn" onClick={onPassed}>
              Continue offline
            </button>
            <button
              type="button"
              className="force-update-btn force-update-btn-secondary"
              onClick={handleRetry}
              style={{ marginTop: 10, background: 'transparent', border: '1px solid #1A2540', color: 'var(--text-muted)' }}
            >
              Retry
            </button>
          </div>
        </div>
      </UpdateGateShell>
    )
  }

  // Update required — block app until downloaded and installed
  if (checkStatus === 'available') {
    if (phase === 'ready') {
      return (
        <UpdateGateShell className="update-gate-root" onDock={handleDock}>
          <UpdateReadyOverlay version={version} fullscreen />
        </UpdateGateShell>
      )
    }

    return (
      <UpdateGateShell onDock={handleDock}>
        <div className="force-update-overlay">
          <div className="force-update-card">
            <div className="force-update-icon">⬆️</div>
            <h2 className="force-update-title">Update required</h2>
            {phase === 'downloading' ? (
              <div className="force-update-progress-wrap">
                <p className="force-update-body" style={{ marginBottom: 0 }}>
                  {progress >= 100 ? 'Finalizing download…' : 'Downloading update…'}
                </p>
                <div className="update-banner-bar">
                  <div className="update-banner-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
                <span className="force-update-pct">{Math.min(progress, 100)}%</span>
              </div>
            ) : (
              <>
                <p className="force-update-body">
                  Version <strong className="force-update-version">{version}</strong> is available.
                  Download and install it to continue.
                </p>
                <button type="button" className="force-update-btn" onClick={downloadUpdate}>
                  Download update
                </button>
              </>
            )}
          </div>
        </div>
      </UpdateGateShell>
    )
  }

  return null
}
