/** Replace a plain-text selection inside a markdown source string. */
export function replacePlainSelectionInMarkdown(
  source: string,
  selectedPlain: string,
  replacement: string,
): string {
  const sel = selectedPlain.trim()
  if (!sel) return source

  const directIdx = source.indexOf(selectedPlain)
  if (directIdx !== -1) {
    return source.slice(0, directIdx) + replacement + source.slice(directIdx + selectedPlain.length)
  }

  const trimmedIdx = source.indexOf(sel)
  if (trimmedIdx !== -1) {
    return source.slice(0, trimmedIdx) + replacement + source.slice(trimmedIdx + sel.length)
  }

  const words = sel.split(/\s+/).filter(Boolean)
  if (words.length) {
    const parts = words.map((w) => {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return `(?:\\*\\*)?${esc}(?:\\*\\*)?`
    })
    const re = new RegExp(parts.join('\\s+'), 's')
    const match = source.match(re)
    if (match && match.index != null) {
      return source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length)
    }
  }

  throw new Error('Could not locate the highlighted text in the answer.')
}
