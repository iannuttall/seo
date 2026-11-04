import { sentencesOf, words } from './text.js'
import type {
  Block,
  BlockKind,
  Doc,
  LintLevel,
  LintPreset,
  Sentence,
} from './types.js'

export type RuleLevel = LintLevel | 'off'

export type RuleInfo = {
  id: string
  // ai: a pattern common in AI-written text. copy: a weak-copy or house
  // style rule. seo: titles, descriptions and headings.
  family: 'ai' | 'copy' | 'seo'
  level: RuleLevel
  presets?: Partial<Record<LintPreset, RuleLevel>>
  description: string
}

export type Hit = {
  rule: string
  level: LintLevel
  block: Block
  start: number
  end: number
  message: string
  fix: string
  // Rule order, so overlapping hits keep the more specific rule.
  rank: number
}

export type ReviewHit = {
  lens: string
  block: Block
  start: number
  end: number
  question: string
}

// Block kinds that hold running prose.
export const PROSE: BlockKind[] = ['paragraph', 'list', 'quote', 'prop']
// Everything a person reads, including headings, labels and meta.
export const ALL: BlockKind[] = [
  'paragraph',
  'list',
  'quote',
  'prop',
  'heading',
  'label',
  'title',
  'description',
]

export function insideQuotes(
  text: string,
  start: number,
  end: number,
): boolean {
  let open = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue
    if (open < 0) {
      open = i
      continue
    }
    if (open <= start && i >= end - 1) return true
    open = -1
  }
  return false
}

export class Context {
  readonly hits: Hit[] = []
  readonly reviews: ReviewHit[] = []
  readonly words: number
  readonly proseWords: number
  private readonly cache = new Map<Block, Sentence[]>()
  private readonly ranks = new Map<string, number>()

  constructor(
    readonly doc: Doc,
    readonly preset: LintPreset,
    rules: RuleInfo[],
  ) {
    rules.forEach((rule, index) => {
      this.ranks.set(rule.id, index)
    })
    let total = 0
    let prose = 0
    for (const block of doc.blocks) {
      const count = words(block.text).length
      total += count
      if (PROSE.includes(block.kind)) prose += count
    }
    this.words = total
    this.proseWords = prose
  }

  level(rule: RuleInfo): RuleLevel {
    return rule.presets?.[this.preset] ?? rule.level
  }

  blocks(kinds: BlockKind[]): Block[] {
    return this.doc.blocks.filter((block) => kinds.includes(block.kind))
  }

  sentences(block: Block): Sentence[] {
    return sentencesOf(this.cache, block)
  }

  hit(
    rule: RuleInfo,
    block: Block,
    start: number,
    end: number,
    message: string,
    fix: string,
    level?: LintLevel,
  ) {
    const resolved = level ?? this.level(rule)
    if (resolved === 'off') return
    // A pattern inside double quotes is being mentioned, not used.
    if (rule.family === 'ai' && insideQuotes(block.norm, start, end)) return
    this.hits.push({
      rule: rule.id,
      level: resolved,
      block,
      start,
      end,
      message,
      fix,
      rank: this.ranks.get(rule.id) ?? 999,
    })
  }

  review(
    lens: string,
    block: Block,
    start: number,
    end: number,
    question: string,
  ) {
    this.reviews.push({ lens, block, start, end, question })
  }
}
