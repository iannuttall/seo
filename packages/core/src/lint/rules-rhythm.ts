import { type Context, RHYTHM_KINDS, type RuleInfo } from './engine.js'
import { verbless, words } from './text.js'
import type { Sentence } from './types.js'

// Short-sentence rules: announcements, slogan fragments, kicker closers,
// "worth + -ing" idioms, staccato runs and repeated openings.

export const RHYTHM_RULES: Record<string, RuleInfo> = {
  heresAnnouncement: {
    id: 'heres-announcement',
    family: 'ai',
    level: 'error',
    presets: { docs: 'off' },
    description:
      'A short "Here\'s the X" sentence that announces what comes next instead of saying it.',
  },
  pithyFragment: {
    id: 'pithy-fragment',
    family: 'ai',
    level: 'error',
    description:
      'Verbless slogan fragments: "Same essay, two titles.", "Every month. No exceptions.", "$299 per month. That\'s it."',
  },
  stockCloser: {
    id: 'stock-closer',
    family: 'ai',
    level: 'error',
    description:
      'A stock kicker line: "That\'s a real win." "That is what makes this interesting."',
  },
  negativeReframe: {
    id: 'negative-reframe',
    family: 'ai',
    level: 'warning',
    description: 'A short "That\'s not how/what ..." dismissal.',
  },
  figurativeWorth: {
    id: 'figurative-worth',
    family: 'ai',
    level: 'error',
    description:
      'A "worth + -ing" idiom that mixes its metaphor or points at the reader: "a fight worth picking", "worth noting".',
  },
  anaphora: {
    id: 'anaphora',
    family: 'ai',
    level: 'error',
    description:
      'Short sentences in a row that start with the same word: two or more "No ..." sentences, or three or more starting "It\'s", "They", "We" or "You".',
  },
}

export function heresAnnouncement(ctx: Context) {
  const rule = RHYTHM_RULES.heresAnnouncement as RuleInfo
  if (ctx.level(rule) === 'off') return
  for (const block of ctx.blocks(['paragraph', 'prop', 'quote'])) {
    for (const sentence of ctx.sentences(block)) {
      const text = sentence.text
      if (
        !/^(?:And |So |But )?Here(?:'s| is| are) (?:the|what|why|how|who|where|when|a|an|my|our|some|two|three|four|five)\b/i.test(
          text,
        ) ||
        /^(?:And |So |But )?Here's the (?:thing|deal|kicker|catch|twist|truth|secret|reality)\b/i.test(
          text,
        )
      ) {
        continue
      }
      const count = words(text).length
      const colon = text.endsWith(':')
      // "Here's a specific example." right before a screenshot, quote or
      // table points at it, which a reader needs.
      const sentences = ctx.sentences(block)
      if (sentence === sentences[sentences.length - 1]) {
        const after = ctx.doc.source
          .slice((block.map[block.map.length - 1] ?? 0) + 1)
          .replace(/^[^\n]*\n/, '')
          .trimStart()
        if (
          /^(?:!\[|<(?:img|figure|picture|video|iframe|blockquote|table)\b|>|\|)/i.test(
            after,
          )
        ) {
          continue
        }
      }
      let level: 'error' | 'warning' | null = null
      if (colon && count <= 5) level = 'error'
      else if (!colon && !text.endsWith('?')) {
        if (count <= 9) level = 'error'
        else if (count <= 16) level = 'warning'
      }
      if (!level) continue
      ctx.hit(
        rule,
        block,
        sentence.start,
        sentence.end,
        'This sentence announces what comes next instead of saying it.',
        'Cut it and lead with the finding, such as what the table or list shows and why it matters.',
        level === 'warning' ? 'warning' : undefined,
      )
    }
  }
}

const TWO_BEAT = [
  /^[A-Z][a-z]+(?: [a-z]+)?, (?:but|yet|not|and|just|never|still) [a-z]+(?: [a-z]+)?\.$/,
  /^[A-Z][a-z]+ over [a-z]+\.$/,
  /^(?:Same|One|Two|Three|Different|No|New|Old|Fewer|More|Less|Better|Smaller|Bigger|Zero|Half) [a-z]+(?: [a-z]+)?, (?:two|three|four|different|same|one|no|new|zero|half|twice|more|less|fewer|a|the|every)\b[^,]{0,25}\.$/,
  /^(?:But|And|So|Or) (?:only|not|never|just|always|still) [a-z]+\.$/,
]
const GREETING =
  /^(?:hi|hello|hey|thanks|thank you|cheers|dear|yes|no|ok|okay|sure|well|oh|example|note|tip|warning|update|step \d)\b/i
const LEADING_CLAUSE =
  /^(?:without|with|for|in|on|at|after|before|if|when|once|since|until|unless|by|from|to|then|also|first|next|finally|instead|otherwise|please)\b/i
const MONTH =
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i

// A one-beat kicker after a short line: "$299 per month. That's it."
const KICKER =
  /^(?:That's it|That's all|No exceptions|No catch|No strings attached|No surprises|No asterisks|Period|Full stop|Simple as that|It's that simple|That simple|Nothing more|Nothing else)[.!]$/i

// A short verbless sentence, such as "Every month." or "No exceptions."
function slogan(text: string): boolean {
  const list = words(text)
  return (
    /[.!]$/.test(text) &&
    // "Not X. Not Y." is the negation rules' to report.
    !/^Not\b/.test(text) &&
    list.length >= 1 &&
    list.length <= 4 &&
    !GREETING.test(text) &&
    !MONTH.test(text) &&
    !list.every((word) => /^[A-Z0-9]/.test(word)) &&
    verbless(text)
  )
}

function fragmentRuns(ctx: Context, rule: RuleInfo) {
  for (const block of ctx.blocks(RHYTHM_KINDS)) {
    const sentences = ctx.sentences(block)
    for (let i = 1; i < sentences.length; i++) {
      const before = sentences[i - 1] as Sentence
      const sentence = sentences[i] as Sentence
      const kicker =
        KICKER.test(sentence.text) && words(before.text).length <= 8
      const pair = slogan(before.text) && slogan(sentence.text)
      if (!kicker && !pair) continue
      ctx.hit(
        rule,
        block,
        before.start,
        sentence.end,
        kicker
          ? `"${sentence.text}" is a kicker added for rhythm after a short line.`
          : 'Two verbless fragments in a row read as a slogan, not a sentence.',
        'Join them into one plain sentence with a verb, such as "Books close within 48 hours of month end, every month," or cut the kicker.',
      )
      i++
    }
  }
}

export function pithyFragment(ctx: Context) {
  const rule = RHYTHM_RULES.pithyFragment as RuleInfo
  if (ctx.level(rule) === 'off') return
  fragmentRuns(ctx, rule)
  for (const block of ctx.blocks(RHYTHM_KINDS)) {
    for (const sentence of ctx.sentences(block)) {
      const text = sentence.text
      if (!/[.!]$/.test(text)) continue
      const list = words(text)
      if (list.length < 2 || list.length > 6) continue
      if (GREETING.test(text) || MONTH.test(text)) continue
      if (list.every((word) => /^[A-Z0-9]/.test(word))) continue
      if (!verbless(text)) continue
      const strong = TWO_BEAT.some((re) => re.test(text))
      const [left = '', right = ''] = text.split(',')
      const twoBeat =
        text.split(',').length === 2 &&
        words(left).length <= 3 &&
        words(right).length <= 3 &&
        !LEADING_CLAUSE.test(left.trim()) &&
        !LEADING_CLAUSE.test(right.trim())
      if (!strong && !twoBeat) continue
      ctx.hit(
        rule,
        block,
        sentence.start,
        sentence.end,
        'A verbless two-beat fragment reads as a slogan, not a sentence.',
        'Write a full sentence with a subject and a verb that says what happened, or join it to the sentence before.',
        strong ? undefined : 'warning',
      )
    }
  }
}

const CLOSERS = [
  /^(?:and |but |so )?(?:that|this)(?:'s| is| was) (?:a |the |an )?(?:real |big |huge |quick |clear |whole |entire |true |massive )?(?:win|point|game|difference|magic|unlock|story|key|lesson|kicker|catch|trick|game-changer|power|takeaway|upside)\.$/i,
  /^(?:and |but |so )?(?:that|this)(?:'s| is| was) (?:exactly )?what makes [^.]{1,60}(?:interesting|special|different|powerful|unique|useful|valuable|effective|work|works|matter|compelling|worth \w+)\.$/i,
  /^(?:and |but |so )?(?:that|this)(?:'s| is) (?:why|where|how) (?:it|this|that) (?:matters|counts|works)\.$/i,
  /^(?:and |but )?that distinction matters\.$/i,
  /^(?:and |but )?(?:that|this)(?:'s| is) (?:huge|everything|the whole thing|what matters|all that matters)\.$/i,
]

export function stockCloser(ctx: Context) {
  const rule = RHYTHM_RULES.stockCloser as RuleInfo
  const reframe = RHYTHM_RULES.negativeReframe as RuleInfo
  for (const block of ctx.blocks(RHYTHM_KINDS)) {
    for (const sentence of ctx.sentences(block)) {
      const text = sentence.text
      if (CLOSERS.some((re) => re.test(text))) {
        ctx.hit(
          rule,
          block,
          sentence.start,
          sentence.end,
          'A stock kicker that tells the reader how to feel about the last point.',
          'Cut it. If the text already has the number or fact that makes the point, end on that.',
        )
        continue
      }
      if (
        /^(?:but |and )?(?:that|this)(?:'s| is) not (?:how|what|why|where|a|an|the)\b/i.test(
          text,
        ) &&
        words(text).length <= 10
      ) {
        ctx.hit(
          reframe,
          block,
          sentence.start,
          sentence.end,
          'A short "That\'s not ..." line dismisses a view instead of stating one.',
          'Cut it, or say what is true with a fact the text already gives.',
        )
      }
    }
  }
}

const FIGURATIVE_NOUNS =
  'fights?|battles?|hills?|wars?|bets?|gambles?|races?|risks?|horses?|roads?|bridges?|doors?|games?|ships?|cards?'

export function figurativeWorth(ctx: Context) {
  const rule = RHYTHM_RULES.figurativeWorth as RuleInfo
  const strong = new RegExp(`\\b(?:${FIGURATIVE_NOUNS}) worth \\w+ing\\b`, 'gi')
  const reader =
    /\bworth (?:noting|mentioning|knowing|highlighting|calling out|pointing out|flagging|a (?:closer |second )?look)\b/gi
  const any = /\b(\w+) worth (\w+ing)\b/gi
  for (const block of ctx.blocks([...RHYTHM_KINDS, 'list', 'heading'])) {
    const taken: number[] = []
    for (const re of [strong, reader]) {
      re.lastIndex = 0
      for (const found of block.norm.matchAll(re)) {
        const start = found.index ?? 0
        taken.push(start)
        ctx.hit(
          rule,
          block,
          start,
          start + found[0].length,
          re === strong
            ? `"${found[0]}" bends an idiom: you pick a fight, but a fight is not worth picking.`
            : `"${found[0]}" tells the reader to pay attention instead of giving them a reason to.`,
          re === strong
            ? 'Say it literally, such as "I would not compete for that search."'
            : 'Cut it and state the fact.',
        )
      }
    }
    any.lastIndex = 0
    for (const found of block.norm.matchAll(any)) {
      const start = found.index ?? 0
      if (taken.some((at) => at <= start + found[0].length && at >= start - 30))
        continue
      ctx.review(
        'metaphor',
        block,
        start,
        start + found[0].length,
        `Is "${found[0]}" meant literally? If it is an idiom, say plainly what you mean.`,
      )
    }
  }
}

export function staccato(ctx: Context) {
  // A judgement call: a run of short sentences can be a real list.
  if (ctx.preset === 'docs') return
  for (const block of ctx.blocks(RHYTHM_KINDS)) {
    const sentences = ctx.sentences(block)
    let run: Sentence[] = []
    const report = () => {
      if (run.length >= 3) {
        const first = run[0] as Sentence
        const last = run[run.length - 1] as Sentence
        ctx.review(
          'staccato',
          block,
          first.start,
          last.end,
          `Are these ${run.length} short sentences a list of real items, or a drumbeat added for effect? If they are a drumbeat, join two into one sentence that explains the link.`,
        )
      }
      run = []
    }
    for (const sentence of sentences) {
      if (words(sentence.text).length <= 4) run.push(sentence)
      else report()
    }
    report()
  }
}

export function anaphora(ctx: Context) {
  const rule = RHYTHM_RULES.anaphora as RuleInfo
  if (ctx.level(rule) === 'off') return
  for (const block of ctx.blocks(RHYTHM_KINDS)) {
    const sentences = ctx.sentences(block)
    let i = 0
    while (i < sentences.length) {
      const first = words((sentences[i] as Sentence).text)[0]?.toLowerCase()
      let j = i + 1
      while (
        j < sentences.length &&
        first &&
        words((sentences[j] as Sentence).text)[0]?.toLowerCase() === first
      ) {
        j++
      }
      const run = sentences.slice(i, j)
      // "No surprise fees. No hourly billing that creeps higher." Two
      // are enough when each is a "No" + noun line.
      const noRun =
        first === 'no' &&
        j - i >= 2 &&
        run.every(
          (sentence) =>
            /^No (?!one\b|matter\b|doubt\b|longer\b|way\b|wonder\b)[a-z$\d]/.test(
              sentence.text,
            ) && words(sentence.text).length <= 12,
        )
      if (noRun) {
        ctx.hit(
          rule,
          block,
          (sentences[i] as Sentence).start,
          (sentences[j - 1] as Sentence).end,
          `${j - i} sentences in a row start with "No", a drumbeat of things the product is not.`,
          'Say what it is in one sentence, and keep only the one "no" a reader needs, such as "One flat monthly fee with no tiers."',
        )
      } else if (
        j - i >= 3 &&
        first &&
        !['the', 'a', 'an', 'i', 'in', 'on', 'for', 'it', 'this'].includes(
          first,
        )
      ) {
        const short = run.every((sentence) => words(sentence.text).length <= 7)
        if (short && /^(?:it's|they|we|you)$/.test(first)) {
          ctx.hit(
            rule,
            block,
            (sentences[i] as Sentence).start,
            (sentences[j - 1] as Sentence).end,
            `${j - i} short sentences in a row start with "${first}".`,
            'Merge them into one sentence or a short list.',
          )
        } else {
          ctx.review(
            'anaphora',
            block,
            (sentences[i] as Sentence).start,
            (sentences[j - 1] as Sentence).end,
            `${j - i} sentences in a row start with "${first}". Does the repeat help the reader follow a real list, or is it there for rhythm?`,
          )
        }
      }
      i = j
    }
  }
}
