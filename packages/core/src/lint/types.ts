// Types for the writing linter. Worker-safe: no Node built-ins.

export const LINT_PRESETS = ['blog', 'landing', 'docs', 'meta'] as const
export type LintPreset = (typeof LINT_PRESETS)[number]

export const LINT_FORMATS = ['md', 'mdx', 'html', 'astro', 'text'] as const
export type LintFormat = (typeof LINT_FORMATS)[number]

export type LintLevel = 'error' | 'warning'

// What a rule or review lens looks for. ai: patterns common in AI-written
// text. copy: weak copy and house style, such as dash punctuation. seo:
// titles, descriptions and headings.
export const LINT_CATEGORIES = ['ai', 'copy', 'seo'] as const
export type LintCategory = (typeof LINT_CATEGORIES)[number]

// The largest text one lint call reads: about 200 KB, a long blog post many
// times over. Bigger input is refused before any work starts.
export const LINT_MAX_CHARS = 200_000

export type LintFinding = {
  rule: string
  category: LintCategory
  level: LintLevel
  line: number
  column: number
  // The words that matched, from the readable text (markup removed).
  excerpt: string
  message: string
  // What to write instead.
  fix: string
}

// A line for the agent or writer to judge. A pattern can find these, but
// only a reader can say whether they work.
export type LintReview = {
  lens: string
  category: LintCategory
  line: number
  column: number
  quote: string
  question: string
}

export type LintResult = {
  format: LintFormat
  preset: LintPreset
  words: number
  errors: number
  warnings: number
  // Errors and warnings by category.
  categories: Record<LintCategory, number>
  // The categories checked, when the check was limited to some.
  only?: LintCategory[]
  findings: LintFinding[]
  review: LintReview[]
}

export type LintOptions = {
  format?: LintFormat
  preset?: LintPreset
  // Rule ids or review lenses to skip everywhere.
  ignoreRules?: string[]
  // Findings and review items whose excerpt contains one of these phrases
  // (any case) are dropped.
  ignorePhrases?: string[]
  // Check only these categories; findings and review items in others are
  // not looked for.
  only?: LintCategory[]
}

// What kind of text a block holds. Rules choose the kinds they read.
export type BlockKind =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'quote'
  // A human-readable component prop or attribute, such as caption="...".
  | 'prop'
  // A short label prop, such as title or label on a card.
  | 'label'
  // The page title: frontmatter title or <title>.
  | 'title'
  // The meta description: frontmatter description or <meta>.
  | 'description'

export type LinkSpan = { start: number; end: number }

export type Block = {
  kind: BlockKind
  // Readable text with markup removed and whitespace collapsed.
  text: string
  // Apostrophes and quotes straightened, same length as text, for matching.
  norm: string
  // The source offset of each character of text.
  map: number[]
  level?: number
  field?: string
  // The heading section the block sits in, counted from 0.
  section: number
  // Link text ranges inside text.
  links: LinkSpan[]
  // True when the next block starts a new section or the document ends.
  endsSection?: boolean
}

export type Sentence = { start: number; end: number; text: string }

export type Doc = {
  source: string
  format: LintFormat
  blocks: Block[]
  // Rules switched off for one source line, from seo-lint-ignore comments.
  // A null set means every rule.
  suppressed: Map<number, Set<string> | null>
  lineStarts: number[]
}
