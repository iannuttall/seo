import {
  type Context,
  insideQuotes,
  RHYTHM_KINDS,
  type RuleInfo,
  SENTENCE_KINDS,
} from './engine.js'
import { PREPOSITIONS } from './rules-contrast.js'
import { sentenceAt, verbless, words } from './text.js'
import type { Block } from './types.js'

// Rules that count a pattern across the document: AI vocabulary, formula
// triads, coined labels, pseudo-clefts and colon density.

export const COUNTED_RULES: Record<string, RuleInfo> = {
  vocabularyCluster: {
    id: 'ai-vocabulary-cluster',
    family: 'ai',
    level: 'warning',
    description:
      'Two or more words such as crucial, pivotal, foster, landscape or journey in one paragraph.',
  },
  triad: {
    id: 'triad',
    family: 'ai',
    level: 'warning',
    presets: { docs: 'off' },
    description:
      'Formula triads: three parallel clauses ("It is cheap, it is reversible, and it works"), three items that open with the same word, three adjectives after "is", or three abstract nouns. Plain lists of three are left alone.',
  },
  inventedLabel: {
    id: 'invented-label',
    family: 'ai',
    level: 'warning',
    description:
      'Two or more coined labels such as "the integration tax" or "the supervision paradox".',
  },
  colonDensity: {
    id: 'colon-density',
    family: 'ai',
    level: 'warning',
    description:
      'Colons used mid-sentence as a pause or lead-in, three or more per 1,000 words. One is ordinary; a piece full of them reads as AI.',
  },
  pseudoCleft: {
    id: 'pseudo-cleft',
    family: 'ai',
    level: 'warning',
    description:
      'Repeated "What makes this work is ..." or "The problem is that ..." setups.',
  },
}

const TIER2 =
  /\b(?:crucial(?:ly)?|pivotal|vibrant|comprehensive|enhanc(?:e|es|ed|ing|ement)|foster(?:s|ed|ing)?|harness(?:es|ed|ing)?|navigat(?:e|es|ed|ing)|streamlin(?:e|es|ed|ing)|empower(?:s|ed|ing|ment)?|elevat(?:e|es|ed|ing)|unleash(?:es|ed|ing)?|transformative|nuanced?|myriad|plethora|encompass(?:es|ed|ing)?|cultivat(?:e|es|ed|ing)|resonat(?:e|es|ed|ing)|cornerstone|poised|burgeoning|nascent|quintessential|overarching|actionable|impactful|landscape|ecosystem|journey|additionally|notably|moreover|furthermore|profound(?:ly)?|quietly|fundamentally|remarkabl[ey]|arguably|invaluable|deeply (?:rooted|committed|integrated|personal|meaningful))\b/gi
const TECHNICAL = /^(?:comprehensive|ecosystem|streamlin|navigat)/i

export function vocabularyCluster(ctx: Context) {
  const rule = COUNTED_RULES.vocabularyCluster as RuleInfo
  if (ctx.level(rule) === 'off') return
  for (const block of ctx.blocks([
    'paragraph',
    'list',
    'quote',
    'prop',
    'heading',
    'description',
    'title',
  ])) {
    const seen = new Map<string, number>()
    TIER2.lastIndex = 0
    for (const found of block.norm.matchAll(TIER2)) {
      const word = found[0].toLowerCase()
      if (ctx.preset === 'docs' && TECHNICAL.test(word)) continue
      const stem = word.slice(0, 6)
      const start = found.index ?? 0
      if (ctx.preset === 'landing' || ctx.preset === 'meta') {
        ctx.hit(
          rule,
          block,
          start,
          start + found[0].length,
          `"${found[0]}" is filler in short copy.`,
          'Use the plain word, or the concrete thing it stands for.',
        )
        continue
      }
      if (!seen.has(stem)) seen.set(stem, start)
      if (seen.size === 2 && !seen.has(`${stem}!`)) {
        seen.set(`${stem}!`, start)
        const listed = [...seen.keys()].filter((key) => !key.endsWith('!'))
        ctx.hit(
          rule,
          block,
          start,
          start + found[0].length,
          `This paragraph stacks words common in AI text (${listed.length} of them, ending with "${found[0]}").`,
          'Rewrite with plain words: "important" for crucial, "help" for foster, "field" for landscape, or cut them.',
        )
      }
    }
  }
}

// A series of three or more: "A, B, and C", with up to six words an item.
const SERIES =
  /\b[\w'$-]+(?: [\w'$-]+){0,5}(?:, [\w'$-]+(?: [\w'$-]+){0,5}){1,3},? (?:and|or) [\w'$-]+(?: [\w'$-]+){0,5}/g
const ABSTRACT_TRIAD =
  /\b[a-z]+(?:tion|sion|ity|ness|ment|ence|ance|ism), (?:and )?[a-z]+(?:tion|sion|ity|ness|ment|ence|ance|ism),? and [a-z]+(?:tion|sion|ity|ness|ment|ence|ance|ism)\b/gi
// Words that, opening every item, make a list a chant: "every project,
// every challenge, and every collaboration".
const ECHO = new Set(
  'to our your their my his her its every each more less no it they we you'.split(
    ' ',
  ),
)
const COPULA =
  /\b(?:is|are|was|were|'s|feels?|felt|looks?|stays?|remains?|seems?)\s+$/i

// Why a series of three or more reads as a formula, or null for a plain
// list such as "engineers, data scientists, and designers".
function formulaTriad(items: string[], before: string): string | null {
  const firsts = items.map((item) => words(item)[0]?.toLowerCase() ?? '')
  const echo = firsts[0] ?? ''
  if (ECHO.has(echo) && firsts.every((first) => first === echo)) {
    return `Each item opens with "${echo}".`
  }
  // "the process is simple, the numbers are accurate, and their
  // questions get answered": short clauses, each with its own subject.
  if (
    items.every(
      (item) =>
        /^(?:the|their|our|your|its|it|they|we|you|he|she)\b/i.test(item) &&
        words(item).length >= 3 &&
        words(item).length <= 7 &&
        !verbless(item),
    )
  ) {
    return 'Three parallel clauses in a row.'
  }
  const adjectives = items.every(
    (item) =>
      /^[a-z]/.test(item) &&
      words(item).length <= 2 &&
      !PREPOSITIONS.has(words(item)[0] ?? ''),
  )
  if (adjectives && COPULA.test(before)) {
    return 'A string of adjectives after "is".'
  }
  if (
    items.every((item) => /^\w+ed\b/i.test(item) && words(item).length <= 3)
  ) {
    return 'A string of past participles.'
  }
  return null
}

export function triads(ctx: Context) {
  const rule = COUNTED_RULES.triad as RuleInfo
  if (ctx.level(rule) === 'off') return
  for (const block of ctx.blocks(['paragraph', 'quote', 'prop', 'list'])) {
    const taken: Array<[number, number]> = []
    ABSTRACT_TRIAD.lastIndex = 0
    for (const match of block.norm.matchAll(ABSTRACT_TRIAD)) {
      const start = match.index ?? 0
      taken.push([start, start + match[0].length])
      ctx.hit(
        rule,
        block,
        start,
        start + match[0].length,
        'Three abstract nouns in a row sound weighty but say little.',
        'Keep the one that matters and give an example of it.',
      )
    }
    for (const sentence of ctx.sentences(block)) {
      // Clauses split at commas, so series inside each clause are found.
      SERIES.lastIndex = 0
      for (const match of sentence.text.matchAll(SERIES)) {
        let from = match.index ?? 0
        const raw = match[0].split(
          /,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+(?=[^,]*$)/,
        )
        if (raw.length < 3) continue
        // The first item runs back to the sentence or clause start, so trim
        // it to the words after a leading verb or preposition.
        const items = [...raw]
        const head = raw[0] ?? ''
        const lead =
          /^.*\b(?:is|are|was|were|'s|feels?|looks?|stays?|remains?|seems?|of|for|to|with|by|from|on|in|like|including|as)\s+/i.exec(
            head,
          )
        if (lead && words(head.slice(lead[0].length)).length) {
          items[0] = head.slice(lead[0].length)
          from += lead[0].length
        }
        const end = sentence.start + (match.index ?? 0) + match[0].length
        const before = block.norm.slice(sentence.start, sentence.start + from)
        // "thank our customers, our community, and our planet": the echo
        // word starts inside the first item.
        const echo = words(raw[1] ?? '')[0]?.toLowerCase() ?? ''
        const inFirst = new RegExp(
          `\\b${echo}\\b(?!.*\\b${echo}\\b)`,
          'i',
        ).exec(head)
        if (ECHO.has(echo) && inFirst && inFirst.index > 0) {
          items[0] = head.slice(inFirst.index)
          from = (match.index ?? 0) + inFirst.index
        }
        const plain = formulaTriad(raw, '')
        const why = plain ?? formulaTriad(items, before)
        if (!why) continue
        if (plain) from = match.index ?? 0
        const start = sentence.start + from
        if (taken.some(([a, b]) => start < b && end > a)) continue
        taken.push([start, end])
        ctx.hit(
          rule,
          block,
          start,
          end,
          `A list of ${items.length} that reads as a formula. ${why}`,
          'Keep the items the reader needs. If all of them are needed, write them plainly or as two sentences; if one was added for rhythm, cut it.',
        )
      }
    }
  }
}

export function countedPatterns(ctx: Context) {
  const labels = COUNTED_RULES.inventedLabel as RuleInfo
  const clefts = COUNTED_RULES.pseudoCleft as RuleInfo
  const label =
    /\bthe [a-z]+(?:-[a-z]+)? (?:paradox|trap|tax|creep|divide|vacuum|inversion|cliff|treadmill|illusion|fallacy|flywheel|moat)\b/gi
  const cleft =
    /(?:^|[.!?]\s+)(?:What (?:makes|made|matters|changed|really|actually|you get|this means|I (?:like|love|learned|found))\b[^.!?]{0,40}\s+(?:is|was)\b|The (?:problem|difference|catch|key|trick|point|reason) is that\b)/g
  for (const [rule, re] of [
    [labels, label],
    [clefts, cleft],
  ] as const) {
    if (ctx.level(rule) === 'off') continue
    const found: Array<{ block: Block; start: number; end: number }> = []
    for (const block of ctx.blocks(RHYTHM_KINDS)) {
      re.lastIndex = 0
      for (const match of block.norm.matchAll(re)) {
        let start = match.index ?? 0
        while (/[\s.!?]/.test(block.norm[start] ?? '')) start++
        found.push({ block, start, end: (match.index ?? 0) + match[0].length })
      }
    }
    if (found.length < 2) continue
    for (const item of found) {
      ctx.hit(
        rule,
        item.block,
        item.start,
        item.end,
        rule === labels
          ? `${found.length} coined labels in one piece. Each asks the reader to learn a term.`
          : `${found.length} "What X is" or "The problem is that" setups in one piece.`,
        rule === labels
          ? 'Describe the thing in plain words instead of naming it.'
          : 'Start with the subject and say the thing directly.',
      )
    }
  }
}

// Colons inside a sentence, used as a pause ("Rendering isn't the problem:
// the text is in the HTML") or to lead into an inline list. One is ordinary
// punctuation; at three or more per 1,000 words it is an AI habit. Not
// counted: a colon that ends its block (it introduces a list or table), a
// short label with no verb ("The fix:"), one before a quotation, and one
// inside quotes or link text, such as a cited title.
export function colonDensity(ctx: Context) {
  const rule = COUNTED_RULES.colonDensity as RuleInfo
  if (ctx.level(rule) === 'off') return
  const found: Array<{ block: Block; start: number; end: number }> = []
  for (const block of ctx.blocks(SENTENCE_KINDS)) {
    const sentences = ctx.sentences(block)
    for (const match of block.norm.matchAll(/:\s+(?=\S)/g)) {
      const at = match.index ?? 0
      const after = block.norm.slice(at + match[0].length)
      if (/^["'(]/.test(after)) continue
      // A short label with no verb, such as "The fix:" or "Volume and
      // difficulty:", names what follows. "Rendering isn't the problem:" is
      // a pause.
      const lead = block.norm.slice(sentenceAt(sentences, at).start, at)
      if (words(lead).length <= 4 && verbless(lead)) continue
      // A bold label, "**Check:**" or "**The fix**:", even when the label
      // is a verb.
      const source = block.map[at] ?? -1
      if (
        /^(?:\*\*|__)/.test(ctx.doc.source.slice(source + 1, source + 3)) ||
        /(?:\*\*|__)$/.test(ctx.doc.source.slice(source - 2, source))
      ) {
        continue
      }
      if (block.links.some((link) => link.start <= at && link.end > at)) {
        continue
      }
      if (insideQuotes(block.norm, at, at + 1)) continue
      const clause = after.match(/^(?:[^.!?;]|[.!?](?=\S)){0,60}/)?.[0] ?? ''
      found.push({
        block,
        start: at,
        end: at + match[0].length + clause.trimEnd().length,
      })
    }
  }
  if (found.length < 4 || found.length * 1000 < 3 * ctx.proseWords) return
  for (const item of found) {
    ctx.hit(
      rule,
      item.block,
      item.start,
      item.end,
      `${found.length} mid-sentence colons in ${ctx.proseWords.toLocaleString('en-US')} words. A colon used as a pause in sentence after sentence is a common AI habit.`,
      'Use a full stop, or join the two parts with a plain word such as "because" or "so". Keep colons that introduce a list or a quotation.',
    )
  }
}
