import { RefObject, useCallback, useEffect, useState } from 'react'

export interface TextSelectionState {
  text: string
  rect: DOMRect
}

const MIN_SELECTION_LEN = 2

function readContainerSelection(container: HTMLElement): TextSelectionState | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null

  const text = sel.toString().trim()
  if (text.length < MIN_SELECTION_LEN) return null

  const range = sel.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null

  const rect = range.getBoundingClientRect()
  if (!rect.width && !rect.height) return null

  return { text, rect }
}

export function getTextareaSelection(ta: HTMLTextAreaElement): TextSelectionState | null {
  const { selectionStart, selectionEnd } = ta
  if (selectionStart === selectionEnd) return null

  const text = ta.value.slice(selectionStart, selectionEnd).trim()
  if (text.length < MIN_SELECTION_LEN) return null

  ta.focus()
  const rect = ta.getBoundingClientRect()
  // Approximate highlight position — precise caret rects would need a mirror element.
  return {
    text,
    rect: new DOMRect(rect.left + 16, rect.top + 28, Math.min(rect.width - 32, 240), 20),
  }
}

/**
 * Track the user's text highlight inside a container (markdown preview) and/or
 * an optional textarea (edit mode).
 */
export function useTextSelection(
  containerRef: RefObject<HTMLElement | null>,
  textareaRef?: RefObject<HTMLTextAreaElement | null>,
  editing?: boolean,
) {
  const [selection, setSelection] = useState<TextSelectionState | null>(null)

  const sync = useCallback(() => {
    if (editing && textareaRef?.current) {
      setSelection(getTextareaSelection(textareaRef.current))
      return
    }
    const container = containerRef.current
    if (!container) {
      setSelection(null)
      return
    }
    setSelection(readContainerSelection(container))
  }, [containerRef, textareaRef, editing])

  useEffect(() => {
    document.addEventListener('mouseup', sync)
    document.addEventListener('keyup', sync)
    return () => {
      document.removeEventListener('mouseup', sync)
      document.removeEventListener('keyup', sync)
    }
  }, [sync])

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }, [])

  return { selection, clearSelection, syncSelection: sync }
}
