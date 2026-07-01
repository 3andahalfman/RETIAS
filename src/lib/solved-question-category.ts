/** Canonical category ids stored in solved_questions.assessment_type */
export const GENERALIST_CATEGORY = 'generalist'

const GENERALIST_HINTS = new Set([
  'english',
  'verbal',
  'verbal-reasoning',
  'behavioural',
  'behavioral',
  'general',
  'logical-reasoning',
  'numerical',
  'mcq',
  'other',
])

const LANGUAGE_RULES: { id: string; label: string; patterns: RegExp[] }[] = [
  { id: 'python', label: 'Python', patterns: [/\bpython\b/i, /\bdef\s+\w+\s*\(/, /\bimport\s+(numpy|pandas|pytest|math)\b/i, /\bprint\s*\(/] },
  { id: 'sql', label: 'SQL', patterns: [/\bsql\b/i, /\bselect\b[\s\S]{0,200}\bfrom\b/i, /\binsert\s+into\b/i, /\bupdate\s+\w+\s+set\b/i, /\bjoin\b/i, /\bpostgres(?:ql)?\b/i, /\bmysql\b/i] },
  { id: 'javascript', label: 'JavaScript', patterns: [/\bjavascript\b/i, /\btypescript\b/i, /\bnode\.?js\b/i, /\breact\b/i, /\bconst\s+\w+\s*=/, /\=\>\s*\{/] },
  { id: 'java', label: 'Java', patterns: [/\bjava\b/i, /\bpublic\s+(?:static\s+)?class\b/, /System\.out\.println/] },
  { id: 'cpp', label: 'C++', patterns: [/\bc\+\+\b/i, /\bstd::\b/, /#include\s*[<"]/] },
  { id: 'c', label: 'C', patterns: [/\bc programming\b/i, /#include\s*<stdio/i, /\bscanf\s*\(/, /\bprintf\s*\(/] },
  { id: 'go', label: 'Go', patterns: [/\bgolang\b/i, /\bpackage\s+main\b/, /\bfunc\s+main\s*\(\)/] },
  { id: 'rust', label: 'Rust', patterns: [/\brust\b/i, /\bfn\s+main\s*\(/, /\bownership\b/i, /\bimpl\s+\w+/] },
  { id: 'r', label: 'R', patterns: [/\br programming\b/i, /\bggplot\b/i, /\bdplyr\b/i, /\bdata\.frame\b/i] },
  { id: 'ruby', label: 'Ruby', patterns: [/\bruby\b/i, /\bdef\s+\w+[\s\S]{0,80}\bend\b/m] },
  { id: 'php', label: 'PHP', patterns: [/\bphp\b/i, /<\?php/, /\$\w+\s*=/] },
  { id: 'kotlin', label: 'Kotlin', patterns: [/\bkotlin\b/i, /\bfun\s+main\s*\(/] },
  { id: 'swift', label: 'Swift', patterns: [/\bswift\b/i, /\bvar\s+\w+:\s*\w+/] },
  { id: 'csharp', label: 'C#', patterns: [/\bc#\b/i, /\busing\s+System;/, /\bnamespace\s+\w+/] },
]

const CATEGORY_LABELS: Record<string, string> = {
  [GENERALIST_CATEGORY]: 'Generalist',
  'ai-ml': 'AI / ML',
  'data-science': 'Data Science',
  'coding-other': 'Coding (Other)',
  coding: 'Coding (Other)',
  onboarding: 'Onboarding / Compliance',
  technical: 'Technical',
}

const CATEGORY_SORT_ORDER = [
  GENERALIST_CATEGORY,
  'python',
  'sql',
  'javascript',
  'typescript',
  'java',
  'cpp',
  'c',
  'csharp',
  'go',
  'rust',
  'kotlin',
  'swift',
  'ruby',
  'php',
  'r',
  'ai-ml',
  'data-science',
  'coding-other',
  'coding',
  'technical',
  'onboarding',
]

function normalizeHint(hint?: string | null): string {
  return (hint ?? '').trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')
}

function looksLikeCode(text: string): boolean {
  return /```|def\s+\w+\s*\(|function\s+\w+|class\s+\w+|=\>|#include|SELECT\s+.+\s+FROM|\bpublic\s+class\b|\bconst\s+\w+\s*=/i.test(text)
}

function isGeneralistQuestion(question: string, hint?: string | null): boolean {
  const h = normalizeHint(hint)
  if (h && GENERALIST_HINTS.has(h)) return true

  const q = question.toLowerCase()
  const generalPatterns = [
    /verbal\s+reasoning/,
    /reading\s+comprehension/,
    /\bgrammar\b/,
    /\bvocabulary\b/,
    /behaviou?ral/,
    /personality/,
    /situational\s+judg?ement/,
    /english\s+language/,
    /communication\s+skills/,
    /write\s+(a|an)\s+(essay|paragraph|response)/,
    /describe\s+a\s+time/,
    /tell\s+us\s+about/,
    /why\s+do\s+you\s+want/,
    /what\s+is\s+your\s+(favorite|favourite)/,
    /video\s+question/,
    /spoken\s+response/,
  ]
  if (generalPatterns.some((p) => p.test(q))) return true

  if (!looksLikeCode(q) && /^(what|why|how|describe|explain|discuss|tell)\b/i.test(q.trim())) {
    if (!/\b(implement|algorithm|function|complexity|array|loop|variable|code)\b/i.test(q)) {
      if (/\b(english|verbal|communication|essay|opinion|experience|holiday|behavior)\b/i.test(q)) {
        return true
      }
    }
  }

  return false
}

function detectLanguageCategory(question: string): string | null {
  for (const rule of LANGUAGE_RULES) {
    if (rule.patterns.some((p) => p.test(question))) return rule.id
  }
  return null
}

/** Classify a solved question into a specific assessment category. */
export function classifySolvedQuestionCategory(question: string, hint?: string | null): string {
  const h = normalizeHint(hint)

  if (isGeneralistQuestion(question, hint)) return GENERALIST_CATEGORY

  const language = detectLanguageCategory(question)
  if (language) return language

  if (h === 'ai-ml' || h === 'data-science') return h
  if (h === 'coding' || h === 'technical') {
    return looksLikeCode(question) ? 'coding-other' : GENERALIST_CATEGORY
  }
  if (h === 'onboarding') return 'onboarding'

  if (looksLikeCode(question)) return 'coding-other'

  return GENERALIST_CATEGORY
}

export function getSolvedCategoryLabel(id: string): string {
  const key = id.toLowerCase()
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key]
  const lang = LANGUAGE_RULES.find((r) => r.id === key)
  if (lang) return lang.label
  return id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function sortSolvedCategoryKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ai = CATEGORY_SORT_ORDER.indexOf(a.toLowerCase())
    const bi = CATEGORY_SORT_ORDER.indexOf(b.toLowerCase())
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return getSolvedCategoryLabel(a).localeCompare(getSolvedCategoryLabel(b))
  })
}
