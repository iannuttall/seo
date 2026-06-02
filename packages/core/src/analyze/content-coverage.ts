import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

export type CoverageField = {
  phraseCount: number
  matchedTerms: string[]
  missingTerms: string[]
  termCoverage: number
}

export type QueryContentCoverage = {
  verifiedAt: string
  url: string
  finalUrl?: string
  status: 'verified' | 'failed'
  error?: string
  wordCount?: number
  contentGapScore: number
  queryTerms: string[]
  fields: {
    title: CoverageField
    metaDescription: CoverageField
    mainContent: CoverageField
  }
  summary: string
}

export function normalizeForCoverage(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/([a-z0-9])[’']([a-z0-9])/gi, '$1$2')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function queryTerms(query: string): string[] {
  const tokens = normalizeForCoverage(query)
    .split(' ')
    .filter((token) => token.length > 1)
  const meaningful = tokens.filter(
    (token) => token.length > 2 && !STOPWORDS.has(token),
  )
  return [...new Set(meaningful.length ? meaningful : tokens)]
}

function countPhrase(query: string, text: string): number {
  const normalizedQuery = normalizeForCoverage(query)
  const normalizedText = normalizeForCoverage(text)
  if (!normalizedQuery || !normalizedText) return 0

  const pattern = new RegExp(
    `(?:^|\\s)${normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`,
    'g',
  )
  return [...normalizedText.matchAll(pattern)].length
}

export function measureCoverage(query: string, text = ''): CoverageField {
  const terms = queryTerms(query)
  const normalizedText = normalizeForCoverage(text)
  const matchedTerms = terms.filter((term) =>
    normalizedText
      .split(' ')
      .some((token) => token === term || token.startsWith(term)),
  )
  const missingTerms = terms.filter((term) => !matchedTerms.includes(term))

  return {
    phraseCount: countPhrase(query, text),
    matchedTerms,
    missingTerms,
    termCoverage: terms.length ? matchedTerms.length / terms.length : 0,
  }
}

function gapScore(input: {
  title: CoverageField
  metaDescription: CoverageField
  mainContent: CoverageField
}): number {
  let score = 0
  if (input.title.phraseCount === 0) score += 3
  if (input.metaDescription.phraseCount === 0) score += 1
  if (input.mainContent.phraseCount === 0) score += 2
  if (input.mainContent.termCoverage < 0.8) score += 3
  if (input.title.termCoverage < 0.8) score += 1
  return score
}

function coverageSummary(coverage: QueryContentCoverage): string {
  if (coverage.status === 'failed') {
    return 'Content verification failed.'
  }
  const title = coverage.fields.title.phraseCount > 0
  const body = coverage.fields.mainContent.phraseCount > 0
  const bodyTerms = Math.round(coverage.fields.mainContent.termCoverage * 100)
  if (title && body) return 'Exact query appears in title and main content.'
  if (bodyTerms >= 100) {
    return 'Exact query is missing, but all meaningful terms appear in main content.'
  }
  return `Main content covers ${bodyTerms}% of meaningful query terms.`
}

export async function verifyQueryContent(input: {
  query: string
  url: string
  js?: boolean | 'auto'
  refresh?: boolean
}): Promise<QueryContentCoverage> {
  try {
    const fetched = await fetchPage(input.url, {
      js: input.js ?? 'auto',
      refresh: input.refresh,
    })
    const page = await extractPage(fetched, 'defuddle')
    const fields = {
      title: measureCoverage(input.query, page.title),
      metaDescription: measureCoverage(input.query, page.metaDescription),
      mainContent: measureCoverage(input.query, page.contentText),
    }
    const coverage: QueryContentCoverage = {
      verifiedAt: new Date().toISOString(),
      url: input.url,
      finalUrl: page.finalUrl,
      status: 'verified',
      wordCount: page.wordCount,
      contentGapScore: gapScore(fields),
      queryTerms: queryTerms(input.query),
      fields,
      summary: '',
    }
    return { ...coverage, summary: coverageSummary(coverage) }
  } catch (error) {
    return {
      verifiedAt: new Date().toISOString(),
      url: input.url,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      wordCount: undefined,
      contentGapScore: 0,
      queryTerms: queryTerms(input.query),
      fields: {
        title: measureCoverage(input.query),
        metaDescription: measureCoverage(input.query),
        mainContent: measureCoverage(input.query),
      },
      summary: 'Content verification failed.',
    }
  }
}
