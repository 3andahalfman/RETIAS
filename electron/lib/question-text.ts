/** Mirror of src/lib/question-text.ts — keep in sync for main-process filtering. */
export function isBareUrl(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.includes('\n')) return false
  if (trimmed.split(/\s+/).length > 1) return false

  const candidate = trimmed.replace(/^https?:\/\//i, '')
  return /^(?:[\w-]+\.)+[\w.-]+(?:\/[^\s]*)?(?:\?[^\s]*)?$/i.test(candidate)
}
