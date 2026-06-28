import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AnswerSelectionToolbar from './AnswerSelectionToolbar'
import { replacePlainSelectionInMarkdown } from '../lib/markdown-selection'
import { useTextSelection } from '../lib/use-text-selection'

const MAX_DRAFTS = 5

type RewriteMode = 'paraphrase' | 'humanize' | 'humanize-strong'

interface AnswerDraft {
  id: string
  text: string
  mode: RewriteMode | 'original'
  label: string
  createdAt: number
}

interface Props {
  value: string
  onChange: (value: string) => void
  paraphraseEnabled: boolean
  readOnly?: boolean
  placeholder?: string
  /** Resets drafts when the active question changes. */
  questionId?: string
  canAutoType?: boolean
  autoTypeLocked?: boolean
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function makeDraft(text: string, mode: AnswerDraft['mode'], label: string): AnswerDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    mode,
    label,
    createdAt: Date.now(),
  }
}

const MODE_LABELS: Record<RewriteMode, string> = {
  paraphrase: 'Paraphrase',
  humanize: 'Humanize',
  'humanize-strong': 'Humanize+',
}

export default function AnswerTextareaWithRewrite({
  value,
  onChange,
  paraphraseEnabled,
  readOnly = false,
  placeholder = 'Paste your answer here…',
  questionId,
  canAutoType = false,
  autoTypeLocked = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const { selection, clearSelection } = useTextSelection(previewRef, textareaRef, editing)
  const [rewriting, setRewriting] = useState<RewriteMode | null>(null)
  const [rewriteError, setRewriteError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<AnswerDraft[]>(() => [makeDraft(value, 'original', 'Original')])
  const [activeDraftIdx, setActiveDraftIdx] = useState(0)
  const [advancedOpen, setAdvancedOpen] = useState(true)

  // Reset drafts when the question changes.
  useEffect(() => {
    setDrafts([makeDraft(value, 'original', 'Original')])
    setActiveDraftIdx(0)
    setRewriteError(null)
  }, [questionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeDraft = drafts[activeDraftIdx] ?? drafts[0]
  const wordCount = countWords(activeDraft?.text ?? value)

  const handleTextChange = useCallback((text: string) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === activeDraftIdx ? { ...d, text } : d)),
    )
    onChange(text)
  }, [activeDraftIdx, onChange])

  const selectDraft = useCallback((idx: number) => {
    const draft = drafts[idx]
    if (!draft) return
    setActiveDraftIdx(idx)
    onChange(draft.text)
    setRewriteError(null)
  }, [drafts, onChange])

  const applyRewrite = useCallback(async (mode: RewriteMode) => {
    const fullText = (drafts[activeDraftIdx]?.text ?? value).trim()
    const highlighted = selection?.text?.trim()
    const sourceText = highlighted || fullText

    if (!sourceText) {
      setRewriteError('Nothing to rewrite — add or highlight some text first.')
      return
    }
    if (!window.electronAPI?.paraphraseSelection) {
      setRewriteError('Rewrite requires the RETIAS desktop app.')
      return
    }

    setRewriting(mode)
    setRewriteError(null)
    try {
      const result = await window.electronAPI.paraphraseSelection({ text: sourceText, mode })
      if (!result?.trim()) {
        throw new Error('Rewrite produced no output. Check the dev console for details.')
      }

      const rewritten = result.trim()

      if (highlighted) {
        let nextText = fullText
        try {
          nextText = replacePlainSelectionInMarkdown(fullText, highlighted, rewritten)
        } catch {
          nextText = fullText.replace(highlighted, rewritten)
        }
        const newDraft = makeDraft(nextText, mode, `${MODE_LABELS[mode]} (selection)`)
        setDrafts((prev) => {
          const next = [...prev, newDraft]
          const capped = next.length > MAX_DRAFTS ? next.slice(-MAX_DRAFTS) : next
          setActiveDraftIdx(capped.length - 1)
          onChange(newDraft.text)
          return capped
        })
        clearSelection()
        return
      }

      const newDraft = makeDraft(rewritten, mode, MODE_LABELS[mode])
      setDrafts((prev) => {
        const next = [...prev, newDraft]
        const capped = next.length > MAX_DRAFTS ? next.slice(-MAX_DRAFTS) : next
        setActiveDraftIdx(capped.length - 1)
        onChange(newDraft.text)
        return capped
      })
    } catch (err) {
      setRewriteError(err instanceof Error ? err.message : 'Rewrite failed.')
    } finally {
      setRewriting(null)
    }
  }, [activeDraftIdx, clearSelection, drafts, onChange, selection?.text, value])

  const handleReplaceSelection = useCallback((replacement: string) => {
    const fullText = drafts[activeDraftIdx]?.text ?? value
    if (!selection?.text) return

    if (editing && textareaRef.current) {
      const ta = textareaRef.current
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const nextText = fullText.slice(0, start) + replacement + fullText.slice(end)
      handleTextChange(nextText)
      return
    }

    try {
      handleTextChange(replacePlainSelectionInMarkdown(fullText, selection.text, replacement))
    } catch {
      handleTextChange(fullText.replace(selection.text, replacement))
    }
  }, [activeDraftIdx, drafts, editing, handleTextChange, selection?.text, value])

  const editorContent = activeDraft?.text ?? value
  const hasRewriteTarget = !!(selection?.text?.trim() || editorContent.trim())

  return (
    <div className="humanizer-editor">
      <div className="humanizer-card">
        {!readOnly && (
          <div className="humanizer-card-toolbar">
            <button
              type="button"
              className="answer-editor-mode-btn"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? 'Preview formatted' : 'Edit markdown'}
            </button>
          </div>
        )}

        {editing || readOnly ? (
          <textarea
            ref={textareaRef}
            className="humanizer-textarea"
            value={editorContent}
            onChange={(e) => handleTextChange(e.target.value)}
            readOnly={readOnly}
            placeholder={placeholder}
            rows={12}
          />
        ) : (
          <div ref={previewRef} className="humanizer-preview humanizer-preview--selectable">
            {editorContent.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{editorContent}</ReactMarkdown>
            ) : (
              <p className="solved-test-answer-placeholder">{placeholder}</p>
            )}
          </div>
        )}

        {paraphraseEnabled && !readOnly && (
          <div className="humanizer-action-bar">
            <span className="humanizer-word-count">
              {wordCount.toLocaleString()} word{wordCount !== 1 ? 's' : ''}
              {selection?.text ? ' · selection active' : ''}
            </span>
            <div className="humanizer-action-btns">
              <button
                type="button"
                className="humanizer-btn humanizer-btn--secondary"
                disabled={!!rewriting || !hasRewriteTarget}
                onClick={() => applyRewrite('paraphrase')}
              >
                <span className="humanizer-btn-icon humanizer-btn-icon--paraphrase">↻</span>
                {rewriting === 'paraphrase' ? 'Paraphrasing…' : selection?.text ? 'Paraphrase selection' : 'Paraphrase'}
              </button>
              <button
                type="button"
                className="humanizer-btn humanizer-btn--secondary"
                disabled={!!rewriting || !hasRewriteTarget}
                onClick={() => applyRewrite('humanize')}
              >
                <span className="humanizer-btn-icon humanizer-btn-icon--humanize">✦</span>
                {rewriting === 'humanize' ? 'Humanizing…' : selection?.text ? 'Humanize selection' : 'Humanize'}
              </button>
              <button
                type="button"
                className="humanizer-btn humanizer-btn--primary"
                disabled={!!rewriting || !hasRewriteTarget}
                onClick={() => applyRewrite('humanize-strong')}
                title="Runs Humanize then Rephrase for stronger AI-detection bypass"
              >
                <span className="humanizer-btn-icon humanizer-btn-icon--strong">✦✦</span>
                {rewriting === 'humanize-strong' ? 'Humanizing+…' : selection?.text ? 'Humanize+ selection' : 'Humanize+'}
              </button>
            </div>
          </div>
        )}

        {paraphraseEnabled && !readOnly && (
          <p className="answer-selection-hint">
            Highlight any part of the answer to rewrite or auto-type just that section.
          </p>
        )}
      </div>

      {rewriteError && <p className="solved-test-rewrite-error">{rewriteError}</p>}

      {paraphraseEnabled && !readOnly && selection && (
        <AnswerSelectionToolbar
          selection={selection}
          onDismiss={clearSelection}
          onReplaceSelection={handleReplaceSelection}
          canAutoType={canAutoType}
          canParaphrase
          autoTypeLocked={autoTypeLocked}
        />
      )}

      {paraphraseEnabled && !readOnly && (
        <div className="humanizer-advanced">
          <button
            type="button"
            className="humanizer-advanced-toggle"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
          >
            <span>Advanced Settings</span>
            <span className={`humanizer-advanced-chevron${advancedOpen ? ' open' : ''}`}>▾</span>
          </button>

          {advancedOpen && (
            <div className="humanizer-drafts-panel">
              <div className="humanizer-drafts-header">
                <div>
                  <div className="humanizer-drafts-title">Drafts</div>
                  <div className="humanizer-drafts-sub">
                    Up to {MAX_DRAFTS} versions — pick one to use as your answer
                  </div>
                </div>
                <div className="humanizer-draft-slots">
                  {Array.from({ length: MAX_DRAFTS }, (_, i) => {
                    const draft = drafts[i]
                    const active = i === activeDraftIdx
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`humanizer-draft-slot${active ? ' active' : ''}${draft ? ' filled' : ''}`}
                        disabled={!draft}
                        onClick={() => selectDraft(i)}
                        title={draft ? `${draft.label} — ${new Date(draft.createdAt).toLocaleTimeString()}` : 'Empty slot'}
                      >
                        {i + 1}
                      </button>
                    )
                  })}
                </div>
              </div>

              {drafts.length > 0 && (
                <div className="humanizer-draft-meta">
                  <span className="humanizer-draft-label">{activeDraft?.label ?? 'Original'}</span>
                  {activeDraft?.mode !== 'original' && (
                    <span className="humanizer-draft-time">
                      {new Date(activeDraft.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  <span className="humanizer-draft-count">{drafts.length}/{MAX_DRAFTS} saved</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
