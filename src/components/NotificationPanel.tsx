import type { UpdatePhase } from '../lib/notification-store'

interface Props {
  phase: UpdatePhase
  version: string
  progress: number
  onDownload: () => void
  onInstall: () => void
  onDismiss: () => void
}

export default function NotificationPanel({
  phase,
  version,
  progress,
  onDownload,
  onInstall,
  onDismiss,
}: Props) {
  return (
    <div className="notif-panel" role="dialog" aria-label="Notifications">
      <div className="notif-panel-header">Notifications</div>
      <div className="notif-panel-body">
        {phase === 'idle' && (
          <div className="notif-empty">
            <span className="notif-empty-icon">✓</span>
            <span>You&apos;re all caught up</span>
          </div>
        )}

        {phase === 'available' && (
          <div className="notif-item">
            <div className="notif-item-icon update">↑</div>
            <div className="notif-item-content">
              <div className="notif-item-title">Update available</div>
              <div className="notif-item-body">Version {version} is ready to download.</div>
              <div className="notif-item-actions">
                <button type="button" className="notif-action primary" onClick={onDownload}>
                  Download
                </button>
                <button type="button" className="notif-action" onClick={onDismiss}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === 'downloading' && (
          <div className="notif-item">
            <div className="notif-item-icon update">↓</div>
            <div className="notif-item-content">
              <div className="notif-item-title">Downloading update</div>
              <div className="notif-item-body">Version {version} · {progress}%</div>
              <div className="notif-progress-bar">
                <div className="notif-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        )}

        {phase === 'ready' && (
          <div className="notif-item">
            <div className="notif-item-icon ready">✓</div>
            <div className="notif-item-content">
              <div className="notif-item-title">Update ready</div>
              <div className="notif-item-body">Restart to install version {version}.</div>
              <div className="notif-item-actions">
                <button type="button" className="notif-action primary" onClick={onInstall}>
                  Restart &amp; install
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
