import type { GscRow } from '../types.js'

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'best',
  'by',
  'for',
  'free',
  'from',
  'guide',
  'how',
  'in',
  'is',
  'of',
  'on',
  'online',
  'or',
  'page',
  'seo',
  'site',
  'the',
  'to',
  'tool',
  'use',
  'website',
  'what',
  'when',
  'where',
  'which',
  'with',
])

export function compareInternalLinkText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function normalizeInternalLinkQuery(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[’']/g, "'")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeInternalLinkUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    url.hash = ''
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '')
    return url.toString()
  } catch {
    return undefined
  }
}

export function validInternalLinkRow(row: GscRow): boolean {
  const [query, page] = row.keys
  return Boolean(
    normalizeInternalLinkQuery(query ?? '') &&
      normalizeInternalLinkUrl(page ?? '') &&
      Number.isFinite(row.clicks) &&
      row.clicks >= 0 &&
      Number.isFinite(row.impressions) &&
      row.impressions > 0 &&
      row.clicks <= row.impressions &&
      Number.isFinite(row.ctr) &&
      row.ctr >= 0 &&
      row.ctr <= 1 &&
      Number.isFinite(row.position) &&
      row.position > 0,
  )
}

export function internalLinkTokens(query: string): string[] {
  const normalized = normalizeInternalLinkQuery(query)
  const tokens =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? [
          ...new Intl.Segmenter('und', { granularity: 'word' }).segment(
            normalized,
          ),
        ]
          .filter((part) => part.isWordLike)
          .map((part) => part.segment)
      : (normalized.match(/[\p{L}\p{N}]+/gu) ?? [])
  return [
    ...new Set(
      tokens.filter(
        (token) =>
          !STOPWORDS.has(token) &&
          !/^\p{N}+$/u.test(token) &&
          ([...token].length > 1 || /[^\p{ASCII}]/u.test(token)),
      ),
    ),
  ]
}

export interface InternalLinkLexicalScore {
  score: number
  weightedJaccard: number
  targetCoverage: number
  sourceCoverage: number
  sharedTerms: string[]
}

export function createInternalLinkLexicalScorer(
  queries: string[],
): (
  sourceQuery: string,
  targetQuery: string,
) => InternalLinkLexicalScore | undefined {
  const tokenCache = new Map<string, string[]>()
  const tokensFor = (query: string): string[] => {
    const key = normalizeInternalLinkQuery(query)
    const cached = tokenCache.get(key)
    if (cached) return cached
    const tokens = internalLinkTokens(query)
    tokenCache.set(key, tokens)
    return tokens
  }
  const documents = [
    ...new Set(queries.map(normalizeInternalLinkQuery).filter(Boolean)),
  ].map(tokensFor)
  const documentFrequency = new Map<string, number>()
  for (const document of documents) {
    for (const token of new Set(document)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    }
  }
  const documentCount = Math.max(1, documents.length)
  const frequencyLimit = Math.max(3, Math.ceil(documentCount * 0.1))
  const weight = (token: string): number =>
    Math.log((documentCount + 1) / ((documentFrequency.get(token) ?? 0) + 1)) +
    1
  const informative = (tokens: string[]): string[] =>
    tokens.filter(
      (token) => (documentFrequency.get(token) ?? 0) <= frequencyLimit,
    )

  return (sourceQuery, targetQuery) => {
    const source = informative(tokensFor(sourceQuery))
    const target = informative(tokensFor(targetQuery))
    if (source.length < 2 || target.length < 2) return undefined
    const targetSet = new Set(target)
    const sharedTerms = source
      .filter((token) => targetSet.has(token))
      .sort(compareInternalLinkText)
    if (sharedTerms.length < 2) return undefined
    const union = new Set([...source, ...target])
    const sharedWeight = sharedTerms.reduce(
      (sum, token) => sum + weight(token),
      0,
    )
    const targetWeight = target.reduce((sum, token) => sum + weight(token), 0)
    const sourceWeight = source.reduce((sum, token) => sum + weight(token), 0)
    const unionWeight = [...union].reduce(
      (sum, token) => sum + weight(token),
      0,
    )
    const targetCoverage = sharedWeight / targetWeight
    const sourceCoverage = sharedWeight / sourceWeight
    const weightedJaccard = sharedWeight / unionWeight
    const score =
      weightedJaccard * 0.5 + targetCoverage * 0.25 + sourceCoverage * 0.25

    if (
      targetCoverage < 2 / 3 ||
      sourceCoverage < 2 / 3 ||
      weightedJaccard < 0.6 ||
      score < 0.72
    ) {
      return undefined
    }
    return {
      score: Number(score.toFixed(4)),
      weightedJaccard: Number(weightedJaccard.toFixed(4)),
      targetCoverage: Number(targetCoverage.toFixed(4)),
      sourceCoverage: Number(sourceCoverage.toFixed(4)),
      sharedTerms,
    }
  }
}
