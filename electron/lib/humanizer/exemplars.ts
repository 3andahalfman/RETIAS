/**
 * Few-shot exemplars used by the LLM polish step.
 *
 * Captured during the QuillBot reverse-engineering pass: we generated a
 * representative AI-sounding sample, ran it through QuillBot in Humanize
 * mode, and recorded the input/output pair. The polish prompt embeds this
 * pair so the LLM sees exactly the kind of transformations we want.
 *
 * The output here has been lightly cleaned (stray spaces before punctuation
 * that QuillBot rendered as artifacts have been removed); the semantic
 * content is verbatim.
 *
 * To extend with paraphrase-mode exemplars, run the same workflow with
 * QuillBot's Standard / Fluency / Formal / Simple / Creative modes and
 * add entries below keyed by HumanizerMode.
 */
import type { HumanizerMode } from './rules.js'

export interface Exemplar {
  /** AI-sounding original prose. */
  input: string
  /** Humanized / paraphrased counterpart. */
  output: string
  /**
   * Free-form bullet list of WHY the transformation works — supplied to the
   * model so it doesn't blindly imitate the surface form but understands
   * the underlying moves.
   */
  notes: readonly string[]
}

const SQL_NOSQL_HUMANIZE: Exemplar = {
  input: `The choice between SQL and NoSQL databases is one of the most fundamental decisions every software engineer must navigate when designing a modern application. Both paradigms play a crucial role in the contemporary data landscape, and developing a comprehensive understanding of their respective strengths is essential for building robust, scalable systems. In order to make an informed decision, it is important to delve into the underlying architectures, query models, and operational characteristics that distinguish these two approaches.

SQL databases, also known as relational databases, organize data into structured tables consisting of rows and columns. These tables adhere to predefined schemas, which enforce data integrity at the storage layer. Furthermore, SQL databases leverage the powerful SQL query language, enabling developers to perform complex joins, aggregations, and analytical queries with remarkable efficiency. Popular examples include PostgreSQL, MySQL, and Microsoft SQL Server. It is important to note that SQL databases provide strong ACID guarantees — atomicity, consistency, isolation, and durability — which make them an excellent choice for applications where transactional integrity is non-negotiable, such as financial platforms and inventory management systems.

On the other hand, NoSQL databases offer a more flexible and schema-less approach to data storage. They are designed to handle large volumes of unstructured or semi-structured data, making them particularly well-suited for the demands of modern web and mobile applications. Moreover, NoSQL databases excel at horizontal scalability, allowing systems to grow seamlessly by adding additional nodes to a cluster. There are several flavors of NoSQL databases, including document stores like MongoDB, key-value stores like Redis, wide-column stores like Cassandra, and graph databases like Neo4j. Each variant is optimized for specific access patterns and use cases.

It is worth noting that the decision between SQL and NoSQL is not always straightforward, and the right choice depends heavily on the specific requirements of your application. For instance, if your system requires complex relational queries and strict consistency, an SQL database is typically the more appropriate option. Conversely, if your application must ingest enormous amounts of rapidly changing data with flexible schemas, a NoSQL solution may be more suitable. In many cases, modern architectures leverage both technologies in tandem, an approach known as polyglot persistence, which allows teams to take advantage of the strengths of each database type.

In conclusion, both SQL and NoSQL databases have unique advantages and limitations. By carefully evaluating your application's data model, scalability requirements, consistency needs, and operational constraints, you can make an informed decision that aligns with your long-term goals. Ultimately, understanding the trade-offs between these two paradigms is a fundamental skill that empowers engineers to architect systems that are both performant and maintainable.`,

  output: `Whether to use SQL or NoSQL databases is one of the most basic decisions that every software engineer needs to make while designing a modern application. Both paradigms are critical to the modern data landscape, and developing a full understanding of their respective strengths is key to building robust, scalable systems. To make an informed decision, it is important to dig into the underlying architectures, query models and operational characteristics that differentiate these two approaches.

SQL databases (also known as relational databases) organize data into tables of rows and columns. These tables follow predefined schemas, ensuring data integrity on the storage level. In addition, SQL databases use the powerful SQL query language. Developers can perform complex joins, aggregations, and analytical queries with great efficiency. Examples of these include PostgreSQL, MySQL and Microsoft SQL Server. One thing to note is that SQL databases give good ACID guarantees (atomicity, consistency, isolation, durability). This makes them a good fit for applications where you absolutely need transactional integrity (or you just want it). For example financial platforms, inventory management, etc.

In contrast, NoSQL databases take a more flexible and schema-less approach to data storage. They are intended to cope with huge volumes of unstructured or semi-structured data which makes them very handy for the needs of modern web and mobile applications. Moreover, NoSQL databases are highly suitable for horizontal scalability, i.e. the system can grow seamlessly by adding additional nodes to a cluster. There are several types of NoSQL databases including document stores such as MongoDB, key-value stores such as Redis, wide-column stores such as Cassandra, and graph databases such as Neo4j. Each variant is tuned for specific access patterns and use cases.

It should be noted that choosing between SQL and NoSQL is not always a straightforward decision and depends a lot on the specific requirements of your application. For example, if your system needs complex relational queries and strict consistency, a SQL database is usually the better choice. Alternatively, if your application needs to ingest huge amounts of rapidly changing data with flexible schemas, then a NoSQL solution may be more appropriate. In many cases, modern architectures use both technologies together, this is called polyglot persistence and it allows teams to use the strengths of each type of database.

SQL and NoSQL databases both have their advantages and disadvantages. Armed with a well thought out analysis of your application's data model, scalability needs, consistency requirements, and operational constraints you can make an educated decision that aligns with your long-term goals. Ultimately, understanding the trade-offs between these two paradigms is a foundational skill, equipping engineers to architect systems that are both performant and maintainable.`,

  notes: [
    'AI-tell removal: "delve into" → "dig into"; "leverage" → "use"; "Furthermore" → "In addition"; "It is important to note that" → "One thing to note is that"; "On the other hand" → "In contrast"; "Conversely" → "Alternatively"; "For instance" → "For example"; "in tandem" → "together"; "take advantage of" → "use"; "in conclusion" deleted entirely.',
    'Adjective simplification: comprehensive → full; fundamental → basic; essential → key; contemporary → modern; remarkable → great; excellent → good; enormous → huge; particularly well-suited → very handy; flavors → types; like (in list intros) → such as; optimized → tuned; informed (decision) → educated (decision); empowers → equipping.',
    'Filler removal: "In order to" → "To".',
    'Sentence restructuring: split long compound sentences at relative clauses ("X, which Y" → "X. Y") and turn enabling-clauses into independent sentences ("X, enabling Y to Z" → "X. Y can Z").',
    'Punctuation moves: convert appositive commas to parentheses for asides ("X, also known as Y," → "X (also known as Y)"); drop oxford commas in some lists.',
    'Pragmatic moves: add casual parenthetical asides where natural ("(or you just want it)"); drop Latin abbreviations like "i.e." into prose for human texture; shift register slightly more direct/conversational.',
    'Length parity: total word count within ±15% of input; paragraph structure preserved.',
    'Strict preservation: every proper noun (PostgreSQL, MongoDB, Neo4j, Cassandra), technical fact, number, and code/math token must survive unchanged.',
    // v2 additions (extracted from 4-section reverse-engineering pass on
    // argumentative / expository / reflective / analytical prose)
    'v2 closers: "In conclusion" rotates between {"In summary,", "In closing,", "To conclude,", "To wrap up,", "In the end,", "All in all,"} or deletion (~15%). When deleted mid-paragraph, capitalize the next word.',
    'v2 transitions: "Specifically" → "In particular"; "As such" → "So" / "Because of that"; "Initially" → "At first"; "In retrospect" → "Looking back"; "In essence" → "Basically" / "In short". Transition swaps are bidirectional ("Conversely" ↔ "On the other hand"; "On the other hand" → "However"/"But").',
    'v2 doubled-comparative: "increasingly X" → "more and more X" (e.g. "increasingly apparent" → "more and more apparent").',
    'v2 modal swap: "may VERB" → "might VERB" (e.g. "may benefit" → "might benefit", "may find" → "might find"). Skip when "may" begins a sentence (could be the month).',
    'v2 relative clauses: "X, in which all Y" → "X, where all the Y"; bare "in which" mid-clause → "where". Em-dashes are an acceptable substitute for parens on long asides ("X, in which Y, ..." → "X — where Y — ...").',
    'v2 reflective register: in first-person past-tense passages, prefer contractions (I\'d, didn\'t, wouldn\'t, hadn\'t) and consider splitting one long compound sentence with three parallel actions into 2-3 short sentences with rhetorical parallelism ("I had to learn X, Y, and Z" → "I had to learn X. I had to learn Y. I had to learn Z.").',
    'v2 verbose phrases: "developing a comprehensive understanding" → "a thorough understanding" / "a solid grasp"; "depends heavily on" → "is highly dependent on"; "fully functional" → "completely working"; "from the ground up" → "from scratch"; "the difficult decision" → "the tough choice"; "navigate the inherent uncertainties" → "manage the uncertainties".',
  ],
} as const

/**
 * Compact rephrase exemplar — captured by running QuillBot's Standard
 * paraphrase pass on the output of a Humanize pass (Section 4 of the v2
 * reverse-engineering, "Monolithic vs. Microservices Architectures"). This
 * is what the LLM should aim for when called as the second pass of a
 * 'humanize-strong' chain: introduce different synonyms, partially restore
 * formal vocabulary, and add transitions back — without re-introducing the
 * AI-tell phrases the Humanize pass already removed.
 */
const ANALYTICAL_REPHRASE: Exemplar = {
  input: `One of the most significant decisions modern software development teams face is whether to adopt monolithic or microservices architectures. A solid grasp of the trade-offs is crucial to making a good decision. For years, monolithic architectures—where all the parts of an application are tightly integrated and deployed as a single unit—have been the default choice for teams building new applications. Plus, monoliths come with a host of unique advantages like ease of development, ease of testing, and uncomplicated deployment workflows. However, the disadvantages of the monolithic approach become more and more apparent as applications grow in complexity and team sizes increase.`,

  output: `One of the biggest decisions modern software teams have to make is whether to use monolithic or microservices architectures. It is therefore important to understand the trade-offs involved in order to make an informed decision. For many years, the default choice for teams building new applications was monolithic architectures where all the features of an application are tightly integrated and deployed as a single unit. Plus, monoliths provide a variety of unique features such as ease of development, ease of testing, and simple deployment routines. On the other hand, the limits of the monolithic approach are becoming more and more obvious as applications are getting more and more complicated and the number of the teams is growing.`,

  notes: [
    'Rephrase = QuillBot Standard mode on already-humanized text. Same length, different synonyms, partial restoration of formal register.',
    'Synonym refresh: "significant" → "biggest"; "solid grasp" → "important to understand"; "parts" → "features"; "come with a host of" → "provide a variety of"; "like" → "such as"; "uncomplicated" → "simple"; "However" → "On the other hand"; "disadvantages" → "limits"; "apparent" → "obvious".',
    'Subject reordering: "X have been the default choice" → "the default choice ... was X" (sometimes flip subject and predicate).',
    'Progressive tense: "applications grow in complexity" → "applications are getting more and more complicated"; "team size increases" → "the number of the teams is growing".',
    'Important: do NOT re-introduce killer AI-tells the Humanize pass removed ("delve into", "leverage", "Furthermore", "It is important to note that"). It is OK to add back "On the other hand" or "Moreover" (these are common in human prose).',
    'Length: keep within ±5% of input — this is a polish pass, not a rewrite.',
  ],
} as const

/**
 * Exemplars keyed by humanizer mode. The `humanize` mode shows AI-tell
 * removal + register shift to casual; the other modes that run as a SECOND
 * pass (standard, fluency) use the rephrase exemplar so the LLM understands
 * its job is synonym refresh, not another humanization round.
 *
 * As paraphrase-mode samples are captured for the other modes, add entries
 * here and the polish prompt will pick them up automatically.
 */
export const EXEMPLARS: Record<HumanizerMode, Exemplar> = {
  humanize: SQL_NOSQL_HUMANIZE,
  standard: ANALYTICAL_REPHRASE,
  fluency:  ANALYTICAL_REPHRASE,
  formal:   SQL_NOSQL_HUMANIZE,
  simple:   SQL_NOSQL_HUMANIZE,
  creative: SQL_NOSQL_HUMANIZE,
}

// ── LLM polish prompt builder ─────────────────────────────────────────────

interface BuildPolishPromptArgs {
  mode: HumanizerMode
  /** Text already passed through applyHumanizerRules. */
  draft: string
  /** Original (pre-rules) text, included so the LLM can verify nothing
   * factual was dropped or invented during the rule pass. */
  original?: string
  /** Optional per-call style hint, e.g. "concise and direct" — appended
   * to the rule list. Useful for the existing 5-voices fan-out. */
  voiceHint?: string
}

const MODE_INSTRUCTION: Record<HumanizerMode, string> = {
  humanize: 'Polish this draft so it reads like a real human wrote it and can pass AI-detection tools. Use natural rhythm, occasional contractions, and at least one casual parenthetical aside or sentence split where it fits.',
  standard: 'Lightly polish this paraphrase. Smooth any awkward word swaps from the rule pass, but keep the register neutral and the structure close to the original.',
  fluency:  'Polish for readability: shorter sentences where they help, contractions where natural, and direct phrasing. Do not change meaning or restructure heavily.',
  formal:   'Polish in a formal register. Repair any contractions the rule pass introduced, restore precise vocabulary where the rules over-simplified, and keep an academic / professional tone throughout.',
  simple:   'Polish in plain, accessible English. Prefer short sentences, common words, and direct subject-verb-object constructions. Avoid jargon unless it survives from the original.',
  creative: 'Polish with stylistic variety: vary sentence length, drop in unusual but accurate synonyms, restructure paragraphs where it improves flow. Keep all facts intact.',
}

/**
 * Build the polish-step prompt. Single-prompt form (no separate system/user
 * split) for simplicity — Claude/OpenAI both accept this layout.
 */
export function buildPolishPrompt(args: BuildPolishPromptArgs): string {
  const ex = EXEMPLARS[args.mode]
  const modeInstruction = MODE_INSTRUCTION[args.mode]
  const voiceLine = args.voiceHint ? `\nVoice: ${args.voiceHint}\n` : ''

  return `You are the final polish stage of a custom humanizer/paraphraser pipeline. A deterministic rule pass has already swapped common AI-tell phrases. Your job is to fix anything the rules couldn't and produce text that sounds like a real person wrote it.

${modeInstruction}
${voiceLine}
Rules:
- Preserve every technical fact, number, code block, formula, and proper noun EXACTLY (e.g. PostgreSQL, MongoDB, Neo4j must survive verbatim).
- Keep total length within ±15% of the input.
- No AI-tell phrases: do NOT use "delve into", "leverage", "Furthermore", "Moreover", "It is important to note", "in tandem", "navigate the landscape", "robust", "cutting-edge", "synergy", "play a crucial role", "in conclusion".
- Vary sentence length; mix short and long sentences. Split long compound sentences at relative clauses where useful.
- Where helpful, use contractions, casual parenthetical asides, or "i.e." / "e.g." to add human texture.
- Output ONLY the polished text. No preamble, no quotes, no "Here is..." opener.

EXAMPLE INPUT (AI-sounding):
${ex.input}

EXAMPLE OUTPUT (good humanization — note the transformations: ${ex.notes[0]}):
${ex.output}

NOW POLISH THIS DRAFT:
${args.draft}`
}

/** Convenience export for tests that want to inspect the captured pairs directly. */
export const __exemplarsForTests = { SQL_NOSQL_HUMANIZE, ANALYTICAL_REPHRASE }
