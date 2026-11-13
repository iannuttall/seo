import { Context, type Hit, type ReviewHit, type RuleInfo } from './engine.js'
import { defaultPreset, extract, lineOf } from './extract.js'
import { PHRASE_RULES, runPhraseRules } from './rules-phrases.js'
import { runSeoRules, SEO_RULES } from './rules-seo.js'
import { runStructureRules, STRUCTURE_RULES } from './rules-structure.js'
import {
  type Block,
  type Doc,
  LINT_CATEGORIES,
  LINT_MAX_CHARS,
  type LintCategory,
  type LintFinding,
  type LintOptions,
  type LintResult,
  type LintReview,
} from './types.js'

// Every rule, most specific first: when two AI-pattern rules match the same
// words, the earlier one is reported.
export const LINT_RULES: RuleInfo[] = [
  ...Object.values(STRUCTURE_RULES),
  ...PHRASE_RULES.map(
    ({ id, family, level, presets, description }): RuleInfo => ({
      id,
      family,
      level,
      presets,
      description,
    }),
  ),
  ...Object.values(SEO_RULES),
]

export const LINT_REVIEW_LENSES: Record<string, string> = {
  contrast: 'A ", not X" tail that may or may not be a needed correction.',
  metaphor:
    'A figure of speech that may not fit, such as a thing that "waits" or "wants".',
  evidence: 'A superlative with no number or source nearby.',
  absolute:
    'A claim that covers every case, such as "and nothing else" or "the only way", that may be broader than its source.',
  'mic-drop': 'A short closing line that may only restate the paragraph.',
  'swap-test':
    'A headline or description that could sit on a competitor’s page unchanged.',
  proof: 'A customer count or percentage that needs a source.',
  staccato:
    'Three or more very short sentences in a row that may be a drumbeat.',
  anaphora:
    'Several sentences in a row that open with the same word, for rhythm.',
}

// The rules and review lenses as a readable list, optionally limited to
// some categories, for `seo lint rules`.
export function lintRulesText(only?: LintCategory[]): string {
  const keep = (category: LintCategory) =>
    !only?.length || only.includes(category)
  const lines: string[] = []
  for (const category of LINT_CATEGORIES) {
    if (!keep(category)) continue
    lines.push(`${CATEGORY_NAMES[category]} (${category})`)
    for (const rule of LINT_RULES) {
      if (rule.family !== category) continue
      const presets = Object.entries(rule.presets ?? {})
        .map(([preset, level]) => `${preset} ${level}`)
        .join(', ')
      lines.push(
        `  ${rule.id}  ${rule.level}${presets ? ` (${presets})` : ''}`,
        `      ${rule.description}`,
      )
    }
    const lenses = Object.entries(LINT_REVIEW_LENSES).filter(
      ([lens]) => lensCategory(lens) === category,
    )
    if (lenses.length) {
      lines.push('  Review lenses (judgement calls, never errors):')
      for (const [lens, description] of lenses) {
        lines.push(`  ${lens}`, `      ${description}`)
      }
    }
    lines.push('')
  }
  lines.push(
    'Skip a rule with --ignore <id>, or one line with a <!-- seo-lint-ignore <id> --> comment above it.',
  )
  return lines.join('\n')
}

const AI_RULES = new Set(
  LINT_RULES.filter((rule) => rule.family === 'ai').map((rule) => rule.id),
)

const RULE_CATEGORY = new Map<string, LintCategory>(
  LINT_RULES.map((rule) => [rule.id, rule.family]),
)

// Each review lens's category. Lenses not listed are copy.
const LENS_CATEGORY: Record<string, LintCategory> = {
  contrast: 'ai',
  metaphor: 'ai',
  staccato: 'ai',
  anaphora: 'ai',
  'mic-drop': 'ai',
}
const lensCategory = (lens: string): LintCategory =>
  LENS_CATEGORY[lens] ?? 'copy'

function position(doc: Doc, block: Block, index: number) {
  const offset = block.map[Math.min(index, block.map.length - 1)] ?? 0
  const line = lineOf(doc.lineStarts, offset)
  return { line: line + 1, column: offset - (doc.lineStarts[line] ?? 0) + 1 }
}

function excerpt(block: Block, start: number, end: number): string {
  const text = block.text.slice(start, end).trim()
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text
}

function overlaps(a: Hit | ReviewHit, b: Hit | ReviewHit) {
  return a.block === b.block && a.start < b.end && b.start < a.end
}

// Two AI-pattern rules on the same words: keep the error, then the more
// specific rule. Copy and SEO rules always stand on their own.
function dedupe(hits: Hit[]): Hit[] {
  const sorted = [...hits].sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1) ||
      a.rank - b.rank ||
      a.start - b.start,
  )
  const kept: Hit[] = []
  for (const hit of sorted) {
    const clash = kept.some(
      (other) =>
        overlaps(hit, other) &&
        (other.rule === hit.rule ||
          (AI_RULES.has(hit.rule) && AI_RULES.has(other.rule))),
    )
    if (!clash) kept.push(hit)
  }
  return kept
}

const RAW_LEAKS =
  /[?&]utm_source=(?:chatgpt|openai|copilot|claude|gemini|perplexity)(?:\.com|\.ai)?\b/gi

export function lintText(text: string, options: LintOptions = {}): LintResult {
  if (text.length > LINT_MAX_CHARS) {
    throw new RangeError(
      `The text is ${text.length.toLocaleString('en-US')} characters; the most one check reads is ${LINT_MAX_CHARS.toLocaleString('en-US')}.`,
    )
  }
  const format = options.format ?? 'md'
  const preset = options.preset ?? defaultPreset(format)
  const doc = extract(text, format, preset, options.metaKind)
  const ctx = new Context(doc, preset, LINT_RULES)
  runStructureRules(ctx)
  runPhraseRules(ctx)
  runSeoRules(ctx)

  const ignored = new Set(options.ignoreRules ?? [])
  const phrases = (options.ignorePhrases ?? [])
    .map((phrase) => phrase.toLowerCase().trim())
    .filter(Boolean)
  const allowed = (rule: string, line: number, quote: string) => {
    if (ignored.has(rule)) return false
    const rules = doc.suppressed.get(line - 1)
    if (rules === null) return false
    if (rules?.has(rule)) return false
    const lower = quote.toLowerCase()
    return !phrases.some((phrase) => lower.includes(phrase))
  }

  const only = options.only?.length ? new Set(options.only) : null
  const checks = (category: LintCategory) => !only || only.has(category)
  const ruleCategory = (rule: string) => RULE_CATEGORY.get(rule) ?? 'copy'

  const hits = dedupe(ctx.hits).filter((hit) => checks(ruleCategory(hit.rule)))
  const findings: LintFinding[] = []
  for (const hit of hits) {
    const at = position(doc, hit.block, hit.start)
    const quote = excerpt(hit.block, hit.start, hit.end)
    if (!allowed(hit.rule, at.line, quote)) continue
    findings.push({
      rule: hit.rule,
      category: ruleCategory(hit.rule),
      level: hit.level,
      line: at.line,
      column: at.column,
      excerpt: quote,
      message: hit.message,
      fix: hit.fix,
    })
  }
  for (const found of checks('ai') ? text.matchAll(RAW_LEAKS) : []) {
    const offset = found.index ?? 0
    const line = lineOf(doc.lineStarts, offset)
    if (!allowed('chatbot-residue', line + 1, found[0])) continue
    findings.push({
      rule: 'chatbot-residue',
      category: 'ai',
      level: 'error',
      line: line + 1,
      column: offset - (doc.lineStarts[line] ?? 0) + 1,
      excerpt: found[0],
      message: 'A link tagged by an AI assistant when it was copied.',
      fix: 'Remove the utm_source parameter from the link.',
    })
  }

  const review: LintReview[] = []
  const seen = new Set<string>()
  for (const item of ctx.reviews) {
    if (!checks(lensCategory(item.lens))) continue
    if (hits.some((hit) => overlaps(item, hit))) continue
    const at = position(doc, item.block, item.start)
    const quote = excerpt(item.block, item.start, item.end)
    const key = `${item.lens}:${at.line}:${at.column}`
    if (seen.has(key) || !allowed(item.lens, at.line, quote)) continue
    seen.add(key)
    review.push({
      lens: item.lens,
      category: lensCategory(item.lens),
      line: at.line,
      column: at.column,
      quote,
      question: item.question,
    })
  }

  const order = (
    a: { line: number; column: number },
    b: { line: number; column: number },
  ) => a.line - b.line || a.column - b.column
  findings.sort(
    (a, b) =>
      order(a, b) ||
      a.rule.localeCompare(b.rule) ||
      a.excerpt.localeCompare(b.excerpt),
  )
  review.sort(
    (a, b) =>
      order(a, b) ||
      a.lens.localeCompare(b.lens) ||
      a.quote.localeCompare(b.quote),
  )
  const categories = Object.fromEntries(
    LINT_CATEGORIES.map((category) => [
      category,
      findings.filter((finding) => finding.category === category).length,
    ]),
  ) as Record<LintCategory, number>
  return {
    format,
    preset,
    words: ctx.words,
    errors: findings.filter((finding) => finding.level === 'error').length,
    warnings: findings.filter((finding) => finding.level === 'warning').length,
    categories,
    ...(only
      ? { only: LINT_CATEGORIES.filter((category) => only.has(category)) }
      : {}),
    findings,
    review,
  }
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`

// One checked or skipped file. note says where the text came from, such
// as a live page; partial says what part of it was not checked.
export type LintFileResult =
  | { path: string; result: LintResult; note?: string; partial?: string }
  | { path: string; skipped: string }

const CATEGORY_NAMES: Record<LintCategory, string> = {
  ai: 'AI patterns',
  copy: 'copy',
  seo: 'SEO',
}

// The readable report for one or more files.
export function lintReportText(files: LintFileResult[]): string {
  const lines: string[] = []
  let errors = 0
  let warnings = 0
  let reviews = 0
  for (const file of files) {
    if ('skipped' in file) {
      lines.push(`${file.path}: not checked. ${file.skipped}`, '')
      continue
    }
    const { result } = file
    errors += result.errors
    warnings += result.warnings
    reviews += result.review.length
    const only = result.only
      ? `, only ${result.only.map((category) => CATEGORY_NAMES[category]).join(' and ')}`
      : ''
    const counted = LINT_CATEGORIES.filter(
      (category) => result.categories[category] > 0,
    )
    const split = counted.length
      ? ` (${counted.map((category) => `${category} ${result.categories[category].toLocaleString('en-US')}`).join(', ')})`
      : ''
    lines.push(
      `${file.path} (${result.preset}, ${plural(result.words, 'word')}${only}): ${plural(result.errors, 'error')}, ${plural(result.warnings, 'warning')}${split}, ${result.review.length.toLocaleString('en-US')} to review`,
    )
    if (file.note) lines.push(`  ${file.note}`)
    if (file.partial) lines.push(`  Partly checked: ${file.partial}`)
    for (const finding of result.findings) {
      lines.push(
        `  ${finding.line}:${finding.column}  ${finding.level}  ${finding.rule}  "${finding.excerpt}"`,
        `      ${finding.message}`,
        `      Fix: ${finding.fix}`,
      )
    }
    if (result.review.length) {
      lines.push('  To review (your call):')
      for (const item of result.review) {
        lines.push(
          `  ${item.line}:${item.column}  ${item.lens}  "${item.quote}"`,
          `      ${item.question}`,
        )
      }
    }
    lines.push('')
  }
  const checked = files.filter((file) => 'result' in file).length
  const skipped = files.length - checked
  const partial = files.filter(
    (file) => 'partial' in file && file.partial,
  ).length
  if (files.length > 1 || skipped || partial) {
    const gaps = [
      skipped ? `${skipped.toLocaleString('en-US')} not checked` : '',
      partial ? `${partial.toLocaleString('en-US')} partly checked` : '',
    ].filter(Boolean)
    lines.push(
      `${plural(checked, 'file')} checked${gaps.length ? ` (${gaps.join(', ')})` : ''}: ${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${reviews.toLocaleString('en-US')} to review.`,
    )
  }
  if (!checked) {
    lines.push(
      'Nothing was checked, so this is not a clean result. The reason is beside each file above.',
    )
  } else if (skipped || partial) {
    lines.push(
      'Not an all-clear: the totals cover only the text that was checked.',
    )
  }
  if (reviews) {
    lines.push(
      'Errors and warnings each come with a fix. Review items are judgement calls: change a line only when it fails the question.',
    )
  }
  return lines.join('\n').trimEnd()
}
