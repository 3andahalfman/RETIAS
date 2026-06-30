/**
 * True when text is essentially a bare URL with no interview question content.
 * Catches forms like "https://app.outlier.ai/..." and "app.outlier.ai/screening?id=…".
 */
export function isBareUrl(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.includes('\n')) return false
  if (trimmed.split(/\s+/).length > 1) return false

  const candidate = trimmed.replace(/^https?:\/\//i, '')
  return /^(?:[\w-]+\.)+[\w.-]+(?:\/[^\s]*)?(?:\?[^\s]*)?$/i.test(candidate)
}

/** Question text safe to show in Q&A headers — empty when the value is a bare URL. */
export function displayQuestionText(text: string | null | undefined): string {
  if (!text) return ''
  const trimmed = text.trim()
  return isBareUrl(trimmed) ? '' : trimmed
}
