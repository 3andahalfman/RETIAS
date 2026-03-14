import { useEffect, useState } from 'react'

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready'

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState>('idle')
  const [version, setVersion] = useState('')
  const [progress, setProgress] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) return

    api.onUpdateAvailable?.((v: string) => {
      setVersion(v)
      setState('available')
    })

    api.onUpdateProgress?.((pct: number) => {
      setProgress(pct)
      setState('downloading')
    })

    api.onUpdateDownloaded?.(() => {
      setState('ready')
    })
  }, [])

  if (dismissed || state === 'idle') return null

  return (
    <div className="update-banner">
      {state === 'available' && (
        <>
          <span className="update-banner-text">
            Version <strong>{version}</strong> is available
          </span>
          <button className="update-banner-btn primary" onClick={() => {
            ;(window as any).electronAPI?.downloadUpdate()
            setState('downloading')
          }}>
            Download
          </button>
          <button className="update-banner-btn dismiss" onClick={() => setDismissed(true)}>✕</button>
        </>
      )}

      {state === 'downloading' && (
        <>
          <span className="update-banner-text">Downloading update… {progress}%</span>
          <div className="update-banner-bar">
            <div className="update-banner-fill" style={{ width: `${progress}%` }} />
          </div>
        </>
      )}

      {state === 'ready' && (
        <>
          <span className="update-banner-text">Update ready — restart to apply</span>
          <button className="update-banner-btn primary" onClick={() => {
            ;(window as any).electronAPI?.installUpdate()
          }}>
            Restart & Install
          </button>
          <button className="update-banner-btn dismiss" onClick={() => setDismissed(true)}>Later</button>
        </>
      )}
    </div>
  )
}
