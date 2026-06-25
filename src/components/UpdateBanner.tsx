import { useAppNotifications } from '../lib/notification-store'

export default function UpdateBanner() {
  const { visible, phase, version, progress, dismiss, download, install } = useAppNotifications()

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
          <span className="update-banner-text">Downloading update… {progress}%</span>
          <div className="update-banner-bar">
            <div className="update-banner-fill" style={{ width: `${progress}%` }} />
          </div>
        </>
      )}

      {phase === 'ready' && (
        <>
          <span className="update-banner-text">Update ready — restart to apply</span>
          <button type="button" className="update-banner-btn primary" onClick={install}>
            Restart & Install
          </button>
          <button type="button" className="update-banner-btn dismiss" onClick={dismiss}>Later</button>
        </>
      )}
    </div>
  )
}
