import { useRef, useState } from 'react'
import { appendInstructionText, MAX_PROJECT_INSTRUCTIONS } from '../lib/project-onboarding'

interface Props {
  value: string
  onChange: (value: string) => void
  /** Show Apply to push draft to the live session (in-session panel). */
  showApply?: boolean
  onApply?: () => void
  applyDisabled?: boolean
}

export default function ProjectInstructionsFields({
  value,
  onChange,
  showApply = false,
  onApply,
  applyDisabled = false,
}: Props) {
  const [capturing, setCapturing] = useState(false)
  const [captureCount, setCaptureCount] = useState(0)
  const [error, setError] = useState('')
  const valueRef = useRef(value)
  valueRef.current = value

  const atLimit = value.length >= MAX_PROJECT_INSTRUCTIONS

  const handleCapture = async () => {
    if (capturing || atLimit) return
    setError('')
    setCapturing(true)
    try {
      const extracted = await window.electronAPI?.extractInstructionsFromScreen?.()
      if (extracted?.trim()) {
        const merged = appendInstructionText(valueRef.current, extracted).slice(0, MAX_PROJECT_INSTRUCTIONS)
        onChange(merged)
        setCaptureCount((n) => n + 1)
        if (merged.length >= MAX_PROJECT_INSTRUCTIONS) {
          setError(`Character limit reached (${MAX_PROJECT_INSTRUCTIONS.toLocaleString()}).`)
        }
      } else if (extracted !== undefined) {
        setError('No instructional text detected on screen.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Capture failed.')
    } finally {
      setCapturing(false)
    }
  }

  return (
    <div className="project-instructions-fields">
      <div className="project-instructions-label-row">
        <label className="setup-label">Project instructions</label>
        {captureCount > 0 && (
          <span className="project-instructions-capture-count">
            {captureCount} capture{captureCount === 1 ? '' : 's'} added
          </span>
        )}
      </div>
      <textarea
        className="setup-textarea project-instructions-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_PROJECT_INSTRUCTIONS))}
        rows={10}
      />
      <div className="project-instructions-actions">
        <button
          type="button"
          className="setup-btn secondary project-instructions-capture-btn"
          onClick={handleCapture}
          disabled={capturing || atLimit}
          title={atLimit ? 'Character limit reached' : 'Switch to another page and capture again — text appends'}
        >
          {capturing ? 'Extracting…' : captureCount > 0 ? 'Add another capture' : 'Capture from screen'}
        </button>
        {showApply && (
          <button
            type="button"
            className="setup-btn primary project-instructions-apply-btn"
            onClick={onApply}
            disabled={applyDisabled}
          >
            Apply
          </button>
        )}
      </div>
      {error && <p className="project-instructions-error">{error}</p>}
    </div>
  )
}
