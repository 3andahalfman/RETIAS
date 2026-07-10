import { useEffect, useState } from 'react'
import ProjectInstructionsFields from './ProjectInstructionsFields'

interface Props {
  instructions: string
  onApply: (instructions: string) => void
}

export default function ProjectInstructionsPanel({ instructions, onApply }: Props) {
  const [open, setOpen] = useState(() => instructions.trim().length > 0)
  const [draft, setDraft] = useState(instructions)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraft(instructions)
    setDirty(false)
  }, [instructions])

  const active = instructions.trim().length > 0

  return (
    <div className={`project-instructions-panel${open ? ' open' : ''}`}>
      <button
        type="button"
        className="project-instructions-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Project instructions</span>
        {active && <span className="project-instructions-badge">Active</span>}
        <span className="project-instructions-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="project-instructions-body">
          <ProjectInstructionsFields
            value={draft}
            onChange={(next) => {
              setDraft(next)
              setDirty(next.trim() !== instructions.trim())
            }}
            showApply
            onApply={() => {
              onApply(draft.trim())
              setDirty(false)
            }}
            applyDisabled={!dirty}
          />
        </div>
      )}
    </div>
  )
}
