import { installUpdate } from '../lib/notification-store'

interface UpdateReadyOverlayProps {
  version: string
  /** When true, render as a fixed full-screen overlay (in-app banner path). */
  fullscreen?: boolean
}

export default function UpdateReadyOverlay({ version, fullscreen = false }: UpdateReadyOverlayProps) {
  const label = version ? `v${version}` : 'the latest version'

  return (
    <div className={fullscreen ? 'force-update-overlay update-ready-overlay' : 'update-ready-inline'}>
      <div className="force-update-card force-update-card-ready">
        <div className="force-update-icon force-update-icon-ready">✓</div>
        <h2 className="force-update-title">Update ready</h2>
        <p className="force-update-body">
          <strong className="force-update-version">{label}</strong> is downloaded and ready to install.
          Restart RETIAS to apply the update.
        </p>
        <button type="button" className="force-update-btn force-update-btn-install" onClick={installUpdate}>
          Restart &amp; Install
        </button>
      </div>
    </div>
  )
}
