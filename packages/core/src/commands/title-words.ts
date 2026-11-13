import { STOPWORDS } from '../analyze/content-coverage-analysis.js'

// How many of the ranking titles use each word and each two-word phrase,
// counted in code. A title counts once per word however often it repeats
// it. Common words (the, for, how) are kept and marked, so a reader can see
// them or hide them.

export type TitleWord = {
  text: string
  // Titles that contain it, and their share of all titles read.
  titles: number
  share: number
  common: boolean
}

export type TitleWords = {
  titles: number
  words: TitleWord[]
  phrases: TitleWord[]
}

const LIMIT = 60

// The content stopwords plus pronouns and helper verbs, which say little
// about a title's topic. Question words other than how stay visible.
const COMMON = new Set([
  ...STOPWORDS,
  'i',
  'it',
  'its',
  'you',
  'your',
  'they',
  'their',
  'we',
  'our',
  'my',
  'this',
  'that',
  'do',
])

// Lowercase words without accents, keeping an apostrophe inside a word so
// what's stays what's.
function terms(title: string): string[] {
  return title
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’‘]/gu, "'")
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^\p{L}\p{N}']+/u)
    .map((token) => token.replace(/^'+|'+$/g, ''))
    .filter(
      (token) =>
        token.length > 1 ||
        /\p{N}/u.test(token) ||
        [...token].some((char) => (char.codePointAt(0) ?? 0) > 127),
    )
}

function ranked(counts: Map<string, number>, titles: number): TitleWord[] {
  return [...counts]
    .map(([text, count]) => ({
      text,
      titles: count,
      share: Math.round((count / titles) * 1000) / 1000,
      common: text.split(' ').every((part) => COMMON.has(part)),
    }))
    .sort((a, b) => b.titles - a.titles || a.text.localeCompare(b.text))
    .slice(0, LIMIT)
}

export function titleWords(titles: string[]): TitleWords {
  const read = titles.filter((title) => title.trim())
  const words = new Map<string, number>()
  const phrases = new Map<string, number>()
  for (const title of read) {
    const tokens = terms(title)
    for (const word of new Set(tokens)) {
      words.set(word, (words.get(word) ?? 0) + 1)
    }
    const pairs = new Set(
      tokens.slice(1).map((token, index) => `${tokens[index]} ${token}`),
    )
    for (const pair of pairs) phrases.set(pair, (phrases.get(pair) ?? 0) + 1)
  }
  const count = Math.max(read.length, 1)
  return {
    titles: read.length,
    words: ranked(words, count),
    // A phrase in one title only is noise, not a pattern.
    phrases: ranked(
      new Map([...phrases].filter(([, seen]) => seen > 1)),
      count,
    ),
  }
}
