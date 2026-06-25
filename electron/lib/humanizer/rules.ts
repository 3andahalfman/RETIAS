/**
 * Rule-based humanizer / paraphraser pass.
 *
 * Pure functions, zero Electron / Node-only dependencies. Safe to call in any
 * context; deterministic given a seeded RNG (default: Math.random).
 *
 * The rule catalog was derived empirically from a QuillBot Humanize input /
 * output diff captured during the design phase — see exemplars.ts for the
 * raw pair and detailed analysis comments. Each substitution targets a
 * pattern that QuillBot's Humanize mode rewrote, with mode-specific weights
 * controlling how aggressively rules fire for non-humanize paraphrase modes.
 */

export type HumanizerMode =
  | 'humanize'
  | 'standard'
  | 'fluency'
  | 'formal'
  | 'simple'
  | 'creative'

// ── Substitution rule type ────────────────────────────────────────────────

type ReplacementFn = (match: string, ...groups: string[]) => string

interface SubstitutionRule {
  pattern: RegExp
  /**
   * One of:
   *  - string: fixed replacement; empty string deletes the match.
   *  - readonly string[]: random pick from the array (uniform).
   *  - function: receives match + capture groups; return the replacement.
   *
   * Note: when the replacement is a plain string we use it as the second
   * argument to `String.replace`, which DOES interpolate `$1`, `$2`, etc.
   * Function/array paths use a callback, which does NOT interpolate, so
   * those rules should not embed `$N` placeholders unless using a function.
   */
  replacement: string | readonly string[] | ReplacementFn
  /** Per-rule fire rate (0..1). Multiplied by the mode's global rate. */
  rate?: number
  /** When true, preserve the leading-uppercase of the match in the output. */
  preserveCase?: boolean
}

function preserveLeadingCase(match: string, replacement: string): string {
  if (!match || !replacement) return replacement
  const ch = match[0]
  if (ch && ch === ch.toUpperCase() && ch !== ch.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

function applySubstitutions(
  text: string,
  rules: readonly SubstitutionRule[],
  globalRate: number,
): string {
  if (globalRate <= 0) return text
  let out = text
  for (const rule of rules) {
    const effective = (rule.rate ?? 1) * globalRate
    if (effective <= 0) continue
    const repl = rule.replacement
    out = out.replace(rule.pattern, (match: string, ...rest: unknown[]) => {
      if (Math.random() > effective) return match
      let picked: string
      if (typeof repl === 'function') {
        // Strip the trailing offset / fullString args ripgrep-style — the
        // callback signature is (match, ...groups, offset, fullString).
        const groups = rest
          .slice(0, -2)
          .map((g) => (typeof g === 'string' ? g : ''))
        picked = repl(match, ...groups)
      } else if (Array.isArray(repl)) {
        picked = repl.length === 0 ? '' : repl[Math.floor(Math.random() * repl.length)] as string
      } else {
        picked = repl as string
      }
      return rule.preserveCase ? preserveLeadingCase(match, picked) : picked
    })
  }
  return out
}

// ── AI-tell phrases & filler ─────────────────────────────────────────────
// Ordered longest-first so multi-word patterns match before their subwords.
// All entries are derived from the captured QuillBot Humanize diff (see
// exemplars.ts). The `preserveCase` flag handles sentence-initial uppercase.

const AI_TELL_RULES: readonly SubstitutionRule[] = [
  // ─── Killer closer ───
  // Section 1+2+3+4 of the v2 pass showed QuillBot replaces with a synonym
  // ~85% of the time rather than deleting. We bias toward replace, with a
  // ~15% chance of clean deletion. Capture the next character so we can
  // capitalise it when deleting mid-sentence — otherwise the closer
  // (which often appears mid-paragraph, not at a paragraph start) leaves
  // a lowercase letter dangling at the start of the next sentence.
  { pattern: /\bIn conclusion,\s*(\S)/g, replacement: (_m, next) => {
    const r = Math.random()
    if (r < 0.15) return next.toUpperCase()
    const opts = ['In summary, ', 'In closing, ', 'To conclude, ', 'To wrap up, ', 'In the end, ', 'All in all, ']
    return opts[Math.floor(Math.random() * opts.length)] + next
  } },
  { pattern: /\bTo conclude,\s*(\S)/g, replacement: (_m, next) => {
    const r = Math.random()
    if (r < 0.15) return next.toUpperCase()
    const opts = ['In closing, ', 'In summary, ', 'To wrap up, ']
    return opts[Math.floor(Math.random() * opts.length)] + next
  }, rate: 0.5 },
  { pattern: /\bAt the end of the day,\s*(\S)/g, replacement: (_m, next) => next.toUpperCase() },

  // ─── Hedging / "note that" openers ───
  // v2 sections showed more variants — added below.
  { pattern: /\bIt is important to note that\b/g, replacement: [
    'One thing to note is that',
    'It should be noted that',
    'Worth pointing out:',
    'Importantly,',
    'As a matter of fact,',
    'It is crucial to emphasize that',
    'In retrospect,',
  ] },
  { pattern: /\bIt is worth noting that\b/g, replacement: [
    'It should be noted that',
    'Note that',
    'Worth pointing out:',
    "It's worth mentioning that",
    'It is also worth noting that',
  ] },
  { pattern: /\bIt should be noted that\b/g, replacement: [
    'It is worth noting that',
    'Note that',
    'Worth pointing out:',
    "It's worth mentioning that",
    'It should be remembered, however, that',
  ], rate: 0.4 },

  // ─── Filler stripping ───
  { pattern: /\bIn order to\b/g, replacement: 'To', preserveCase: false },
  { pattern: /\bin order to\b/g, replacement: 'to' },
  { pattern: /\bAt the end of the day,\s*/g, replacement: '' },

  // ─── Verbose verb phrases ───
  // Preserve subject-verb agreement by inspecting the original verb suffix.
  { pattern: /\bplay(s|ed)? a (crucial|critical|key|vital|significant|pivotal) role in\b/gi, replacement: (_m, suffix) => {
    const opts = suffix === 's'
      ? ['is critical to', 'matters for', 'drives']
      : suffix === 'ed'
        ? ['was critical to', 'mattered for', 'drove']
        : ['are critical to', 'matter for', 'drive']
    return opts[Math.floor(Math.random() * opts.length)]
  }, preserveCase: true },
  { pattern: /\btake advantage of\b/gi, replacement: ['use', 'tap into'], preserveCase: true },
  { pattern: /\bin tandem\b/gi, replacement: 'together' },
  { pattern: /\bin conjunction with\b/gi, replacement: 'with' },

  // ─── Single AI-tell verbs ───
  { pattern: /\bdelve into\b/gi, replacement: ['dig into', 'examine', 'look at'], preserveCase: true },
  // "tap" alone is intransitive in this sense; only use "use"/"rely on" which
  // are safely transitive. "tap into" is preserved for `take advantage of`.
  { pattern: /\bleverage\b/gi, replacement: ['use', 'rely on', 'make use of', 'apply'], preserveCase: true },
  { pattern: /\bleverages\b/gi, replacement: ['uses', 'relies on', 'applies'], preserveCase: true },
  { pattern: /\bleveraging\b/gi, replacement: ['using', 'relying on', 'applying'], preserveCase: true },
  { pattern: /\bnavigate\b/gi, replacement: ['handle', 'work through', 'manage', 'deal with'], preserveCase: true, rate: 0.6 },
  // "empowers X to Y" → "lets X Y" / "helps X Y" (drop the `to`, since lets/help
  // take a bare infinitive). Order this BEFORE the bare-empowers rule so the
  // longer pattern wins.
  { pattern: /\bempowers? (\w+(?:\s+\w+){0,2}?) to\b/g, replacement: (_m, who) => {
    const verb = Math.random() < 0.5 ? 'lets' : 'helps'
    return `${verb} ${who}`
  }, preserveCase: true },
  // Bare "empowers" without a following "to" — keep an infinitive-friendly swap.
  { pattern: /\bempowers?\b/gi, replacement: ['enables', 'helps'], preserveCase: true },
  { pattern: /\bempowering\b/gi, replacement: ['enabling', 'helping'], preserveCase: true },
  { pattern: /\boptimized?\b/gi, replacement: ['tuned', 'built', 'set up'], preserveCase: true, rate: 0.7 },

  // ─── Transition swaps ───
  // v2 pass showed QuillBot picks from a noticeably bigger pool than v1 and
  // is bidirectional (Conversely ↔ On the other hand both fire). Pools were
  // expanded accordingly.
  { pattern: /\bFurthermore,\s*/g, replacement: ['Also, ', 'In addition, ', 'Plus, ', 'On top of that, ', 'And '] },
  { pattern: /\bMoreover,\s*/g, replacement: ['Also, ', 'Plus, ', 'On top of that, ', 'Additionally, ', 'And '], rate: 0.7 },
  { pattern: /\bAdditionally,\s*/g, replacement: ['Also, ', 'Plus, ', 'Moreover, ', 'On top of that, '] },
  { pattern: /\bOn the other hand,\s*/g, replacement: ['In contrast, ', 'By contrast, ', 'Meanwhile, ', 'However, ', 'But '] },
  { pattern: /\bConversely,\s*/g, replacement: ['Alternatively, ', 'On the flip side, ', 'By contrast, ', 'On the other hand, ', 'But '] },
  // "For instance," → just "For example," — keeping the same sentence shape
  // is safer than "Take, for example," because the imperative aside doesn't
  // play well when the following clause already has its own subject.
  { pattern: /\bFor instance,\s*/g, replacement: ['For example, ', 'As an example, '] },
  { pattern: /\bAs such,\s*/g, replacement: ['So, ', 'That means, ', 'Because of that, '] },
  { pattern: /\bIn essence,\s*/g, replacement: ['Basically, ', 'Essentially, ', 'In short, '] },
  { pattern: /\bUltimately,\s*/g, replacement: ['In the end, ', 'When it comes down to it, ', 'In the long run, '], rate: 0.6 },
  { pattern: /\bSpecifically,\s*/g, replacement: ['In particular, ', 'More specifically, '] },
  { pattern: /\bInitially,\s*/g, replacement: ['At first, ', 'To start, '] },
  { pattern: /\bIn retrospect,\s*/g, replacement: ['Looking back, ', 'On reflection, '] },
  { pattern: /\bIn addition to\b/gi, replacement: ['Beyond', 'On top of', 'Alongside'], preserveCase: true, rate: 0.6 },
  { pattern: /\bAs a result,\s*/g, replacement: ['So, ', 'Because of that, ', 'That means '], rate: 0.6 },

  // ─── Adjective simplification ───
  // v2 expanded the alternative pools and added several entries seen across
  // multiple sections (consequential→big, comprehensive→complete/solid, etc.)
  { pattern: /\bcomprehensive\b/gi, replacement: ['full', 'thorough', 'complete', 'solid', 'good'], preserveCase: true },
  { pattern: /\bfundamental\b/gi, replacement: ['basic', 'core', 'foundational'], preserveCase: true, rate: 0.7 },
  // 'key' was dropped from the array because "is essential for" + 'key'
  // produces "is key for X" which reads awkwardly; the remaining options
  // compose cleanly with "for" or stand alone.
  { pattern: /\bessential\b/gi, replacement: ['vital', 'a prerequisite', 'critical'], preserveCase: true },
  { pattern: /\bcontemporary\b/gi, replacement: 'modern', preserveCase: true },
  { pattern: /\bremarkable\b/gi, replacement: ['great', 'impressive', 'striking'], preserveCase: true },
  { pattern: /\bexcellent\b/gi, replacement: ['good', 'great'], preserveCase: true, rate: 0.8 },
  { pattern: /\benormous\b/gi, replacement: ['huge', 'massive'], preserveCase: true },
  { pattern: /\bparticularly well-suited\b/gi, replacement: ['very handy', 'a great fit', 'highly suited'], preserveCase: true },
  { pattern: /\binformed (decision|choice)\b/gi, replacement: (_m, w) => `educated ${w}`, preserveCase: true },
  { pattern: /\brobust\b/gi, replacement: ['solid', 'reliable', 'sturdy'], preserveCase: true, rate: 0.6 },
  { pattern: /\bseamlessly\b/gi, replacement: ['cleanly', 'smoothly', 'without friction'], preserveCase: true, rate: 0.7 },
  { pattern: /\bcrucial\b/gi, replacement: ['key', 'critical', 'central'], preserveCase: true, rate: 0.6 },
  { pattern: /\bvarious\b/gi, replacement: ['several', 'different', 'a few'], preserveCase: true, rate: 0.5 },
  { pattern: /\bconsequential\b/gi, replacement: ['significant', 'big', 'major'], preserveCase: true },
  { pattern: /\bsignificant(?!ly)\b/gi, replacement: ['big', 'major', 'substantial'], preserveCase: true, rate: 0.5 },
  { pattern: /\bsignificantly\b/gi, replacement: ['a lot', 'noticeably'], preserveCase: true, rate: 0.4 },
  { pattern: /\bambitious\b/gi, replacement: ['quite a challenge', 'demanding'], preserveCase: true, rate: 0.6 },
  { pattern: /\bvaluable\b/gi, replacement: ['essential', 'important'], preserveCase: true, rate: 0.5 },
  { pattern: /\bprofound\b/gi, replacement: ['deep', 'lasting'], preserveCase: true },
  { pattern: /\blasting\b/gi, replacement: ['enduring', 'long-term'], preserveCase: true, rate: 0.6 },
  { pattern: /\bpowerful\b/gi, replacement: ['great', 'strong'], preserveCase: true, rate: 0.6 },
  { pattern: /\belegant\b/gi, replacement: ['clean', 'beautiful'], preserveCase: true, rate: 0.5 },
  { pattern: /\bintimidating\b/gi, replacement: ['frightening', 'daunting'], preserveCase: true },
  { pattern: /\bcompetent\b/gi, replacement: ['professional', 'capable'], preserveCase: true, rate: 0.7 },
  // 'fancy' was dropped — too casual for the technical contexts where
  // 'sophisticated' usually appears (deployment infra, ML systems, etc.)
  { pattern: /\bsophisticated\b/gi, replacement: ['advanced', 'complex'], preserveCase: true, rate: 0.4 },
  { pattern: /\bstraightforward\b/gi, replacement: ['simple', 'uncomplicated'], preserveCase: true, rate: 0.6 },
  { pattern: /\bdistinct\b/gi, replacement: ['unique', 'separate'], preserveCase: true, rate: 0.5 },

  // ─── Nouns ───
  { pattern: /\bflavors? of\b/gi, replacement: ['types of', 'kinds of'], preserveCase: true },
  { pattern: /\bplethora of\b/gi, replacement: ['lots of', 'plenty of', 'a wide range of'], preserveCase: true },
  { pattern: /\brealm of\b/gi, replacement: ['world of', 'space of', 'area of'], preserveCase: true },
  { pattern: /\blandscape\b/gi, replacement: ['space', 'world', 'environment'], preserveCase: true, rate: 0.5 },
  { pattern: /\bcomponents?\b/gi, replacement: ['parts', 'pieces'], preserveCase: true, rate: 0.5 },
  { pattern: /\bchallenges?\b/gi, replacement: ['hurdles', 'obstacles'], preserveCase: true, rate: 0.4 },
  { pattern: /\busers?\b/gi, replacement: ['consumers', 'customers'], preserveCase: true, rate: 0.25 },
  { pattern: /\berrors?\b/gi, replacement: ['issues', 'problems'], preserveCase: true, rate: 0.4 },

  // ─── v2 verbose-phrase patterns (multi-word swaps from the 4-section pass) ───
  // The longer multi-word phrases below would never match if the single-word
  // adjective rules above fired first (e.g. `comprehensive` standalone would
  // get swapped before `developing a comprehensive understanding` could match).
  // We keep these patterns here for readability but rely on the fact that
  // `comprehensive` rule's case-insensitive flag plus the fact we DON'T
  // include `comprehensive` in its replacement array means even if the long
  // phrase loses, the result is still acceptable.
  // The `is essential for` longer phrase was intentionally dropped — the
  // single-word `essential` → ['key', 'vital', 'a prerequisite'] rule already
  // yields "is a prerequisite for" when 'a prerequisite' is picked.
  { pattern: /\bdeveloping a comprehensive understanding\b/gi, replacement: [
    'a thorough understanding', 'a solid grasp', 'a good understanding', 'a complete grasp',
  ], preserveCase: true },
  { pattern: /\bthorough understanding\b/gi, replacement: ['solid grasp', 'complete grasp', 'good understanding'], preserveCase: true, rate: 0.6 },
  { pattern: /\bdepends heavily on\b/gi, replacement: ['is highly dependent on', 'rests on', 'comes down to'], preserveCase: true },
  { pattern: /\bset out to (build|create|develop|design)\b/gi, replacement: (_m, v) => {
    const opts = [`decided to ${v}`, `started to ${v}`]
    return opts[Math.floor(Math.random() * opts.length)]
  }, preserveCase: true, rate: 0.7 },
  { pattern: /\bfully functional\b/gi, replacement: ['completely working', 'fully working'], preserveCase: true },
  { pattern: /\bfrom the ground up\b/gi, replacement: ['from scratch', 'starting from zero'], preserveCase: true },
  { pattern: /\bdid not anticipate\b/gi, replacement: ["didn't expect", "didn't see coming"], preserveCase: true },
  { pattern: /\bthe extent to which\b/gi, replacement: ['how much', 'just how much'], preserveCase: true },
  { pattern: /\breshape\b/gi, replacement: ['change', 'shift'], preserveCase: true, rate: 0.7 },
  { pattern: /\bembarked on\b/gi, replacement: ['began', 'started', 'kicked off'], preserveCase: true },
  { pattern: /\bunderestimated\b/gi, replacement: ['misjudged', 'underestimated', 'underrated'], preserveCase: true, rate: 0.6 },
  { pattern: /\bthe sheer volume\b/gi, replacement: ['the magnitude', 'the size'], preserveCase: true },
  { pattern: /\bevery (\w+) I could imagine\b/gi, replacement: (_m, n) => `everything I could think of`, preserveCase: true, rate: 0.7 },
  { pattern: /\battempted to (\w+)\b/gi, replacement: (_m, v) => `tried to ${v}`, preserveCase: true, rate: 0.6 },
  { pattern: /\bdrastically reduce\b/gi, replacement: ['substantially narrow', 'cut down'], preserveCase: true },
  { pattern: /\bthe difficult decision\b/gi, replacement: ['the tough choice', 'the hard call'], preserveCase: true, rate: 0.7 },
  { pattern: /\bnot solely about\b/gi, replacement: ['not only about', 'not just about'], preserveCase: true },
  { pattern: /\bdeliver(s|ed)?\b/gi, replacement: (_m, suffix) => suffix === 's' ? 'provides' : suffix === 'ed' ? 'provided' : 'provide', preserveCase: true, rate: 0.3 },
  { pattern: /\b(alone|by oneself)\b(?=[\s,.;:!?]|$)/gi, replacement: ['by myself', 'on my own', 'alone'], preserveCase: true, rate: 0.4 },
  { pattern: /\bforced (me|us|him|her|them) to develop\b/gi, replacement: (_m, who) => {
    const opts = [`helped ${who} acquire`, `pushed ${who} to develop`]
    return opts[Math.floor(Math.random() * opts.length)]
  }, preserveCase: true, rate: 0.6 },
  { pattern: /\btake on\b/gi, replacement: ['undertake', 'tackle'], preserveCase: true, rate: 0.4 },

  // ─── v2 syntactic / structural micro-patterns ───
  // "increasingly X" → "more and more X" — universal across all sections.
  { pattern: /\bincreasingly\s+(\w+)\b/gi, replacement: (_m, adj) => `more and more ${adj}`, preserveCase: true, rate: 0.7 },
  // "in which all X" → "where all the X" (formal relative clause → casual)
  { pattern: /\bin which all\b/gi, replacement: ['where all the', 'where each of the'], preserveCase: true, rate: 0.7 },
  // Bare "in which" → "where" outside of code/math
  { pattern: /,\s*in which\b/gi, replacement: ', where', rate: 0.5 },
  // Modal swap — "may VERB" → "might VERB". Case-sensitive pattern so the
  // month name "May" is excluded (it's always capitalised at sentence start).
  { pattern: /\bmay (\w+)\b/g, replacement: (_m, verb) => `might ${verb}`, rate: 0.4 },
  // "rapid X" → "fast X" — keep the noun, swap only the modifier.
  { pattern: /\brapid (deployment|growth|adoption|development|expansion|evolution|roll-?out)\b/gi, replacement: (_m, noun) => `fast ${noun}`, preserveCase: true, rate: 0.5 },
  // Convert "X, which Y" mid-sentence to a less typical structure occasionally
  // — left intentionally for LLM polish; rule-based splits are too brittle.

  // ─── List intros ───
  // "stores like MongoDB" → "stores such as MongoDB" only when introducing
  // a proper noun (avoid mangling "feels like" or "looks like").
  { pattern: /\b(stores?|engines?|tools?|systems?|frameworks?|databases?|languages?|services?|platforms?|architectures?) like ([A-Z])/g, replacement: (_m, prefix, letter) => `${prefix} such as ${letter}` },
] as const

// ── Contraction rules ─────────────────────────────────────────────────────
// Lowercase + Capitalised variants — `pattern` matches whole-word boundaries
// so "It is important..." becomes "It's important..." but "deposit" stays put.

// A regex lookbehind that prevents contractions when the pronoun is the
// object of a preposition. Without this guard, "understanding of it is vital"
// contracts to "understanding of it's vital", which reads as a possessive
// and breaks the sentence. The list covers the most common English
// prepositions found in technical prose.
const PREP_GUARD = '(?<!\\b(?:of|to|in|by|for|with|about|on|at|over|under|from|into|through|across|during|toward|within|without)\\s)'

const CONTRACTION_RULES: readonly SubstitutionRule[] = [
  { pattern: new RegExp(`${PREP_GUARD}\\bit is\\b`, 'g'), replacement: "it's" },
  { pattern: /\bIt is\b/g, replacement: "It's" },
  { pattern: new RegExp(`${PREP_GUARD}\\bthat is\\b`, 'g'), replacement: "that's", rate: 0.7 },
  { pattern: /\bThat is\b/g, replacement: "That's", rate: 0.7 },
  { pattern: /\bthere is\b/g, replacement: "there's" },
  { pattern: /\bThere is\b/g, replacement: "There's" },
  { pattern: /\bwhat is\b/g, replacement: "what's" },
  { pattern: /\bWhat is\b/g, replacement: "What's" },
  { pattern: /\byou are\b/g, replacement: "you're" },
  { pattern: /\bYou are\b/g, replacement: "You're" },
  { pattern: /\bwe are\b/g, replacement: "we're" },
  { pattern: /\bWe are\b/g, replacement: "We're" },
  { pattern: /\bthey are\b/g, replacement: "they're" },
  { pattern: /\bThey are\b/g, replacement: "They're" },
  { pattern: /\bdo not\b/g, replacement: "don't" },
  { pattern: /\bDo not\b/g, replacement: "Don't" },
  { pattern: /\bdoes not\b/g, replacement: "doesn't" },
  { pattern: /\bDoes not\b/g, replacement: "Doesn't" },
  { pattern: /\bdid not\b/g, replacement: "didn't" },
  { pattern: /\bDid not\b/g, replacement: "Didn't" },
  { pattern: /\bcannot\b/g, replacement: "can't" },
  { pattern: /\bCannot\b/g, replacement: "Can't" },
  { pattern: /\bwill not\b/g, replacement: "won't" },
  { pattern: /\bWill not\b/g, replacement: "Won't" },
  { pattern: /\bwould not\b/g, replacement: "wouldn't" },
  { pattern: /\bcould not\b/g, replacement: "couldn't" },
  { pattern: /\bshould not\b/g, replacement: "shouldn't" },
  { pattern: /\bhas not\b/g, replacement: "hasn't", rate: 0.8 },
  { pattern: /\bhave not\b/g, replacement: "haven't", rate: 0.8 },
  { pattern: /\bhad not\b/g, replacement: "hadn't", rate: 0.8 },
  { pattern: /\bI am\b/g, replacement: "I'm" },
  { pattern: /\bI have\b/g, replacement: "I've", rate: 0.6 },
  { pattern: /\bI will\b/g, replacement: "I'll", rate: 0.6 },
  // Note: leave "is not" alone — "isn't" can sound jarring in technical prose
] as const

// ── Syntactic transformations ────────────────────────────────────────────
// Limited to deterministic, pattern-based rewrites that hold up out of
// context. Anything requiring real parsing is deferred to the LLM polish
// step downstream.

/**
 * Convert `<noun>, also known as <alias>, ...` to `<noun> (also known as <alias>) ...`.
 * Matches the parenthetical-aside transform QuillBot applied in the diff.
 */
function commasToParens(text: string): string {
  return text.replace(
    /([A-Za-z][A-Za-z0-9 ]+?), also known as ([^,]+?),/g,
    '$1 (also known as $2)',
  )
}

/**
 * Strip the QuillBot artifact of stray spaces before punctuation.
 * E.g. "schemas ," → "schemas,"   "( atomicity ," → "(atomicity,"
 */
function fixPunctuationSpacing(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, '$1')         // " ," → ","
    .replace(/\(\s+/g, '(')                    // "( x" → "(x"
    .replace(/\s+\)/g, ')')                    // "x )" → "x)"
}

/**
 * Repair `a`/`an` agreement after a swap may have changed the following
 * word's leading sound. Pure first-letter heuristic — imperfect for silent-h
 * ("an hour") and yu- ("a unit"), but those are rare in technical prose and
 * the swap rules don't introduce them. Idempotent.
 */
function fixArticles(text: string): string {
  return text.replace(/\b(a|an|A|An)\b(\s+)([A-Za-z])/g, (_m, art, space, ch) => {
    const isVowelSound = /[aeiouAEIOU]/.test(ch)
    const lowerWanted = isVowelSound ? 'an' : 'a'
    const cap = art[0] === art[0].toUpperCase()
    const corrected = cap ? lowerWanted[0].toUpperCase() + lowerWanted.slice(1) : lowerWanted
    return `${corrected}${space}${ch}`
  })
}

/**
 * After deleting sentence-leading phrases (e.g. "In conclusion,") the next
 * paragraph may begin with a lowercase letter. Capitalise the first
 * alphabetic character of each paragraph and after explicit deletions of
 * sentence openers. Limited to paragraph boundaries to avoid clobbering
 * mid-sentence abbreviations like "e.g." or "i.e.".
 */
function capitalizeAfterParaBreak(text: string): string {
  return text.replace(/(^|\n\n+|\n)([a-z])/g, (_m, prefix, ch) => prefix + ch.toUpperCase())
}

/**
 * Collapse runs of 3+ blank lines down to a single paragraph break.
 * Cheap safety net for over-aggressive substitutions that delete a line.
 */
function normaliseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n')
}

// ── Mode-specific weights ────────────────────────────────────────────────

interface ModeWeights {
  /** Multiplier on AI-tell rule rates (0 disables, 1 = full). */
  aiTells: number
  /** Multiplier on contraction rule rates. */
  contractions: number
  /** When true, run the syntactic transforms (commasToParens etc.). */
  enableSyntax: boolean
  /** When true, strip filler phrases like "In order to". */
  removeFiller: boolean
}

/**
 * Per-mode rule-pass weights. The Humanize values come straight from the
 * QuillBot diff. The other 5 modes are extrapolated defaults documented
 * in the plan — they will be refined when the user runs QuillBot in each
 * mode and we capture additional input/output pairs.
 */
const MODE_WEIGHTS: Record<HumanizerMode, ModeWeights> = {
  // Anchored to the empirical QuillBot Humanize sample.
  humanize: { aiTells: 0.9,  contractions: 0.5, enableSyntax: true,  removeFiller: true  },
  // Light rewording — Standard is QuillBot's default neutral paraphrase.
  standard: { aiTells: 0.55, contractions: 0.2, enableSyntax: true,  removeFiller: true  },
  // Readability cleanup — heavier contractions, lighter restructuring.
  fluency:  { aiTells: 0.6,  contractions: 0.6, enableSyntax: false, removeFiller: true  },
  // Register elevation — keep formal vocab, no contractions, no filler kills.
  formal:   { aiTells: 0.25, contractions: 0,   enableSyntax: false, removeFiller: false },
  // Register reduction — strong simplification, lots of contractions.
  simple:   { aiTells: 0.9,  contractions: 0.75, enableSyntax: true, removeFiller: true  },
  // Heaviest restructuring — full AI-tell scrub plus syntactic moves.
  creative: { aiTells: 0.85, contractions: 0.4, enableSyntax: true,  removeFiller: true  },
}

// ── Public orchestrator ───────────────────────────────────────────────────

export interface ApplyOptions {
  /** Override the mode's default weights. */
  weights?: Partial<ModeWeights>
}

/**
 * Run the full rule pipeline for the requested mode.
 *
 * Order matters: AI-tell substitutions FIRST (so "It is important to note
 * that..." is replaced before contractions could turn "It is" into "It's"
 * mid-pattern), then contractions, then syntactic cleanup, then artifact
 * normalisation.
 */
export function applyHumanizerRules(
  text: string,
  mode: HumanizerMode = 'humanize',
  opts: ApplyOptions = {},
): string {
  if (!text || !text.trim()) return text
  const weights: ModeWeights = { ...MODE_WEIGHTS[mode], ...opts.weights }

  let out = text

  // 1. AI-tell substitutions (lexical layer)
  const lexicalRules = weights.removeFiller
    ? AI_TELL_RULES
    : AI_TELL_RULES.filter((r) => r.replacement !== '')
  out = applySubstitutions(out, lexicalRules, weights.aiTells)

  // 2. Contractions (syntactic-lite layer)
  out = applySubstitutions(out, CONTRACTION_RULES, weights.contractions)

  // 3. Syntactic rewrites
  if (weights.enableSyntax) {
    out = commasToParens(out)
  }

  // 4. Cleanup (order matters: spacing before articles so we don't see
  // a stray-space artifact like "an  good"; recap last so it sees clean
  // paragraph boundaries.)
  out = fixPunctuationSpacing(out)
  out = fixArticles(out)
  out = normaliseBlankLines(out)
  out = capitalizeAfterParaBreak(out)

  return out.trim() === text.trim() ? text : out
}

// ── Helpers exported for testability and external use ────────────────────

export const __internals = {
  applySubstitutions,
  preserveLeadingCase,
  commasToParens,
  fixPunctuationSpacing,
  fixArticles,
  capitalizeAfterParaBreak,
  normaliseBlankLines,
  AI_TELL_RULES,
  CONTRACTION_RULES,
  MODE_WEIGHTS,
}
