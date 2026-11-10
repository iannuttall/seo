import {
  type Context,
  insideQuotes,
  type RuleInfo,
  SENTENCE_KINDS,
} from './engine.js'
import { sentenceAt, verbless, words } from './text.js'

// Contrast rules: "It isn't X, it's Y" reframes and trailing ", not X"
// contrasts.

export const CONTRAST_RULES: Record<string, RuleInfo> = {
  negativeParallelism: {
    id: 'negative-parallelism',
    family: 'ai',
    level: 'error',
    description:
      '"It isn\'t X, it\'s Y" and "isn\'t just X. It\'s Y." reframes.',
  },
  contrastReframe: {
    id: 'contrast-reframe',
    family: 'ai',
    level: 'error',
    presets: { docs: 'warning' },
    description:
      'A trailing ", not X" or "rather than X" contrast added for drama: "The fix is in the template, not in 600 posts."',
  },
}

const NEG =
  "(?:\\b(?:is|are|was|were)(?:n't|\\s+not)\\b|\\b(?:it|this|that|they|we|you)(?:'s|'re)\\s+not\\b)"
const BODY = '[^,;:.!?\\n]{1,80}?'
const JOIN = '(?:\\s*[,;:]|\\s*[\\u2014\\u2013]|\\s+--)\\s*(?:but\\s+|and\\s+)?'
const RESTATE = "(?:it|this|that|they)(?:'s|'re|\\s+(?:is|are|was|were))\\b"
const MINIMIZER = '(?:just|merely|simply|only)'

const PARALLEL = [
  {
    kind: 'reveal',
    re: new RegExp(`${NEG}\\s+${MINIMIZER}\\s+${BODY}${JOIN}${RESTATE}`, 'gi'),
  },
  {
    kind: 'about',
    re: new RegExp(
      `${NEG}\\s+(?:just\\s+)?about\\s+${BODY}${JOIN}${RESTATE}`,
      'gi',
    ),
  },
  {
    kind: 'split',
    re: new RegExp(
      `${NEG}\\s+(?:${MINIMIZER}\\s+)?${BODY}[.!]\\s+${RESTATE}`,
      'gi',
    ),
  },
  {
    kind: 'joined',
    re: new RegExp(`${NEG}\\s+${BODY}${JOIN}${RESTATE}`, 'gi'),
  },
]

const FRAMING =
  /^(?:the |this |that |our |my |your )?(?:real )?(?:problem|question|answer|issue|point|goal|story|bottleneck|fix|difference|trick|lesson|catch|risk|gap|win|work|job|key|opportunity|plan|idea|value)\b/i

export function negativeParallelism(ctx: Context) {
  const rule = CONTRAST_RULES.negativeParallelism as RuleInfo
  for (const block of ctx.blocks(SENTENCE_KINDS)) {
    const sentences = ctx.sentences(block)
    const taken: Array<[number, number]> = []
    for (const { kind, re } of PARALLEL) {
      re.lastIndex = 0
      for (const found of block.norm.matchAll(re)) {
        const start = found.index ?? 0
        const end = start + found[0].length
        if (taken.some(([a, b]) => start < b && end > a)) continue
        taken.push([start, end])
        if (insideQuotes(block.norm, start, end)) continue
        const sentence = sentenceAt(sentences, start)
        const subject = block.norm.slice(sentence.start, start).trim()
        const pronoun = /^(?:but |and |so )?(?:it|this|that|they)?$/i.test(
          subject.replace(/(?:'s|'re)$/, ''),
        )
        const firstWords = words(block.norm.slice(sentence.start, end)).length
        let level: 'error' | 'warning' = 'warning'
        if (kind === 'reveal' || kind === 'about') level = 'error'
        else if (FRAMING.test(subject)) level = 'error'
        else if (pronoun && (kind === 'joined' || firstWords <= 10)) {
          level = 'error'
        }
        // What it is, said once: the restated half on its own.
        const after = sentenceAt(sentences, end - 1)
        const restate =
          /(?:it|this|that|they)(?:'s|'re|\s+(?:is|are|was|were))$/i.exec(
            found[0],
          )
        const from = restate ? end - restate[0].length : end
        const second = block.text.slice(from, after.end).trim()
        const fix = second
          ? `Drop the "isn't" half and state the claim: "${second.charAt(0).toUpperCase()}${second.slice(1)}"`
          : 'Drop the "isn\'t" half and state the claim once.'
        // The looser shapes, and a concession joined by "but" ("It's not
        // their only offering, but it is the first"), are often a real
        // correction: a reader judges.
        const concession =
          (/,\s*but\s+(?:[\w']+\s*){1,3}$/i.test(found[0]) ||
            /^(?:while|although|though|even though)\b/i.test(subject)) &&
          kind !== 'reveal'
        if ((level === 'warning' && firstWords > 12) || concession) {
          ctx.review(
            'contrast',
            block,
            sentence.start,
            Math.max(after.end, end),
            'Does this "isn\'t X ... it\'s Y" correct something a reader would really think? If not, state the claim once.',
          )
          continue
        }
        ctx.hit(
          rule,
          block,
          sentence.start,
          Math.max(after.end, end),
          'An "isn\'t X, it\'s Y" reframe argues with a claim nobody made.',
          fix,
          ctx.level(rule) === 'off' ? undefined : level,
        )
      }
    }
  }
}

const SKIP_AFTER_NOT =
  /^(?:only|just|least|to mention|yet|always|all|every|necessarily|even|including|counting|that|so|too|quite|really|much|for long|in a good way|exactly|entirely|always|merely|simply|surprisingly)\b/i
export const PREPOSITIONS = new Set(
  'in on by for about to at from with into through over under as because when where how what who which via'.split(
    ' ',
  ),
)
const NOT_GERUND = new Set([
  'thing',
  'something',
  'nothing',
  'anything',
  'everything',
  'string',
  'king',
  'spring',
  'morning',
  'evening',
  'during',
  'ceiling',
  'wing',
  'ring',
  'sing',
  'bring',
  'swing',
  'ping',
])

function gerund(word: string | undefined): boolean {
  if (!word) return false
  const lower = word.toLowerCase()
  return lower.length > 4 && lower.endsWith('ing') && !NOT_GERUND.has(lower)
}

// "Made for dentistry, not just any business", "not just my skills, but
// my understanding". "Not only ... but also" is ordinary English and left
// alone.
const NOT_JUST =
  /,\s+not (?:just|merely|simply) [^,.;:!?]{1,50}[.!?]?$|\bnot (?:just|merely|simply) [^,.;:!?]{1,50},? but\b/i

export function contrastReframe(ctx: Context) {
  const rule = CONTRAST_RULES.contrastReframe as RuleInfo
  if (ctx.level(rule) === 'off') return
  for (const block of ctx.blocks([...SENTENCE_KINDS, 'heading'])) {
    for (const sentence of ctx.sentences(block)) {
      const text = sentence.text
      const just = NOT_JUST.exec(text)
      if (
        just &&
        // A long sentence with "not just ... but" is usually a correction
        // with its reasons, not a slogan.
        (just[0].startsWith(',') || words(text).length <= 16) &&
        !insideQuotes(
          block.norm,
          sentence.start + just.index,
          sentence.start + just.index + just[0].length,
        )
      ) {
        ctx.hit(
          rule,
          block,
          sentence.start,
          sentence.end,
          'A "not just X" contrast inflates the claim instead of stating it.',
          'Say what it is or does in one plain clause, and drop the "not just" half.',
        )
        continue
      }
      const re = /,\s+not\s+|\s+rather than\s+/gi
      for (const found of text.matchAll(re)) {
        const at = found.index ?? 0
        if (
          insideQuotes(
            block.norm,
            sentence.start + at,
            sentence.start + at + found[0].length,
          )
        ) {
          continue
        }
        const rather = /rather/i.test(found[0])
        const left = text.slice(0, at)
        const rightAll = text.slice(at + found[0].length)
        const right = rightAll.split(/[,;:.!?(]/)[0] ?? ''
        if (!rather && SKIP_AFTER_NOT.test(right)) continue
        if (/\bor$/i.test(left.trim()) || /\bwhether\b/i.test(left)) continue
        const leftWords = words(left)
        const rightWords = words(right)
        if (leftWords.length < 3 || !rightWords.length) continue
        // Two-beat fragments are their own rule.
        if (leftWords.length + rightWords.length <= 5 && verbless(text)) {
          continue
        }
        const lastLeft = leftWords[leftWords.length - 1]
        // Gerund pairs: "for watching, not building".
        const gerunds = gerund(lastLeft) && gerund(rightWords[0])
        // The same preposition on both sides: "in the template, not in 600 posts".
        const first = rightWords[0]?.toLowerCase() ?? ''
        const repeated =
          PREPOSITIONS.has(first) &&
          new RegExp(`\\b${first}\\b`, 'i').test(left)
        // "treat X as a Y, not a Z", "as the point rather than the numbers".
        const asFrame =
          /\bas (?:an?|the|one|its) [^,]{1,40}$/i.test(left) &&
          (rather || /^(?:an?|the|as|one)\b/i.test(right))
        const framing = !rather && FRAMING.test(left.trim())
        const start = sentence.start + at
        const end =
          sentence.start + at + found[0].length + right.trimEnd().length
        // A named alternative ("not from Google") is often a correction a
        // reader needs, so a reader judges it.
        const named = repeated && /\b[A-Z]/.test(right)
        // A repeated preposition alone ("in the folder, not in email") is
        // often a plain correction: a warning, unless the other half is a
        // count ("not in 600 posts", "not by how many pages").
        const counted = /\d|\bhow (?:many|much)\b|\bevery\b|\ball\b/i.test(
          right,
        )
        const weak =
          repeated && !named && !counted && !gerunds && !asFrame && !framing
        if (gerunds || asFrame || framing || (repeated && !named)) {
          const keep = left.trim().replace(/[,;]$/, '')
          const close = /:\s*$/.test(text) ? ':' : '.'
          ctx.hit(
            rule,
            block,
            sentence.start,
            sentence.end,
            rather
              ? 'The "rather than" half sets up a contrast the reader did not need.'
              : 'The ", not ..." tail adds a contrast for drama.',
            `Keep the claim and cut the contrast: "${keep}${close}" Mention the other half only if a reader would really assume it.`,
            weak ? 'warning' : undefined,
          )
          break
        }
        // A short tail that ends the sentence: a reader has to judge it.
        const tailEnds =
          rightAll.trim().length - right.trim().length <= 2 &&
          rightWords.length <= 6
        if (!rather && (tailEnds || named)) {
          ctx.review(
            'contrast',
            block,
            start + 2,
            end,
            'Is this ", not ..." a correction the reader needs, or a contrast added for effect? If nobody would assume the other half, cut it.',
          )
        }
      }
    }
  }
}
