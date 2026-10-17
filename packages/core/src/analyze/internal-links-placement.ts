// Where a link to the target fits on a source page: the source sentences
// that name the target, and real phrases from them as anchor text. Pure text
// work with no DOM and no network, so it runs in Node and in Workers. Term
// weights (TF-IDF) come from the pages checked in the same run.

export interface LinkSentence {
  text: string
  // The heading the sentence sits under, or '' before the first heading.
  section: string
  // The sentence already carries a link.
  hasLink: boolean
}

export interface PlacementPage {
  url: string
  title: string
  h1: string
  description: string
  headings: string[]
  sentences: LinkSentence[]
}

export interface LinkPlacement {
  // Cosine similarity of the two pages' TF-IDF vectors, 0 to 1. A heuristic.
  contentSimilarity: number
  sentences: Array<{
    text: string
    section: string
    // Share of the target's naming terms (title, h1, description, URL)
    // the sentence contains, weighted by rarity, 0 to 1.
    match: number
    anchors: string[]
  }>
}

// Bounds per page: sentences kept for placement, and terms per vector.
export const MAX_PAGE_SENTENCES = 250
const MAX_TERMS = 100
const PLACEMENT_SENTENCES = 2
const ANCHORS_PER_SENTENCE = 3
const MIN_SENTENCE_WORDS = 6
const NAME_WEIGHT = 2

// Anchor text that names nothing.
export const GENERIC_ANCHORS =
  /^(click here|here|read more|learn more|more|this|this post|this article|this page|link|website|check it out|see more|view|continue reading)$/i

// --- Words -----------------------------------------------------------------

// Lower case, no accents, "don't" to "dont", "&" to "and", every other mark
// a space.
function normalise(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .normalize('NFC')
    .replace(/([\p{L}\p{N}])[’'`]([\p{L}\p{N}])/gu, '$1$2')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const words = (value: string) => normalise(value).split(' ').filter(Boolean)

// English function words: never the edge of an anchor, never a matching term.
const FUNCTION_WORDS: ReadonlySet<string> = new Set(
  'a an and are as at be but by for from has have how if in into is it its of on or that the their then there these they this to was we were what when where which who why will with you your our can do does not just more most also than too very about after before over under again all any each other some such no nor only own same so up out off one two both every few several many much should would could because while since although though until unless whether however'.split(
    ' ',
  ),
)

const NOT_PLURAL = new Set([
  'always',
  'atlas',
  'canvas',
  'gas',
  'lens',
  'means',
  'news',
  'perhaps',
  'series',
  'species',
  'sometimes',
  'whereas',
  'yes',
  'this',
  'has',
  'was',
  'does',
  'its',
])
const CHE = new Set([
  'caches',
  'niches',
  'headaches',
  'cliches',
  'avalanches',
  'moustaches',
])
const NOT_AGENT = new Set([
  'customer',
  'together',
  'however',
  'whatever',
  'whenever',
  'wherever',
  'remember',
  'consider',
  'character',
  'register',
  'november',
  'december',
  'september',
  'october',
])

function singular(word: string): string {
  if (
    word.length <= 3 ||
    !/^[a-z]+$/.test(word) ||
    NOT_PLURAL.has(word) ||
    /(ss|us|is)$/.test(word)
  ) {
    return word
  }
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`
  if (/(xes|ches|shes|sses)$/.test(word) && !CHE.has(word)) {
    return word.slice(0, -2)
  }
  return word.endsWith('s') ? word.slice(0, -1) : word
}

// A word's plain form: "followed", "following" and "follows" are "follow".
// English suffix rules only touch plain a-z words.
function stem(word: string): string {
  const one = singular(word)
  if (!/^[a-z]+$/.test(one)) return one
  if (
    one.length >= 8 &&
    one.endsWith('er') &&
    !one.endsWith('eer') &&
    one.at(-3) !== one.at(-4) &&
    !NOT_AGENT.has(one)
  ) {
    return one.slice(0, -2)
  }
  if (one.length > 5 && one.endsWith('ly')) return one.slice(0, -2)
  if (one.length > 5 && one.endsWith('ed') && !one.endsWith('eed')) {
    return one.slice(0, -2)
  }
  if (one.length > 6 && one.endsWith('ing')) return one.slice(0, -3)
  return one
}

// The terms of a text for matching: no function words or bare numbers, in
// their plain form.
const terms = (text: string): string[] =>
  words(text)
    .filter(
      (word) =>
        word.length > 1 && !FUNCTION_WORDS.has(word) && !/^\d+$/.test(word),
    )
    .map(stem)

const slugWords = (url: string) => {
  try {
    return new URL(url).pathname
      .split(/[/._-]+/)
      .filter(Boolean)
      .join(' ')
  } catch {
    return ''
  }
}

// The terms that name a page, with a weight: 2 for the title, h1 and URL
// path, 1 for words only in the meta description.
// The site's own name (the title after its last separator, and the first
// label of the host) is left out: every page carries it.
export function keyTerms(page: PlacementPage): Map<string, number> {
  const key = new Map<string, number>()
  const title = page.title.replace(
    /\s+[|\u2013\u2014-]\s+[^|\u2013\u2014]*$/u,
    '',
  )
  for (const term of terms(page.description)) key.set(term, 1)
  // The last part of the URL path names the page; folders name a section.
  for (const term of terms(
    `${title} ${page.h1} ${lastSegmentWords(page.url)}`,
  )) {
    key.set(term, NAME_WEIGHT)
  }
  for (const term of terms(siteName(page.url))) key.delete(term)
  return key
}

function lastSegmentWords(url: string): string {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean)
    return (segments.at(-1) ?? '').split(/[._-]+/).join(' ')
  } catch {
    return ''
  }
}

function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, '').split('.')[0] ?? ''
  } catch {
    return ''
  }
}

// Term counts for a page's vector, with naming text weighted up.
export function termCounts(page: PlacementPage): Record<string, number> {
  const counts: Record<string, number> = {}
  const add = (text: string, weight: number) => {
    for (const term of terms(text)) counts[term] = (counts[term] ?? 0) + weight
  }
  add(page.title, 3)
  add(page.h1, 3)
  add(slugWords(page.url), 3)
  add(page.description, 2)
  for (const heading of page.headings) add(heading, 2)
  for (const sentence of page.sentences) add(sentence.text, 1)
  return counts
}

// --- Sentences from HTML -----------------------------------------------------

const SKIP = new Set([
  'script',
  'style',
  'noscript',
  'svg',
  'template',
  'iframe',
  'select',
])
const CHROME = new Set(['nav', 'header', 'footer', 'aside'])
const MAIN = new Set(['main', 'article'])
const BLOCK = new Set(
  'p div li h1 h2 h3 h4 h5 h6 blockquote td th dd dt pre section article main aside header footer nav figcaption summary details tr ul ol table body form'.split(
    ' ',
  ),
)
const VOID = new Set([
  'br',
  'hr',
  'img',
  'input',
  'meta',
  'link',
  'wbr',
  'source',
  'col',
  'embed',
])
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '\u2014',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}
// A quoted attribute value may hold ">", so it is read to its closing quote.
const TAG_ATTRS = String.raw`(?:[^>"'=]|=\s*"[^"]*"|=\s*'[^']*'|=(?!\s*["'])|["'])*`
// Marks anchor text inside a block, so a sentence knows it already links.
const A_OPEN = '\u0001'
const UNSPACED =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u

function decode(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, code: string) => {
      if (code[0] === '#') {
        const hex = code[1] === 'x' || code[1] === 'X'
        const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10)
        return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
      }
      return ENTITIES[code.toLowerCase()] ?? match
    },
  )
}

const clean = (value: string) =>
  value.split(A_OPEN).join('').replace(/\s+/g, ' ').trim()

function splitSentences(block: string): string[] {
  return block
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])|(?<=[。！？])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length <= 500)
}

// The main-content sentences of an HTML page, with the heading each sits
// under and whether it already carries a link. Navigation, headers, footers
// and asides outside the main content are left out. At most
// MAX_PAGE_SENTENCES are kept.
export function pageSentences(html: string): LinkSentence[] {
  const sentences: LinkSentence[] = []
  const hasMain = /<(main|article)[\s>]|role=["']main["']/i.test(html)
  const stack: { tag: string; main: boolean; chrome: boolean }[] = []
  let skip = 0
  let chrome = 0
  let mainDepth = 0
  let main = hasMain ? 0 : 1
  let section = ''
  let buffer = ''
  let inAnchor = false

  // Ends a text run. The raw text keeps the link marks for hasLink.
  const flushRaw = (tag: string) => {
    const raw = buffer
    const text = clean(raw)
    buffer = ''
    if (!text || sentences.length >= MAX_PAGE_SENTENCES) return
    if (/^h[1-6]$/.test(tag)) {
      if (tag !== 'h1') section = text
      return
    }
    for (const part of tag === 'li' ? [raw] : splitSentences(raw)) {
      const sentence = clean(part)
      if (
        (sentence.length >= 25 && sentence.split(' ').length >= 4) ||
        (UNSPACED.test(sentence) && sentence.length >= 10)
      ) {
        if (sentences.length >= MAX_PAGE_SENTENCES) return
        sentences.push({
          text: sentence,
          section,
          hasLink: part.includes(A_OPEN),
        })
      }
    }
  }
  const closeTo = (tag: string) => {
    if (!stack.some((entry) => entry.tag === tag)) return
    while (stack.length) {
      const entry = stack.pop()
      if (!entry) break
      flushRaw(entry.tag)
      if (entry.main) {
        main -= 1
        mainDepth -= 1
      }
      if (entry.chrome) chrome -= 1
      if (entry.tag === tag) break
    }
  }

  const tokens = html.matchAll(
    new RegExp(
      String.raw`<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([a-zA-Z][\w:-]*)(${TAG_ATTRS})>|([^<]+)`,
      'g',
    ),
  )
  for (const match of tokens) {
    const [whole, close, rawTag, rawAttrs = '', text] = match
    if (text !== undefined) {
      if (!skip && main > 0 && chrome === 0) buffer += decode(text)
      continue
    }
    if (!rawTag) continue
    const tag = rawTag.toLowerCase()
    if (skip) {
      if (close && SKIP.has(tag)) skip -= 1
      continue
    }
    if (close) {
      if (tag === 'a') inAnchor = false
      else if (BLOCK.has(tag)) closeTo(tag)
      continue
    }
    if (SKIP.has(tag)) {
      if (!whole.endsWith('/>')) skip += 1
      continue
    }
    if (tag === 'br') buffer += ' '
    if (tag === 'a' && !inAnchor && /\bhref\s*=/i.test(rawAttrs)) {
      inAnchor = true
      if (main > 0 && chrome === 0) buffer += A_OPEN
    }
    if (VOID.has(tag) || !BLOCK.has(tag)) continue
    // A block inside a block ends the outer text run (div > p, li > p).
    const parent = stack[stack.length - 1]
    if (parent) flushRaw(parent.tag)
    const role = /\brole\s*=\s*["']?main/i.test(rawAttrs)
    const isMain = MAIN.has(tag) || role
    // header and footer inside an article belong to it; nav and aside never do.
    const isChrome =
      tag === 'nav' || tag === 'aside' || (CHROME.has(tag) && mainDepth === 0)
    if (isMain) {
      main += 1
      mainDepth += 1
    }
    if (isChrome) chrome += 1
    stack.push({ tag, main: isMain, chrome: isChrome })
  }
  while (stack.length) {
    const last = stack[stack.length - 1]
    if (!last) break
    closeTo(last.tag)
  }
  flushRaw('')
  return sentences
}

// --- Weights and placement ---------------------------------------------------

// TF-IDF over the pages checked in one run.
export class LinkCorpus {
  private readonly df = new Map<string, number>()
  private readonly size: number

  constructor(pages: Array<Record<string, number>>) {
    this.size = pages.length
    for (const counts of pages) {
      for (const term in counts) this.df.set(term, (this.df.get(term) ?? 0) + 1)
    }
  }

  idf(term: string): number {
    return Math.log((this.size + 1) / ((this.df.get(term) ?? 1) + 1)) + 1
  }

  // A unit-length vector of a page's heaviest shared terms. A term used by
  // one page only cannot match another page, so it only adds to the length.
  vector(counts: Record<string, number>): Map<string, number> {
    let norm = 0
    const shared: Array<[string, number]> = []
    for (const term in counts) {
      const weight = (1 + Math.log(counts[term] ?? 1)) * this.idf(term)
      norm += weight * weight
      if ((this.df.get(term) ?? 0) >= 2) shared.push([term, weight])
    }
    norm = Math.sqrt(norm) || 1
    shared.sort(
      (left, right) =>
        right[1] - left[1] ||
        (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0),
    )
    return new Map(
      shared.slice(0, MAX_TERMS).map(([term, weight]) => [term, weight / norm]),
    )
  }

  similarity(left: Map<string, number>, right: Map<string, number>): number {
    let sum = 0
    for (const [term, weight] of left) sum += weight * (right.get(term) ?? 0)
    return sum
  }

  // How much of the target's naming terms a sentence has, weighted by
  // rarity and by where the term names the target, 0 to 1.
  sentenceScore(sentence: string, key: Map<string, number>): number {
    if (!key.size) return 0
    const seen = new Set(terms(sentence))
    let hit = 0
    let total = 0
    for (const [term, place] of key) {
      const weight = this.idf(term) * place
      total += weight
      if (seen.has(term)) hit += weight
    }
    return total ? hit / total : 0
  }
}

// Real phrases of one to four words from a sentence, best first. Each has a
// word from the target's title, h1 or URL; then more naming words and rarer
// words rank higher.
function anchorCandidates(
  sentence: string,
  key: Map<string, number>,
  corpus: LinkCorpus,
  limit: number,
): string[] {
  const scored = new Map<string, { text: string; score: number }>()
  const parts = sentence
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
  // Two to four words: a single word rarely reads as a link.
  for (let size = 2; size <= 4; size += 1) {
    for (let start = 0; start + size <= parts.length; start += 1) {
      const gram = parts.slice(start, start + size)
      const first = (gram[0] ?? '').toLowerCase()
      const last = (gram[size - 1] ?? '').toLowerCase()
      if (
        FUNCTION_WORDS.has(first) ||
        FUNCTION_WORDS.has(last) ||
        /^\d+$/.test(first) ||
        /^\d+$/.test(last)
      ) {
        continue
      }
      const stems = terms(gram.join(' '))
      if (stems.length < 2) continue
      const hits = stems.filter((term) => key.has(term)).length
      const named = stems.reduce(
        (sum, term) => sum + (key.get(term) ?? 0) * corpus.idf(term),
        0,
      )
      if (!stems.some((term) => key.get(term) === NAME_WEIGHT)) continue
      // A phrase starts and ends on words that name the target, so it does
      // not trail into the rest of the sentence.
      const edges =
        Number(key.has(terms(first)[0] ?? '')) +
        Number(key.has(terms(last)[0] ?? ''))
      if (edges < 2) continue
      const text = gram.join(' ')
      const lower = text.toLowerCase()
      if (GENERIC_ANCHORS.test(lower)) continue
      const rarity = stems.reduce((sum, term) => sum + corpus.idf(term), 0)
      const score =
        named * (1 + hits / key.size) + rarity * 0.05 - (size === 4 ? 0.2 : 0)
      const existing = scored.get(lower)
      if (!existing || existing.score < score)
        scored.set(lower, { text, score })
    }
  }
  return [...scored.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.text < right.text ? -1 : left.text > right.text ? 1 : 0),
    )
    .slice(0, limit)
    .map((item) => item.text)
}

// The sentences on the source that could carry a link to the target, with
// anchor text from each. Sentences that already link, and short ones, are
// left out.
export function linkPlacement(
  source: PlacementPage,
  target: PlacementPage,
  corpus: LinkCorpus,
): LinkPlacement {
  const key = keyTerms(target)
  const contentSimilarity = corpus.similarity(
    corpus.vector(termCounts(source)),
    corpus.vector(termCounts(target)),
  )
  const seen = new Set<string>()
  const sentences = source.sentences
    .filter((sentence) => {
      // A page can repeat a sentence, such as an answer shown twice.
      if (seen.has(sentence.text)) return false
      seen.add(sentence.text)
      return (
        !sentence.hasLink &&
        sentence.text.split(/\s+/).length >= MIN_SENTENCE_WORDS
      )
    })
    .map((sentence, index) => ({
      sentence,
      index,
      match: corpus.sentenceScore(sentence.text, key),
    }))
    .filter((item) => item.match > 0)
    .sort((left, right) => right.match - left.match || left.index - right.index)
    .slice(0, PLACEMENT_SENTENCES)
    .map(({ sentence, match }) => ({
      text: sentence.text,
      section: sentence.section,
      match: Math.round(match * 100) / 100,
      anchors: anchorCandidates(
        sentence.text,
        key,
        corpus,
        ANCHORS_PER_SENTENCE,
      ),
    }))
    .filter((item) => item.anchors.length > 0)
  return {
    contentSimilarity: Math.round(contentSimilarity * 100) / 100,
    sentences,
  }
}

// The text a page needs for placement, from its HTML and extracted facts.
export function placementPage(input: {
  url: string
  html: string
  title?: string
  metaDescription?: string
  headings: Array<{ level: number; text: string }>
}): PlacementPage {
  return {
    url: input.url,
    title: input.title ?? '',
    h1: input.headings.find((heading) => heading.level === 1)?.text ?? '',
    description: input.metaDescription ?? '',
    headings: input.headings
      .filter((heading) => heading.level === 2 || heading.level === 3)
      .slice(0, 8)
      .map((heading) => heading.text),
    sentences: pageSentences(input.html),
  }
}
