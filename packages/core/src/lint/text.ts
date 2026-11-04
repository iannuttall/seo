import type { Block, Sentence } from './types.js'

// Sentence and word helpers for the linter.

const ABBREVIATION =
  /(?:^|[\s(])(?:e\.g|i\.e|etc|vs|cf|approx|incl|Mr|Mrs|Ms|Dr|St|Inc|Ltd|Co|No|Fig|[A-Z])$/

// Sentences in a block, with their positions in the block text. A sentence
// ends at . ! or ? before a space and a capital, digit, quote or bracket, or
// at the end of the block.
export function splitSentences(text: string): Sentence[] {
  const result: Sentence[] = []
  const end = /[.!?]+["')\]\u201d\u2019]*(?=\s|$)/g
  let start = 0
  for (const match of text.matchAll(end)) {
    const stop = (match.index ?? 0) + match[0].length
    const rest = text.slice(stop).trimStart()
    if (rest && !/^["'(\u201c\u2018[]?[A-Z0-9]/.test(rest)) continue
    if (match[0].startsWith('.') && match[0].length === 1) {
      const before = text.slice(start, match.index)
      if (ABBREVIATION.test(before)) continue
    }
    push(result, text, start, stop)
    start = stop
  }
  push(result, text, start, text.length)
  return result
}

function push(result: Sentence[], text: string, from: number, to: number) {
  let start = from
  let end = to
  while (start < end && /\s/.test(text[start] ?? '')) start++
  while (end > start && /\s/.test(text[end - 1] ?? '')) end--
  if (end > start) result.push({ start, end, text: text.slice(start, end) })
}

export function words(text: string): string[] {
  return text.match(/[A-Za-z0-9][A-Za-z0-9'\u2019-]*/g) ?? []
}

const FINITE = new Set(
  `am is are was were be been being has have had do does did can could will would shall should may might must
  get gets got make makes made run runs ran go goes went take takes took need needs want wants say says said
  show shows showed see sees saw find finds found work works worked keep keeps kept give gives gave help helps
  helped let lets use uses used come comes came put puts look looks looked feel feels felt know knows knew
  think thinks thought seem seems seemed become becomes became rank ranks ranked send sends sent land lands
  landed sit sits sat hold holds held cost costs tell tells told mean means meant pay pays paid win wins won
  matter matters mattered stay stays stayed count counts counted read reads write writes wrote add adds added
  check checks checked start starts started stop stops stopped change changes changed fix fixes fixed try tries
  tried ask asks asked call calls called move moves moved turn turns turned build builds built ship ships
  shipped lose loses lost grow grows grew drop drops dropped rise rises rose fall falls fell link links linked
  point points pointed lead leads led sell sells sold buy buys bought open opens opened miss misses missed
  happen happens happened leave leaves left bring brings brought live lives lived set sets love loves loved
  like likes liked hate hates`.split(/\s+/),
)

// True when no word in the sentence looks like a finite verb. A rough
// check, used only on very short sentences.
export function verbless(sentence: string): boolean {
  for (const raw of words(sentence)) {
    const word = raw.toLowerCase().replace(/\u2019/g, "'")
    if (FINITE.has(word)) return false
    if (/(?:n't|'s|'re|'ve|'ll|'d|'m)$/.test(word)) return false
  }
  return true
}

// The sentences of a block, cached.
export function sentencesOf(
  cache: Map<Block, Sentence[]>,
  block: Block,
): Sentence[] {
  let found = cache.get(block)
  if (!found) {
    found = splitSentences(block.norm)
    cache.set(block, found)
  }
  return found
}

export function sentenceAt(sentences: Sentence[], index: number): Sentence {
  for (const sentence of sentences) {
    if (index >= sentence.start && index < sentence.end) return sentence
  }
  return sentences[sentences.length - 1] ?? { start: 0, end: 0, text: '' }
}
