import { type Context, insideQuotes, type RuleInfo } from './engine.js'
import { sentenceAt, verbless, words } from './text.js'
import type { Block, BlockKind, Sentence } from './types.js'

// Sentence-shape rules: contrasts, fragments, closers and rhythm. Some
// thresholds come from eric-tramel/slop-guard and conorbronsdon/
// avoid-ai-writing (both MIT); counts are relative to the document.

const SENTENCE_KINDS: BlockKind[] = ['paragraph', 'quote', 'prop', 'list']
const RHYTHM_KINDS: BlockKind[] = ['paragraph', 'quote', 'prop']

export const STRUCTURE_RULES: Record<string, RuleInfo> = {
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
      'A verbless two-beat fragment: "Same essay, two titles." "Simple, but powerful."',
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
      'Three or more very short sentences in a row that start with "No", "It\'s", "They", "We" or "You": "No cookies. No tracking. No banners."',
  },
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
      'Lists of three, more often than about one per 100 words, or three abstract nouns in a row.',
  },
  inventedLabel: {
    id: 'invented-label',
    family: 'ai',
    level: 'warning',
    description:
      'Two or more coined labels such as "the integration tax" or "the supervision paradox".',
  },
  pseudoCleft: {
    id: 'pseudo-cleft',
    family: 'ai',
    level: 'warning',
    description:
      'Repeated "What makes this work is ..." or "The problem is that ..." setups.',
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

function negativeParallelism(ctx: Context) {
  const rule = STRUCTURE_RULES.negativeParallelism as RuleInfo
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
const PREPOSITIONS = new Set(
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

function contrastReframe(ctx: Context) {
  const rule = STRUCTURE_RULES.contrastReframe as RuleInfo
  if (ctx.level(rule) === 'off') return
  for (const block of ctx.blocks([...SENTENCE_KINDS, 'heading'])) {
    for (const sentence of ctx.sentences(block)) {
      const text = sentence.text
      const re = /,\s+not\s+|\s+rather than\s+/gi
      for (const found of text.matchAll(re)) {
        const at = found.index ?? 0
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

function heresAnnouncement(ctx: Context) {
  const rule = STRUCTURE_RULES.heresAnnouncement as RuleInfo
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
      let level: 'error' | 'warning' | null = null
      if (colon && count <= 4) level = 'error'
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

function pithyFragment(ctx: Context) {
  const rule = STRUCTURE_RULES.pithyFragment as RuleInfo
  if (ctx.level(rule) === 'off') return
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

function stockCloser(ctx: Context) {
  const rule = STRUCTURE_RULES.stockCloser as RuleInfo
  const reframe = STRUCTURE_RULES.negativeReframe as RuleInfo
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
          'Cut it. If the point needs support, give the number or fact that makes it true.',
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
          'Say what is true instead, such as "Agents can do this work in a day."',
        )
      }
    }
  }
}

const FIGURATIVE_NOUNS =
  'fights?|battles?|hills?|wars?|bets?|gambles?|races?|risks?|horses?|roads?|bridges?|doors?|games?|ships?|cards?'

function figurativeWorth(ctx: Context) {
  const rule = STRUCTURE_RULES.figurativeWorth as RuleInfo
  const strong = new RegExp(`\\b(?:${FIGURATIVE_NOUNS}) worth \\w+ing\\b`, 'gi')
  const reader =
    /\bworth (?:noting|mentioning|knowing|highlighting|calling out|pointing out|flagging|a (?:closer |second )?look|your time|the (?:wait|hype|effort|read))\b/gi
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

function staccato(ctx: Context) {
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

function anaphora(ctx: Context) {
  const rule = STRUCTURE_RULES.anaphora as RuleInfo
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
      if (
        j - i >= 3 &&
        first &&
        !['the', 'a', 'an', 'i', 'in', 'on', 'for', 'it', 'this'].includes(
          first,
        )
      ) {
        const run = sentences.slice(i, j)
        const short = run.every((sentence) => words(sentence.text).length <= 7)
        if (short && /^(?:it's|no|they|we|you)$/.test(first)) {
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

const TIER2 =
  /\b(?:crucial(?:ly)?|pivotal|vibrant|comprehensive|enhanc(?:e|es|ed|ing|ement)|foster(?:s|ed|ing)?|harness(?:es|ed|ing)?|navigat(?:e|es|ed|ing)|streamlin(?:e|es|ed|ing)|empower(?:s|ed|ing|ment)?|elevat(?:e|es|ed|ing)|unleash(?:es|ed|ing)?|transformative|nuanced?|myriad|plethora|encompass(?:es|ed|ing)?|cultivat(?:e|es|ed|ing)|resonat(?:e|es|ed|ing)|cornerstone|poised|burgeoning|nascent|quintessential|overarching|actionable|impactful|landscape|ecosystem|journey|additionally|notably|moreover|furthermore|profound(?:ly)?|quietly|fundamentally|remarkabl[ey]|arguably|invaluable|deeply (?:rooted|committed|integrated|personal|meaningful))\b/gi
const TECHNICAL = /^(?:comprehensive|ecosystem|streamlin|navigat)/i

function vocabularyCluster(ctx: Context) {
  const rule = STRUCTURE_RULES.vocabularyCluster as RuleInfo
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

const TRIAD =
  /\b[\w'-]+(?: [\w'-]+){0,2}, [\w'-]+(?: [\w'-]+){0,2},? and [\w'-]+\b/g
const ABSTRACT_TRIAD =
  /\b[a-z]+(?:tion|sion|ity|ness|ment|ence|ance|ism), (?:and )?[a-z]+(?:tion|sion|ity|ness|ment|ence|ance|ism),? and [a-z]+(?:tion|sion|ity|ness|ment|ence|ance|ism)\b/gi

function triads(ctx: Context) {
  const rule = STRUCTURE_RULES.triad as RuleInfo
  if (ctx.level(rule) === 'off') return
  const found: Array<{ block: Block; start: number; end: number }> = []
  for (const block of ctx.blocks(['paragraph', 'quote', 'prop'])) {
    TRIAD.lastIndex = 0
    for (const match of block.norm.matchAll(TRIAD)) {
      found.push({
        block,
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
      })
    }
    ABSTRACT_TRIAD.lastIndex = 0
    for (const match of block.norm.matchAll(ABSTRACT_TRIAD)) {
      ctx.hit(
        rule,
        block,
        match.index ?? 0,
        (match.index ?? 0) + match[0].length,
        'Three abstract nouns in a row sound weighty but say little.',
        'Keep the one that matters and give an example of it.',
      )
    }
  }
  const limit = Math.max(3, Math.ceil(ctx.proseWords / 100))
  if (found.length > limit) {
    const third = found[limit] as (typeof found)[number]
    ctx.hit(
      rule,
      third.block,
      third.start,
      third.end,
      `${found.length} lists of three in ${ctx.proseWords.toLocaleString('en-US')} words of prose. More than about one per 100 words sounds formulaic.`,
      'Turn some of them into two items, four items or a sentence that ranks them.',
    )
  }
}

function countedPatterns(ctx: Context) {
  const labels = STRUCTURE_RULES.inventedLabel as RuleInfo
  const clefts = STRUCTURE_RULES.pseudoCleft as RuleInfo
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

function boldLabels(ctx: Context) {
  const rule = STRUCTURE_RULES.boldLabels as RuleInfo
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

export function runStructureRules(ctx: Context) {
  negativeParallelism(ctx)
  contrastReframe(ctx)
  heresAnnouncement(ctx)
  pithyFragment(ctx)
  stockCloser(ctx)
  figurativeWorth(ctx)
  staccato(ctx)
  anaphora(ctx)
  vocabularyCluster(ctx)
  triads(ctx)
  countedPatterns(ctx)
  boldLabels(ctx)
}
