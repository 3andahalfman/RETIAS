import { useEffect, useRef, useState } from 'react'
import DockIcon from './DockIcon'
import CreateProjectModal, { type PendingProjectFile } from './CreateProjectModal'

export type ProjectSessionTarget = 'setup' | 'mock-interview' | 'meeting-setup' | 'online-test'

const SESSION_TARGETS: { id: ProjectSessionTarget; icon: string; label: string; desc: string }[] = [
  { id: 'setup', icon: '🏢', label: 'Real Interview', desc: 'Live interview with real-time answers' },
  { id: 'mock-interview', icon: '🎯', label: 'Mock Interview', desc: 'Practice run generated from your resume' },
  { id: 'meeting-setup', icon: '💬', label: 'Meeting Assist', desc: 'Standups and team meetings' },
  { id: 'online-test', icon: '🧪', label: 'Online Assessment', desc: 'Screen analysis for tests and onboarding' },
]

interface Props {
  projects: ProjectSummary[]
  onProjectsChange: () => void
  onStartSession: (projectId: string, target: ProjectSessionTarget) => void
  onDock: () => void
}

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; projectId: string; detail: ProjectWithFiles }
  | { kind: 'launch'; project: ProjectSummary }

export default function ProjectManager({ projects, onProjectsChange, onStartSession, onDock }: Props) {
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' })
  const [deleting, setDeleting] = useState<string | null>(null)
  const [listError, setListError] = useState('')
  const [snapOpen, setSnapOpen] = useState(false)
  const snapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (snapRef.current && !snapRef.current.contains(e.target as Node)) setSnapOpen(false)
    }
    if (snapOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [snapOpen])

  const openCreate = () => {
    setListError('')
    setModal({ kind: 'create' })
  }

  const openEdit = async (projectId: string) => {
    setListError('')
    try {
      const detail = await window.electronAPI?.getProject(projectId)
      if (!detail) throw new Error('Project not found.')
      setModal({ kind: 'edit', projectId, detail })
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not open project.')
    }
  }

  const handleModalSubmit = async (payload: {
    name: string
    instructions: string
    folderPath: string | null
    pendingFiles: PendingProjectFile[]
    removedFileIds: string[]
  }) => {
    const syncFiles = !payload.folderPath

    if (modal.kind === 'create') {
      const created = await window.electronAPI?.saveProject({
        name: payload.name,
        instructions: payload.instructions,
        folderPath: payload.folderPath,
      })
      if (!created) throw new Error('Could not create project.')
      if (syncFiles) {
        for (const file of payload.pendingFiles) {
          await window.electronAPI?.addProjectFile(created.id, file.name, file.content)
        }
      }
      onProjectsChange()
      return
    }

    if (modal.kind === 'edit') {
      await window.electronAPI?.saveProject({
        id: modal.projectId,
        name: payload.name,
        instructions: payload.instructions,
        folderPath: payload.folderPath,
      })
      if (syncFiles) {
        for (const fileId of payload.removedFileIds) {
          await window.electronAPI?.deleteProjectFile(fileId)
        }
        for (const file of payload.pendingFiles) {
          await window.electronAPI?.addProjectFile(modal.projectId, file.name, file.content)
        }
      } else {
        for (const fileId of modal.detail.files.map((f) => f.id)) {
          await window.electronAPI?.deleteProjectFile(fileId)
        }
      }
      onProjectsChange()
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    setDeleting(projectId)
    try {
      await window.electronAPI?.deleteProject(projectId)
      onProjectsChange()
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not delete project.')
    } finally {
      setDeleting(null)
    }
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="cv-manager-root project-manager-root">
      <div className="cv-manager-header">
        <div className="cv-manager-title">
          <span style={{ fontSize: 18 }}>📁</span>
          Projects
        </div>
        <div className="cv-manager-header-actions">
          <div className="snap-btn-wrapper" ref={snapRef}>
            <button type="button" className="dash-wc-btn dash-wc-snap" title="Snap layout" onClick={() => setSnapOpen(!snapOpen)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </button>
            {snapOpen && (
              <div className="snap-grid-dropdown">
                <div className="snap-grid-row">
                  <button type="button" className="snap-grid-cell" title="Top Left"    onClick={() => { window.electronAPI?.snapWindow('tl'); setSnapOpen(false) }} />
                  <button type="button" className="snap-grid-cell" title="Top Middle"  onClick={() => { window.electronAPI?.snapWindow('tm'); setSnapOpen(false) }} />
                  <button type="button" className="snap-grid-cell" title="Top Right"   onClick={() => { window.electronAPI?.snapWindow('tr'); setSnapOpen(false) }} />
                </div>
                <div className="snap-grid-row">
                  <button type="button" className="snap-grid-cell" title="Bottom Left"   onClick={() => { window.electronAPI?.snapWindow('bl'); setSnapOpen(false) }} />
                  <button type="button" className="snap-grid-cell" title="Bottom Middle" onClick={() => { window.electronAPI?.snapWindow('bm'); setSnapOpen(false) }} />
                  <button type="button" className="snap-grid-cell" title="Bottom Right"  onClick={() => { window.electronAPI?.snapWindow('br'); setSnapOpen(false) }} />
                </div>
              </div>
            )}
          </div>
          <button type="button" className="dash-wc-btn dash-wc-dock" title="Dock" onClick={onDock}>
            <DockIcon />
          </button>
          <button type="button" className="dash-wc-btn dash-wc-close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {listError && (
        <div className="project-list-error">{listError}</div>
      )}

      <div className="project-manager-body">
        <div className="project-manager-toolbar">
          <p className="project-manager-subtitle">
            Add instructions and files so the AI answers with your project context.
          </p>
          <button type="button" className="project-manager-new-btn" onClick={openCreate}>
            + New project
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="project-empty-state">
            <div className="project-empty-icon" aria-hidden>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3>No projects yet</h3>
            <p>Create a project with instructions and reference files — like Claude Code or Codex.</p>
            <button type="button" className="project-modal-btn project-modal-btn--primary" onClick={openCreate}>
              Create your first project
            </button>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <div key={p.id} className="project-card">
                <div className="project-card-top">
                  <button type="button" className="project-card-main" onClick={() => openEdit(p.id)}>
                    <div className="project-card-icon" aria-hidden>📁</div>
                    <div className="project-card-info">
                      <div className="project-card-name">{p.name}</div>
                      <div className="project-card-meta">
                        {p.folder_path ? '📂 Folder linked · ' : ''}
                        {p.file_count} file{p.file_count === 1 ? '' : 's'} · Updated {formatDate(p.updated_at)}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="project-card-delete"
                    title="Delete project"
                    disabled={deleting === p.id}
                    onClick={() => handleDeleteProject(p.id)}
                  >
                    {deleting === p.id ? '…' : '🗑'}
                  </button>
                </div>
                <div className="project-card-footer">
                  <button
                    type="button"
                    className="project-card-start"
                    onClick={() => setModal({ kind: 'launch', project: p })}
                  >
                    Start a session →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal.kind === 'launch' && (
        <div className="project-modal-overlay" onClick={() => setModal({ kind: 'closed' })}>
          <div
            className="project-modal project-launch-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="project-launch-title"
          >
            <div className="project-modal-header">
              <h2 id="project-launch-title" className="project-modal-title">
                Start a session with “{modal.project.name}”
              </h2>
              <button
                type="button"
                className="project-modal-close"
                aria-label="Close"
                onClick={() => setModal({ kind: 'closed' })}
              >
                ×
              </button>
            </div>

            <p className="project-launch-note">
              Pick a session type. This project's instructions and files are attached automatically.
            </p>

            <div className="project-launch-list">
              {SESSION_TARGETS.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  className="project-launch-option"
                  onClick={() => onStartSession(modal.project.id, target.id)}
                >
                  <span className="project-launch-icon" aria-hidden>{target.icon}</span>
                  <span className="project-launch-text">
                    <span className="project-launch-label">{target.label}</span>
                    <span className="project-launch-desc">{target.desc}</span>
                  </span>
                  <span className="project-launch-chevron" aria-hidden>→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {modal.kind === 'create' && (
        <CreateProjectModal
          mode="create"
          onClose={() => setModal({ kind: 'closed' })}
          onSubmit={handleModalSubmit}
        />
      )}

      {modal.kind === 'edit' && (
        <CreateProjectModal
          mode="edit"
          initialName={modal.detail.name}
          initialInstructions={modal.detail.instructions}
          initialFolderPath={modal.detail.folder_path}
          initialFiles={modal.detail.files}
          onClose={() => setModal({ kind: 'closed' })}
          onSubmit={handleModalSubmit}
        />
      )}
    </div>
  )
}
