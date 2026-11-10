import type { Context, RuleInfo } from './engine.js'
import type { Block } from './types.js'

// Bold rules: bold used for emphasis and bold-label list items.

export const BOLD_RULES: Record<string, RuleInfo> = {
  boldEmphasis: {
    id: 'bold-emphasis',
    family: 'ai',
    level: 'warning',
    presets: { docs: 'off', meta: 'off' },
    description:
      'Bold used for emphasis more than about once per 100 words of prose.',
  },
  boldLabels: {
    id: 'bold-label-bullets',
    family: 'ai',
    level: 'warning',
    presets: { docs: 'off' },
    description:
      'Three or more list items in a row that open with a bold label.',
  },
}

export function boldLabels(ctx: Context) {
  const rule = BOLD_RULES.boldLabels as RuleInfo
  if (ctx.level(rule) === 'off') return
  if (ctx.doc.format !== 'md' && ctx.doc.format !== 'mdx') return
  const lists = ctx.blocks(['list'])
  let run: Block[] = []
  const report = () => {
    if (run.length >= 3) {
      const first = run[0] as Block
      ctx.hit(
        rule,
        first,
        0,
        Math.min(first.text.length, 60),
        `${run.length} list items in a row open with a bold label.`,
        'Drop the bold labels and write each item as one plain sentence, or use a table if the items really are parallel.',
      )
    }
    run = []
  }
  let previous: Block | null = null
  for (const block of lists) {
    const offset = block.map[0] ?? 0
    const line = ctx.doc.source.lastIndexOf('\n', offset) + 1
    const raw = ctx.doc.source.slice(line, offset + 4)
    const bold = /^\s*(?:[-*+]|\d{1,9}[.)])\s+(?:\*\*|__)/.test(raw)
    const adjacent =
      previous !== null &&
      ctx.doc.blocks.indexOf(block) === ctx.doc.blocks.indexOf(previous) + 1
    if (!bold || !adjacent) report()
    if (bold) run.push(block)
    previous = block
  }
  report()
}

// Bold spans in prose: Markdown ** or __, and HTML <strong> or <b>.
export function boldEmphasis(ctx: Context) {
  const rule = BOLD_RULES.boldEmphasis as RuleInfo
  if (ctx.level(rule) === 'off') return
  const markdown = ctx.doc.format === 'md' || ctx.doc.format === 'mdx'
  const re = markdown
    ? /(\*\*|__)(?=\S)[^*_\n]+?\1/g
    : /<(strong|b)\b[^>]*>[^<]{1,200}<\/\1>/gi
  const prose = ctx.blocks(['paragraph', 'list', 'quote', 'prop'])
  const spans: Array<{ block: Block; start: number; end: number }> = []
  for (const found of ctx.doc.source.matchAll(re)) {
    const open = markdown ? 2 : found[0].indexOf('>') + 1
    const from = (found.index ?? 0) + open
    const to =
      (found.index ?? 0) +
      found[0].length -
      (markdown ? 2 : found[0].length - found[0].lastIndexOf('<'))
    for (const block of prose) {
      const first = block.map[0] ?? 0
      const last = block.map[block.map.length - 1] ?? 0
      if (from < first || from > last) continue
      const start = block.map.indexOf(from)
      // A bold label opening a list item is bold-label-bullets' to judge.
      if (start <= 0 && block.kind === 'list') break
      if (start < 0) break
      let end = start
      while (end < block.map.length && (block.map[end] ?? 0) < to) end++
      spans.push({ block, start, end })
      break
    }
  }
  if (spans.length < 3 || spans.length * 100 <= ctx.proseWords) return
  for (const span of spans) {
    ctx.hit(
      rule,
      span.block,
      span.start,
      span.end,
      `${spans.length} bold phrases in ${ctx.proseWords.toLocaleString('en-US')} words of prose. Bold this often stops meaning "important".`,
      'Remove the bold here. Keep bold, if any, for the one thing a skimming reader must not miss.',
    )
  }
}
