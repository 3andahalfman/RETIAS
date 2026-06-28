import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadSettings } from './Settings'
import { prepareAutoTypeText } from '../lib/markdown-strip'
import type { TextSelectionState } from '../lib/use-text-selection'

type RewriteMode = 'paraphrase' | 'humanize' | 'humanize-strong'

const MODE_LABELS: Record<RewriteMode, string> = {
  paraphrase: 'Paraphrase',
  humanize: 'Humanize',
  'humanize-strong': 'Humanize+',
}

interface Props {
  selection: TextSelectionState
  onDismiss: () => void
  /** Replace the highlighted snippet inside the full answer markdown. */
  onReplaceSelection?: (replacement: string) => void
  canAutoType?: boolean
  canParaphrase?: boolean
  autoTypeLocked?: boolean
  paraphraseLocked?: boolean
}

export default function AnswerSelectionToolbar({
  selection,
  onDismiss,
  onReplaceSelection,
  canAutoType = false,
  canParaphrase = false,
  autoTypeLocked = false,
  paraphraseLocked = false,
}: Props) {
  const [rewriting, setRewriting] = useState<RewriteMode | null>(null)
  const [error, setError] = useState<string | null>(null)

  const style = useMemo(() => {
    const { rect } = selection
    const pad = 8
    const toolbarW = 320
    let left = rect.left + rect.width / 2 - toolbarW / 2
    left = Math.max(pad, Math.min(left, window.innerWidth - toolbarW - pad))
    const top = Math.max(pad, rect.top - 44)
    return { left, top, width: toolbarW }
  }, [selection])

  useEffect(() => {
    setError(null)
  }, [selection.text])

  const handleAutoType = useCallback(() => {
    if (autoTypeLocked || !canAutoType) return
    const text = prepareAutoTypeText(selection.text)
    if (!text.trim()) return
    const s = loadSettings()
    window.electronAPI?.autoTypeStart?.({
      text,
      wpm: s.autoTyperWpm,
      jitterPct: s.autoTyperJitterPct,
      countdownMs: s.autoTyperCountdownMs,
      typoRate: s.autoTyperTypoRate ?? 0,
    }).catch(() => {})
    onDismiss()
  }, [autoTypeLocked, canAutoType, onDismiss, selection.text])

  const handleRewrite = useCallback(async (mode: RewriteMode) => {
    if (paraphraseLocked || !canParaphrase || !onReplaceSelection) return
    if (!window.electronAPI?.paraphraseSelection) {
      setError('Rewrite requires the RETIAS desktop app.')
      return
    }

    setRewriting(mode)
    setError(null)
    try {
      const result = await window.electronAPI.paraphraseSelection({ text: selection.text, mode })
      if (!result?.trim()) {
        throw new Error('Rewrite produced no output.')
      }
      onReplaceSelection(result.trim())
      onDismiss()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rewrite failed.')
    } finally {
      setRewriting(null)
    }
  }, [canParaphrase, onDismiss, onReplaceSelection, paraphraseLocked, selection.text])

  const showAutoType = canAutoType || autoTypeLocked
  const showParaphrase = (canParaphrase || paraphraseLocked) && !!onReplaceSelection

  if (!showAutoType && !showParaphrase) return null

  return (
    <div className="answer-selection-toolbar-wrap" style={{ left: style.left, top: style.top }}>
      <div className="answer-selection-toolbar" role="toolbar" aria-label="Selection tools">
        {showAutoType && (
          <button
            type="button"
            className={`answer-selection-btn answer-selection-btn--autotype${autoTypeLocked ? ' locked' : ''}`}
            disabled={autoTypeLocked || !!rewriting}
            onClick={handleAutoType}
            title={autoTypeLocked ? 'Premium Plus — upgrade to unlock Auto-Typer' : 'Auto-type highlighted text'}
          >
            {autoTypeLocked ? '🔒' : '⌨'} Auto-Type
          </button>
        )}
        {showParaphrase && (
          <>
            <span className="answer-selection-divider" />
            <button
              type="button"
              className={`answer-selection-btn${paraphraseLocked ? ' locked' : ''}`}
              disabled={paraphraseLocked || !!rewriting}
              onClick={() => handleRewrite('paraphrase')}
              title={paraphraseLocked ? 'Premium Plus — upgrade to unlock rewrite tools' : 'Paraphrase selection'}
            >
              {rewriting === 'paraphrase' ? '…' : '↻'} {rewriting === 'paraphrase' ? 'Working' : 'Paraphrase'}
            </button>
            <button
              type="button"
              className={`answer-selection-btn${paraphraseLocked ? ' locked' : ''}`}
              disabled={paraphraseLocked || !!rewriting}
              onClick={() => handleRewrite('humanize')}
              title={paraphraseLocked ? 'Premium Plus — upgrade to unlock rewrite tools' : 'Humanize selection'}
            >
              {rewriting === 'humanize' ? '…' : '✦'} {rewriting === 'humanize' ? 'Working' : 'Humanize'}
            </button>
            <button
              type="button"
              className={`answer-selection-btn answer-selection-btn--primary${paraphraseLocked ? ' locked' : ''}`}
              disabled={paraphraseLocked || !!rewriting}
              onClick={() => handleRewrite('humanize-strong')}
              title={paraphraseLocked ? 'Premium Plus — upgrade to unlock rewrite tools' : 'Humanize then paraphrase (stronger)'}
            >
              {rewriting === 'humanize-strong' ? '…' : '✦✦'} {rewriting === 'humanize-strong' ? 'Working' : MODE_LABELS['humanize-strong']}
            </button>
          </>
        )}
        <button type="button" className="answer-selection-btn answer-selection-btn--dismiss" onClick={onDismiss} title="Dismiss">
          ✕
        </button>
      </div>
      {error && <p className="answer-selection-error">{error}</p>}
    </div>
  )
}
