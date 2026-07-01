import UpdateReadyOverlay from './UpdateReadyOverlay'
import { useAppNotifications } from '../lib/notification-store'

export default function UpdateBanner() {
  const { visible, phase, version, progress, dismiss, download } = useAppNotifications()

  if (phase === 'ready') {
    return <UpdateReadyOverlay version={version} fullscreen />
  }

  if (!visible) return null

  return (
    <div className="update-banner">
      {phase === 'available' && (
        <>
          <span className="update-banner-text">
            Version <strong>{version}</strong> is available
          </span>
          <button type="button" className="update-banner-btn primary" onClick={download}>
            Download
          </button>
          <button type="button" className="update-banner-btn dismiss" onClick={dismiss}>✕</button>
        </>
      )}

      {phase === 'downloading' && (
        <>
          <span className="update-banner-text">
            {progress >= 100 ? 'Finalizing download…' : `Downloading update… ${progress}%`}
          </span>
          <div className="update-banner-bar">
            <div className="update-banner-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        </>
      )}
    </div>
  )
}
