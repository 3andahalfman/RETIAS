import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  cvs: CV[]
  onCvsChange: () => void
  onDock: () => void
}

export default function CvManager({ cvs, onCvsChange, onDock }: Props) {
  const [selected, setSelected] = useState<CV | null>(null)
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered')
  const [snapOpen, setSnapOpen] = useState(false)
  const snapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (snapRef.current && !snapRef.current.contains(e.target as Node)) setSnapOpen(false)
    }
    if (snapOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [snapOpen])
  const [deleting, setDeleting] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.toLowerCase().split('.').pop()
      let text = ''
      if (ext === 'pdf' || ext === 'docx' || ext === 'doc') {
        const reader = new FileReader()
        const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          reader.onload = (ev) => resolve(ev.target?.result as ArrayBuffer)
          reader.onerror = reject
          reader.readAsArrayBuffer(file)
        })
        text = await window.electronAPI?.extractResumeText?.(buffer, file.name) ?? ''
      } else {
        text = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = (ev) => resolve((ev.target?.result as string) || '')
          r.onerror = reject
          r.readAsText(file)
        })
      }
      const name = file.name.replace(/\.[^/.]+$/, '')
      await window.electronAPI?.saveCv(name, text)
      onCvsChange()
    } catch {}
    finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (cv: CV) => {
    setDeleting(cv.id)
    try {
      await window.electronAPI?.deleteCv(cv.id)
      if (selected?.id === cv.id) setSelected(null)
      onCvsChange()
    } catch {}
    finally { setDeleting(null) }
  }

  function formatDate(ts: number) {
    const d = new Date(ts)
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function wordCount(text: string) {
    return text.trim().split(/\s+/).filter(Boolean).length
  }

  return (
    <div className="cv-manager-root">
      {/* Header */}
      <div className="cv-manager-header">
        <div className="cv-manager-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F80E2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          CV Manager
        </div>
        <div className="cv-manager-header-actions">
          <button
            type="button"
            className="cv-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '⏳ Uploading…' : '+ Upload CV'}
          </button>
          {/* Snap */}
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
          {/* Dock */}
          <button type="button" className="dash-wc-btn dash-wc-dock" title="Dock" onClick={onDock}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
          {/* Close */}
          <button type="button" className="dash-wc-btn dash-wc-close" title="Close" onClick={() => window.electronAPI?.closeWindow()}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf,.docx,.doc"
          aria-label="Upload CV file"
          className="dash-cv-file-input"
          onChange={handleUpload}
        />
      </div>

      <div className="cv-manager-body">
        {/* Left — CV list */}
        <div className="cv-list-panel">
          {cvs.length === 0 ? (
            <div className="cv-empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <p>No CVs uploaded yet</p>
              <button type="button" className="cv-upload-btn" onClick={() => fileInputRef.current?.click()}>
                Upload your first CV
              </button>
            </div>
          ) : (
            cvs.map((cv) => (
              <div
                key={cv.id}
                className={`cv-list-item${selected?.id === cv.id ? ' active' : ''}`}
                onClick={() => setSelected(cv)}
              >
                <div className="cv-list-item-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div className="cv-list-item-info">
                  <div className="cv-list-item-name">{cv.name}</div>
                  <div className="cv-list-item-meta">{wordCount(cv.content).toLocaleString()} words · {formatDate(cv.created_at)}</div>
                </div>
                <button
                  type="button"
                  className="cv-delete-btn"
                  title="Delete CV"
                  disabled={deleting === cv.id}
                  onClick={(e) => { e.stopPropagation(); handleDelete(cv) }}
                >
                  {deleting === cv.id ? '⏳' : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Right — CV preview */}
        <div className="cv-preview-panel">
          {selected ? (
            <>
              <div className="cv-preview-header">
                <span className="cv-preview-name">{selected.name}</span>
                <span className="cv-preview-meta">{wordCount(selected.content).toLocaleString()} words · {formatDate(selected.created_at)}</span>
                <div className="cv-view-toggle">
                  <button type="button" className={`cv-view-btn${viewMode === 'rendered' ? ' active' : ''}`} onClick={() => setViewMode('rendered')}>Rendered</button>
                  <button type="button" className={`cv-view-btn${viewMode === 'raw' ? ' active' : ''}`} onClick={() => setViewMode('raw')}>Raw</button>
                </div>
              </div>
              <div className="cv-preview-content">
                {viewMode === 'rendered' ? (
                  <div className="cv-markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content}</ReactMarkdown>
                  </div>
                ) : (
                  <pre className="cv-preview-text">{selected.content}</pre>
                )}
              </div>
            </>
          ) : (
            <div className="cv-preview-empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
              <p>Select a CV to preview its content</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
