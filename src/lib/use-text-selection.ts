import { RefObject, useCallback, useEffect, useState } from 'react'

export interface TextSelectionState {
  text: string
  rect: DOMRect
}

const MIN_SELECTION_LEN = 2

/** Rendered markdown code: fenced blocks, inline code, SyntaxHighlighter output. */
const CODE_BLOCK_SELECTOR = 'pre, code, .answer-code-block, .answer-inline-code, .syntax-highlighter'

function nodeInCodeBlock(node: Node | null): boolean {
  const el =
    node == null
      ? null
      : node.nodeType === Node.TEXT_NODE
        ? node.parentElement
        : node instanceof Element
          ? node
          : null
  return !!el?.closest(CODE_BLOCK_SELECTOR)
}

function selectionIntersectsCodeBlock(sel: Selection, range: Range): boolean {
  if (nodeInCodeBlock(sel.anchorNode) || nodeInCodeBlock(sel.focusNode)) return true

  const root =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer
  if (!root) return false

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let textNode: Node | null
  while ((textNode = walker.nextNode())) {
    if (!range.intersectsNode(textNode)) continue
    if (nodeInCodeBlock(textNode)) return true
  }
  return false
}

function readContainerSelection(container: HTMLElement): TextSelectionState | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null

  const text = sel.toString().trim()
  if (text.length < MIN_SELECTION_LEN) return null

  const range = sel.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  if (selectionIntersectsCodeBlock(sel, range)) return null

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
