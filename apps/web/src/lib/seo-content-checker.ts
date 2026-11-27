// The SEO content checker: every seo lint rule, run in the browser on
// pasted Markdown or HTML, with the heading outline beside the findings.

import {
  type LintCategory,
  type LintFormat,
  type LintPreset,
  lintText,
} from '@seo/core/lint/browser'

// The most text one check reads: about 8,000 words, bounded before linting.
export const CONTENT_CHECKER_MAX_CHARS = 50_000

export const CONTENT_PRESETS: { value: LintPreset; label: string }[] = [
  { value: 'blog', label: 'Blog post or guide' },
  { value: 'landing', label: 'Landing or product page' },
  { value: 'docs', label: 'Documentation' },
]

// The three parts of the result, in the order a reader fixes them.
export const CONTENT_GROUPS: {
  category: LintCategory
  name: string
  about: string
}[] = [
  {
    category: 'seo',
    name: 'Headings, title and description',
    about:
      'More than one H1, headings that skip a level, and a title or meta description outside the length that fits a search result.',
  },
  {
    category: 'copy',
    name: 'Copy and links',
    about:
      'Link text such as "click here", headings that label instead of answering, buzzwords, claims with no number, dashes and emoji.',
  },
  {
    category: 'ai',
    name: 'AI writing patterns',
    about:
      'Sentence patterns common in AI drafts, such as "It isn\u2019t X, it\u2019s Y", padded lists of three and one-line closers.',
  },
]

export type ContentItem = {
  rule: string
  category: LintCategory
  // error and warning come with a fix; review is a question to judge.
  level: 'error' | 'warning' | 'review'
  line: number
  excerpt: string
  message: string
  // The fix, or the question for a review item.
  fix: string
}

export type Heading = { level: number; text: string; line: number }

export type ContentResult = {
  format: LintFormat
  words: number
  // True when the text was longer than the limit and only its start was read.
  partial: boolean
  headings: Heading[]
  items: ContentItem[]
}

const HTML_TAG =
  /<(?:!doctype|html|head|body|main|article|section|h[1-6]|p|div)\b/iu

export function detectFormat(text: string): LintFormat {
  return HTML_TAG.test(text) ? 'html' : 'md'
}

const stripTags = (value: string) =>
  value
    .replace(/<[^>]*>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim()

const lineAt = (text: string, index: number) =>
  text.slice(0, index).split('\n').length

// The page's headings in order. Markdown headings inside code fences are
// skipped; HTML headings are read from h1 to h6 tags.
export function headingOutline(text: string, format: LintFormat): Heading[] {
  const headings: Heading[] = []
  if (format === 'html') {
    const source = text.replace(
      /<(script|style|template)\b[\s\S]*?<\/\1>/giu,
      (block) => block.replace(/[^\n]/gu, ' '),
    )
    for (const match of source.matchAll(
      /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu,
    )) {
      headings.push({
        level: Number(match[1]),
        text: stripTags(match[2] ?? ''),
        line: lineAt(source, match.index ?? 0),
      })
    }
    return headings
  }
  let fence = false
  text.split('\n').forEach((line, index) => {
    if (/^\s*(```|~~~)/u.test(line)) fence = !fence
    if (fence) return
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line)
    if (match) {
      headings.push({
        level: (match[1] as string).length,
        text: (match[2] as string).replace(/[*_`]/gu, ''),
        line: index + 1,
      })
    }
  })
  return headings
}

const LEVEL_RANK = { error: 0, warning: 1, review: 2 } as const

export function checkContent(
  source: string,
  preset: LintPreset,
): ContentResult {
  const text = source.slice(0, CONTENT_CHECKER_MAX_CHARS)
  const format = detectFormat(text)
  const result = lintText(text, { format, preset })
  const items: ContentItem[] = [
    ...result.findings.map((finding) => ({
      rule: finding.rule,
      category: finding.category,
      level: finding.level,
      line: finding.line,
      excerpt: finding.excerpt,
      message: finding.message,
      fix: finding.fix,
    })),
    ...result.review.map((item) => ({
      rule: item.lens,
      category: item.category,
      level: 'review' as const,
      line: item.line,
      excerpt: item.quote,
      message: '',
      fix: item.question,
    })),
  ]
  items.sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      a.line - b.line ||
      a.rule.localeCompare(b.rule) ||
      a.excerpt.localeCompare(b.excerpt),
  )
  return {
    format,
    words: result.words,
    partial: source.length > CONTENT_CHECKER_MAX_CHARS,
    headings: headingOutline(text, format),
    items,
  }
}

// A prompt that hands the findings to any chat assistant or agent, with the
// rule that keeps the edit to the facts already in the text.
export function fixPrompt(source: string, items: ContentItem[]): string {
  const lines = items.map((item, index) => {
    const kind = item.level === 'review' ? 'Judge' : 'Fix'
    return `${index + 1}. Line ${item.line}: "${item.excerpt}"\n   ${item.message ? `${item.message} ` : ''}${kind}: ${item.fix}`
  })
  return [
    'Edit the content below to fix the SEO and copy problems listed. Change only the lines listed and keep the format (Markdown or HTML) as it is.',
    'Use only facts the text already gives. When a fix needs a fact the text does not have, cut the phrase instead. Never add a name, number, date, quote, experience or reason.',
    'For each "Judge" item, change the line only when it fails the question.',
    '',
    'Problems:',
    ...lines,
    '',
    'Content:',
    source.slice(0, CONTENT_CHECKER_MAX_CHARS),
  ].join('\n')
}
