import { useState } from 'react'
import { installUpdate, skipUpdate } from '../lib/notification-store'

interface UpdateReadyOverlayProps {
  version: string
  /** When true, render as a fixed full-screen overlay (in-app banner path). */
  fullscreen?: boolean
  /** Startup gate — skip enters the app without installing. */
  onSkip?: () => void
}

export default function UpdateReadyOverlay({
  version,
  fullscreen = false,
  onSkip,
}: UpdateReadyOverlayProps) {
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')

  const label = version ? `v${version}` : 'the latest version'

  const handleInstall = async () => {
    if (installing) return
    setError('')
    setInstalling(true)
    const err = await installUpdate()
    setInstalling(false)
    if (err) setError(err)
  }

  const handleSkip = () => {
    if (version) skipUpdate(version)
    onSkip?.()
  }

  return (
    <div className={fullscreen ? 'force-update-overlay update-ready-overlay' : 'update-ready-inline'}>
      <div className="force-update-card force-update-card-ready">
        <div className="force-update-icon force-update-icon-ready">✓</div>
        <h2 className="force-update-title">Update ready</h2>
        <p className="force-update-body">
          <strong className="force-update-version">{label}</strong> is downloaded and ready to install.
          Restart RETIAS to apply the update.
        </p>
        <button
          type="button"
          className="force-update-btn force-update-btn-install"
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? 'Restarting…' : 'Restart & Install'}
        </button>
        {onSkip && (
          <button
            type="button"
            className="force-update-btn force-update-btn-secondary"
            onClick={handleSkip}
            disabled={installing}
            style={{ marginTop: 10 }}
          >
            Skip for now
          </button>
        )}
        {error && <p className="project-instructions-error" style={{ marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  )
}
