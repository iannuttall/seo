// The AI humanizer: seo lint's AI pattern rules, run in the browser on
// pasted text, with each finding placed back in the text and filed under
// the tell it belongs to.

import {
  type LintFinding,
  type LintReview,
  lintText,
} from '@seo/core/lint/browser'

// The most text one check reads: about 8,000 words, bounded before linting.
export const HUMANIZER_MAX_CHARS = 50_000

export type TellGroup = {
  id: string
  name: string
  // What the tell is, in one or two sentences.
  about: string
  rules: string[]
}

// The 8 tells that made up most of what a blind judge found in 24 Claude
// drafts, then everything else seo lint flags as AI writing. Each rule
// and review lens sits in one group.
export const TELL_GROUPS: TellGroup[] = [
  {
    id: 'triads',
    name: 'Forced triads',
    about:
      'Three items or clauses where the meaning needs fewer. The third is often there for rhythm. Plain lists of three are fine.',
    rules: ['triad'],
  },
  {
    id: 'not-x-but-y',
    name: 'Not X but Y',
    about:
      'A claim nobody made, set up so the real one can knock it down: "It isn\'t X, it\'s Y", or a ", not X" tail added for drama.',
    rules: [
      'negative-parallelism',
      'contrast-reframe',
      'not-because',
      'negative-reframe',
      'contrast',
    ],
  },
  {
    id: 'bold-labels',
    name: 'Bold labels on list items',
    about:
      'Every list item opens with a bold phrase, the format of a chat answer. Bold this often stops meaning anything.',
    rules: ['bold-label-bullets', 'bold-emphasis'],
  },
  {
    id: 'closers',
    name: 'One-line closers and fragments',
    about:
      'Short lines that end a paragraph with a flourish: a slogan fragment, a "No X. No Y." run, a sign-off or a "Ready to...?" question.',
    rules: [
      'pithy-fragment',
      'stock-closer',
      'generic-closer',
      'cta-question',
      'negation-countdown',
      'anaphora',
      'stranded-negation',
      'staccato',
      'mic-drop',
    ],
  },
  {
    id: 'tails',
    name: 'Comment tails ending in -ing',
    about:
      'A clause such as ", allowing..." or ", highlighting..." tacked onto a fact to say why it matters.',
    rules: ['participle-tail'],
  },
  {
    id: 'significance',
    name: 'Inflated significance',
    about:
      'Telling the reader something matters instead of showing it: "a testament to", "a pivotal moment", "serves as".',
    rules: [
      'significance-inflation',
      'copula-avoidance',
      'ai-vocabulary-cluster',
    ],
  },
  {
    id: 'sales',
    name: 'Sales words and AI words',
    about:
      'Words that claim quality without showing it, such as "stunning" or "world-class", and words far more common in AI text, such as "delve".',
    rules: ['ai-vocabulary', 'buzzword', 'marketing-phrase', 'banned-word'],
  },
  {
    id: 'strawman',
    name: 'Arguing with no one',
    about:
      'An answer to a doubt the reader never raised: "It isn\'t perfect.", "This isn\'t about...", "None of this means...".',
    rules: ['strawman'],
  },
  {
    id: 'other',
    name: 'Other AI patterns',
    about:
      "Dashes, emoji, stock openers and headings, throat clearing, chatbot leftovers and the rest of seo lint's AI rules.",
    rules: [],
  },
]

// Copy rules that read as AI writing in a pasted draft. The other copy
// rules (link text, house style headings for docs) are left out.
const COPY_RULES = new Set([
  'dash',
  'emoji',
  'exclamation',
  'heading-cliche',
  'buzzword',
  'marketing-phrase',
  'banned-word',
])

const GROUP_OF = new Map(
  TELL_GROUPS.flatMap((group) => group.rules.map((rule) => [rule, group.id])),
)

export type Tell = {
  // The rule id, or the review lens for a judgement call.
  rule: string
  group: string
  // error and warning come with a fix; review is a question to judge.
  level: 'error' | 'warning' | 'review'
  excerpt: string
  message: string
  // The fix, or the question for a review item.
  fix: string
  // Source offsets of the highlight, start inclusive, end exclusive.
  start: number
  end: number
}

export type HumanizerResult = {
  words: number
  tells: Tell[]
  counts: Record<string, number>
}

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return starts
}

const SPACE = /\s/u

// Where an excerpt ends in the source. The linter quotes readable text with
// markup removed and spaces collapsed, so walk the source from the start
// and skip what the quote left out, such as ** or a link target.
function sourceEnd(source: string, start: number, excerpt: string): number {
  const quote =
    excerpt.length >= 160 && excerpt.endsWith('...')
      ? excerpt.slice(0, -3)
      : excerpt
  let i = start
  let j = 0
  let skipped = 0
  while (j < quote.length && i < source.length && skipped < 200) {
    const want = quote[j] as string
    const have = source[i] as string
    if (want === have) {
      i++
      j++
    } else if (SPACE.test(want) && SPACE.test(have)) {
      while (i < source.length && SPACE.test(source[i] as string)) i++
      while (j < quote.length && SPACE.test(quote[j] as string)) j++
    } else {
      i++
      skipped++
    }
  }
  return Math.max(i, start + 1)
}

export function findTells(source: string): HumanizerResult {
  const text = source.slice(0, HUMANIZER_MAX_CHARS)
  const result = lintText(text, {
    format: 'md',
    preset: 'blog',
    only: ['ai', 'copy'],
  })
  const starts = lineStarts(text)
  const at = (line: number, column: number) =>
    Math.min((starts[line - 1] ?? 0) + column - 1, text.length)
  const place = (
    item: LintFinding | LintReview,
    excerpt: string,
  ): { start: number; end: number } => {
    const start = at(item.line, item.column)
    return { start, end: sourceEnd(text, start, excerpt) }
  }

  const tells: Tell[] = []
  for (const finding of result.findings) {
    if (finding.category === 'copy' && !COPY_RULES.has(finding.rule)) continue
    let span = place(finding, finding.excerpt)
    // A dash finding quotes the words around the dash. Mark the dash.
    if (finding.rule === 'dash') {
      const dash = /[\u2013\u2014]| - /u.exec(text.slice(span.start, span.end))
      if (dash) {
        const start = span.start + dash.index + (dash[0].length > 1 ? 1 : 0)
        span = { start, end: start + 1 }
      }
    }
    tells.push({
      rule: finding.rule,
      group: GROUP_OF.get(finding.rule) ?? 'other',
      level: finding.level,
      excerpt: finding.excerpt,
      message: finding.message,
      fix: finding.fix,
      ...span,
    })
  }
  for (const item of result.review) {
    if (item.category !== 'ai') continue
    tells.push({
      rule: item.lens,
      group: GROUP_OF.get(item.lens) ?? 'other',
      level: 'review',
      excerpt: item.quote,
      message: '',
      fix: item.question,
      ...place(item, item.quote),
    })
  }
  tells.sort(
    (a, b) =>
      a.start - b.start || a.end - b.end || a.rule.localeCompare(b.rule),
  )
  const counts = Object.fromEntries(
    TELL_GROUPS.map((group) => [
      group.id,
      tells.filter((tell) => tell.group === group.id).length,
    ]),
  )
  return { words: result.words, tells, counts }
}

// A prompt that hands the findings to any chat assistant or agent, with the
// rule that keeps the rewrite to the facts already in the text.
export function rewritePrompt(source: string, tells: Tell[]): string {
  const lines = tells.map((tell, index) => {
    const kind = tell.level === 'review' ? 'Judge' : 'Fix'
    return `${index + 1}. "${tell.excerpt}"\n   ${tell.message ? `${tell.message} ` : ''}${kind}: ${tell.fix}`
  })
  return [
    'Edit the text below so it is clear and direct for the reader. Remove the patterns listed, which get in the way of the point.',
    'Change only the lines listed. Leave every other line as it is.',
    'Use only facts the text already gives. When a fix needs a fact the text does not have, cut the phrase instead. Never add a name, number, date, quote, experience or reason.',
    'For each "Judge" item, change the line only when it fails the question.',
    '',
    'Lines to change:',
    ...lines,
    '',
    'Text:',
    source.slice(0, HUMANIZER_MAX_CHARS),
  ].join('\n')
}
