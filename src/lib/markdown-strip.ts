/**
 * Convert AI-generated markdown into plain text suitable for the Auto-Typer.
 *
 * We deliberately keep this dependency-free and best-effort: the goal is to
 * remove markdown syntax noise (headings, emphasis, code fences, list markers,
 * link decorations, blockquotes, tables) while preserving the underlying
 * prose and code. Anything ambiguous is left alone — the user can still edit
 * the result inside the Auto-Typer textarea before clicking Start.
 */
export function stripMarkdown(input: string): string {
  if (!input) return ''
  let text = input

  text = text.replace(/\r\n/g, '\n')

  // Fenced code blocks: drop the ``` lines but keep the inner code as-is.
  text = text.replace(/```[^\n]*\n([\s\S]*?)\n?```/g, (_m, body) => `${body}`)
  // Single-backtick fences without trailing newline (rare).
  text = text.replace(/```([\s\S]*?)```/g, (_m, body) => `${body}`)

  // Inline code: keep the inner text, drop the backticks.
  text = text.replace(/`([^`\n]+)`/g, '$1')

  // Images: ![alt](url) → alt (drop URL entirely)
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')

  // Links: [text](url) → text
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Bare reference-style link defs (rare but harmless)
  text = text.replace(/^\s*\[[^\]]+\]:\s*\S.*$/gm, '')

  // Headings: # Heading → Heading
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '')

  // Blockquotes: > foo → foo
  text = text.replace(/^\s{0,3}>\s?/gm, '')

  // Horizontal rules
  text = text.replace(/^\s*([-*_])\1{2,}\s*$/gm, '')

  // Bullet list markers (-, *, +) at line start
  text = text.replace(/^(\s*)[-*+]\s+/gm, '$1')

  // Numbered list markers: "1. foo" → "foo"
  text = text.replace(/^(\s*)\d+\.\s+/gm, '$1')

  // Tables: collapse pipe separators to spaces, drop separator rows like |---|
  text = text.replace(/^\s*\|?\s*:?-{3,}:?(\s*\|\s*:?-{3,}:?)*\s*\|?\s*$/gm, '')
  text = text.replace(/\s*\|\s*/g, '  ')

  // Bold / italic / strikethrough emphasis
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2')
  text = text.replace(/(\*|_)([^*_\n]+?)\1/g, '$2')
  text = text.replace(/~~(.*?)~~/g, '$1')

  // Collapse 3+ consecutive blank lines down to 2 so paragraph breaks survive
  // but huge gaps from removed headings don't pile up.
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}
