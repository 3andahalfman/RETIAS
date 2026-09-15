import { useEffect, useRef, useState } from 'react'

export interface PendingProjectFile {
  name: string
  content: string
}

interface Props {
  mode: 'create' | 'edit'
  initialName?: string
  initialInstructions?: string
  initialFolderPath?: string | null
  initialFiles?: ProjectFile[]
  onClose: () => void
  onSubmit: (payload: {
    name: string
    instructions: string
    folderPath: string | null
    pendingFiles: PendingProjectFile[]
    removedFileIds: string[]
  }) => Promise<void>
}

export default function CreateProjectModal({
  mode,
  initialName = '',
  initialInstructions = '',
  initialFolderPath = null,
  initialFiles = [],
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName)
  const [instructions, setInstructions] = useState(initialInstructions)
  const [folderPath, setFolderPath] = useState<string | null>(initialFolderPath)
  const [pendingFiles, setPendingFiles] = useState<PendingProjectFile[]>([])
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [pickingFolder, setPickingFolder] = useState(false)
  const [error, setError] = useState('')
  const [folderNotice, setFolderNotice] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!initialFolderPath || !window.electronAPI?.readProjectFolder) return
    let cancelled = false
    window.electronAPI.readProjectFolder(initialFolderPath).then((result) => {
      if (cancelled || !result?.folderPath) return
      setFolderPath(result.folderPath)
      setPendingFiles(result.files)
      if (result.files.length > 0) {
        setFolderNotice(`${result.files.length} file${result.files.length === 1 ? '' : 's'} in linked folder.`)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [initialFolderPath])

  const keptExisting = initialFiles.filter((f) => !removedFileIds.includes(f.id))
  const displayFiles = folderPath ? pendingFiles : [...keptExisting.map((f) => ({ name: f.name, content: f.content })), ...pendingFiles]

  const handlePickFolder = async () => {
    if (!window.electronAPI?.pickProjectFolder) {
      setError('Folder picker is unavailable. Quit and restart the app (npm run dev) to load the latest version.')
      return
    }

    setPickingFolder(true)
    setError('')
    setFolderNotice('')
    try {
      const result = await window.electronAPI.pickProjectFolder()
      if (!result?.folderPath) return

      setFolderPath(result.folderPath)
      setPendingFiles(result.files)
      setRemovedFileIds(initialFiles.map((f) => f.id))

      if (result.files.length === 0) {
        setFolderNotice(
          'Folder linked, but no readable files were found. Try a folder with .txt, .md, .json, .ts, .py, .pdf, or .docx files.',
        )
      } else {
        setFolderNotice(`${result.files.length} file${result.files.length === 1 ? '' : 's'} loaded from folder — the AI will read this folder live during sessions.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read folder.')
    } finally {
      setPickingFolder(false)
    }
  }

  const handleClearFolder = () => {
    setFolderPath(null)
    setPendingFiles([])
    setFolderNotice('')
    setRemovedFileIds([])
  }

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Please name your project.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit({
        name: trimmedName,
        instructions,
        folderPath,
        pendingFiles: folderPath ? pendingFiles : pendingFiles,
        removedFileIds,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const folderLabel = folderPath?.split(/[/\\]/).pop() ?? ''

  return (
    <div className="project-modal-overlay" onClick={onClose}>
      <div className="project-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="project-modal-title">
        <div className="project-modal-header">
          <h2 id="project-modal-title" className="project-modal-title">
            {mode === 'create' ? 'Create a project' : 'Edit project'}
          </h2>
          <button type="button" className="project-modal-close" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="project-modal-field">
          <label className="project-modal-label" htmlFor="project-name">What are you working on?</label>
          <input
            ref={nameRef}
            id="project-name"
            className="project-modal-input"
            placeholder="Name your project"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="project-modal-field">
          <label className="project-modal-label" htmlFor="project-goals">What are you trying to achieve?</label>
          <textarea
            id="project-goals"
            className="project-modal-textarea"
            placeholder="Describe your project, goals, subject, etc..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={6}
          />
        </div>

        <button
          type="button"
          className="project-modal-folder-btn"
          onClick={handlePickFolder}
          disabled={pickingFolder || saving}
        >
          <span className="project-modal-folder-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </span>
          {pickingFolder ? 'Reading folder…' : folderPath ? 'Change folder' : 'Use a folder'}
        </button>

        {folderPath && (
          <div className="project-modal-folder-selected">
            <div className="project-modal-folder-path" title={folderPath}>
              <span className="project-modal-folder-path-icon">📁</span>
              <span className="project-modal-folder-path-text">{folderLabel}</span>
              <span className="project-modal-folder-path-full">{folderPath}</span>
            </div>
            <button type="button" className="project-modal-folder-clear" onClick={handleClearFolder}>
              Remove
            </button>
          </div>
        )}

        {folderNotice && <p className="project-modal-folder-notice">{folderNotice}</p>}

        {displayFiles.length > 0 && (
          <div className="project-modal-files">
            <div className="project-modal-files-label">
              {displayFiles.length} context file{displayFiles.length === 1 ? '' : 's'}
            </div>
            {displayFiles.slice(0, 12).map((f) => (
              <div key={f.name} className="project-modal-file-row project-modal-file-row--new">
                <span className="project-modal-file-name">{f.name}</span>
              </div>
            ))}
            {displayFiles.length > 12 && (
              <p className="project-modal-files-more">+ {displayFiles.length - 12} more files</p>
            )}
          </div>
        )}

        {error && <p className="project-modal-error">{error}</p>}

        <div className="project-modal-footer">
          <button type="button" className="project-modal-btn project-modal-btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="project-modal-btn project-modal-btn--primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create project' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
