import { extractPage } from '../extract/page-extractor.js'
import { type FetchRateControls, fetchPage } from '../fetch/page-fetcher.js'
import type {
  CoverageField,
  ExtractedPage,
  PageFetchDiagnostics,
  PageFetchResult,
  QueryContentClassification,
  QueryContentCoverage,
  QueryContentSignal,
} from '../types.js'
import {
  type PageTechnicalSignal,
  pageTechnicalSignals,
} from './page-technical-signals.js'

export type { CoverageField, QueryContentCoverage } from '../types.js'

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

export function normalizeForCoverage(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/([\p{L}\p{N}])[’']([\p{L}\p{N}])/gu, '$1$2')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasNonAscii(value: string): boolean {
  return [...value].some((character) => (character.codePointAt(0) ?? 0) > 127)
}

function queryTerms(query: string): string[] {
  const tokens = normalizeForCoverage(query)
    .split(' ')
    .filter((token) => token.length > 1 || hasNonAscii(token))
  const meaningful = tokens.filter(
    (token) =>
      (token.length > 2 || hasNonAscii(token)) && !STOPWORDS.has(token),
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

function displayQuery(coverage: QueryContentCoverage): string {
  const query = coverage.query.trim()
  if (query.length <= 80) return query
  const focus = coverage.queryTerms.slice(0, 7).join(' ')
  return focus || `${query.slice(0, 77)}...`
}

function missingFieldNames(coverage: QueryContentCoverage): string[] {
  const fields: string[] = []
  if (coverage.fields.title.termCoverage < 0.8) fields.push('title')
  if (coverage.fields.h1.termCoverage < 0.8) fields.push('H1')
  if (coverage.fields.metaDescription.termCoverage < 0.8) {
    fields.push('meta description')
  }
  return fields
}

function subjectVerb(count: number): string {
  return count === 1 ? 'does' : 'do'
}

function gapScore(input: {
  title: CoverageField
  h1: CoverageField
  metaDescription: CoverageField
  mainContent: CoverageField
}): number {
  let score = 0
  if (input.title.termCoverage < 0.8) score += 3
  if (input.h1.termCoverage < 0.8) score += 1
  if (input.metaDescription.termCoverage < 0.8) score += 1
  if (input.mainContent.termCoverage < 0.8) score += 5
  return score
}

export function contentCoverageType(
  fields: QueryContentCoverage['fields'],
): 'content-gap' | 'serp-framing' | 'covered' {
  if (fields.mainContent.termCoverage < 0.8) return 'content-gap'
  if (
    fields.title.termCoverage < 0.8 ||
    fields.metaDescription.termCoverage < 0.8 ||
    fields.h1.termCoverage < 0.8
  ) {
    return 'serp-framing'
  }
  return 'covered'
}

function classification(input: {
  technicalSignals: PageTechnicalSignal[]
  fields: QueryContentCoverage['fields']
}): {
  classification: QueryContentClassification
  signals: QueryContentSignal[]
} {
  const signals: QueryContentSignal[] = [...input.technicalSignals]
  if (input.fields.title.phraseCount === 0) {
    signals.push('exact-phrase-missing')
  }
  if (input.fields.title.termCoverage < 0.8) signals.push('title-gap')
  if (input.fields.metaDescription.termCoverage < 0.8) {
    signals.push('meta-description-gap')
  }
  if (input.fields.h1.termCoverage < 0.8) signals.push('h1-gap')
  if (input.fields.mainContent.termCoverage < 0.8) signals.push('body-gap')

  if (input.technicalSignals.length > 0) {
    return { classification: 'technical-check', signals }
  }
  return { classification: contentCoverageType(input.fields), signals }
}

export function contentCoverageRecommendation(
  coverage: QueryContentCoverage,
): string {
  const focus = displayQuery(coverage)
  if (coverage.status === 'failed') {
    return 'I could not fetch or read the page, so do not change the content yet. Check the fetch error, blocking, or rendering issue first, then rerun this report.'
  }
  if (coverage.classification === 'technical-check') {
    return coverage.signals.includes('redirected') && coverage.finalUrl
      ? `This GSC URL resolves to ${coverage.finalUrl}. Confirm that this is the page Google should rank for "${focus}" before editing titles or copy.`
      : `Check whether this URL is indexable, canonical, and fetchable before editing copy for "${focus}". If the page has a technical issue, fix that first.`
  }
  if (coverage.classification === 'content-gap') {
    const missing = coverage.fields.mainContent.missingTerms.slice(0, 4)
    return missing.length
      ? `The page ranks for "${focus}" but the main content does not clearly cover: ${missing.join(', ')}. Add a short, useful section or intro sentence that answers that angle directly.`
      : `The page ranks for "${focus}" but the main content does not clearly answer that angle. Add a short section that covers it directly.`
  }
  if (coverage.classification === 'serp-framing') {
    const fields = missingFieldNames(coverage)
    const targetFields = fields.length ? fields.join(', ') : 'title and meta'
    return `The main content covers the important terms for "${focus}", but the ${targetFields} ${subjectVerb(fields.length)} not make that exact search angle clear enough. Test clearer wording there before rewriting the body.`
  }
  return `The page already covers "${focus}". Do not add more copy for this query; test the title/meta, improve internal links, or check whether the SERP format is limiting clicks.`
}

function coverageSummary(coverage: QueryContentCoverage): string {
  if (coverage.status === 'failed') {
    return 'Content verification failed.'
  }
  if (coverage.classification === 'technical-check') {
    return coverage.signals.includes('redirected') && coverage.finalUrl
      ? `GSC URL resolves to ${coverage.finalUrl}; verify the canonical target first.`
      : 'Fetch diagnostics show a technical check is needed before judging content.'
  }
  if (coverage.classification === 'covered') {
    return 'The page covers the query across the main on-page signals.'
  }
  const title = coverage.fields.title.phraseCount > 0
  const h1 = coverage.fields.h1.phraseCount > 0
  const body = coverage.fields.mainContent.phraseCount > 0
  const bodyTerms = Math.round(coverage.fields.mainContent.termCoverage * 100)
  if (title && h1 && body) {
    return 'Exact query appears in title, H1, and main content.'
  }
  if (bodyTerms >= 100) {
    return 'Main content covers every meaningful query term, but exact SERP wording may be weak.'
  }
  return `Main content covers ${bodyTerms}% of meaningful query terms.`
}

export function queryContentCoverageFromPage(input: {
  query: string
  url: string
  page: ExtractedPage
  fetchDiagnostics?: PageFetchDiagnostics
  httpStatus?: number
  warnings?: string[]
  verifiedAt?: string
}): QueryContentCoverage {
  const fields = queryContentFieldsFromPage(input.query, input.page)
  const technicalSignals = pageTechnicalSignals({
    url: input.url,
    page: input.page,
    fetchDiagnostics: input.fetchDiagnostics,
    httpStatus: input.httpStatus,
  })
  const classified = classification({
    technicalSignals,
    fields,
  })
  const coverage: QueryContentCoverage = {
    verifiedAt: input.verifiedAt ?? new Date().toISOString(),
    query: input.query,
    url: input.url,
    finalUrl: input.page.finalUrl,
    status: 'verified',
    httpStatus: input.httpStatus,
    warnings: [...new Set([...(input.warnings ?? []), ...input.page.warnings])],
    wordCount: input.page.wordCount,
    fetchDiagnostics: input.fetchDiagnostics,
    contentGapScore: gapScore(fields),
    queryTerms: queryTerms(input.query),
    fields,
    classification: classified.classification,
    signals: classified.signals,
    recommendation: '',
    summary: '',
  }
  return {
    ...coverage,
    recommendation: contentCoverageRecommendation(coverage),
    summary: coverageSummary(coverage),
  }
}

export function queryContentFieldsFromPage(
  query: string,
  page: ExtractedPage,
): QueryContentCoverage['fields'] {
  return {
    title: measureCoverage(query, page.title),
    h1: measureCoverage(
      query,
      page.headings
        .filter((heading) => heading.level === 1)
        .map((heading) => heading.text)
        .join(' '),
    ),
    metaDescription: measureCoverage(query, page.metaDescription),
    mainContent: measureCoverage(query, page.contentText),
  }
}

export async function verifyQueryContent(input: {
  query: string
  url: string
  js?: boolean | 'auto'
  refresh?: boolean
  rate?: FetchRateControls
  verifiedAt?: string
  fetch?: typeof fetchPage
  extract?: typeof extractPage
}): Promise<QueryContentCoverage> {
  let fetched: PageFetchResult | undefined
  try {
    fetched = await (input.fetch ?? fetchPage)(input.url, {
      js: input.js ?? 'auto',
      refresh: input.refresh,
      rate: input.rate,
    })
    const page = await (input.extract ?? extractPage)(fetched, 'defuddle')
    return queryContentCoverageFromPage({
      query: input.query,
      url: input.url,
      page,
      fetchDiagnostics: fetched.diagnostics,
      httpStatus: fetched.status,
      warnings: fetched.warnings,
      verifiedAt: input.verifiedAt,
    })
  } catch (error) {
    const technicalSignals = pageTechnicalSignals({
      url: input.url,
      fetchDiagnostics: fetched?.diagnostics,
      httpStatus: fetched?.status,
    })
    return {
      verifiedAt: input.verifiedAt ?? new Date().toISOString(),
      query: input.query,
      url: input.url,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      httpStatus: fetched?.status,
      warnings: fetched?.warnings ?? [],
      wordCount: undefined,
      fetchDiagnostics: fetched?.diagnostics,
      contentGapScore: 0,
      queryTerms: queryTerms(input.query),
      fields: {
        title: measureCoverage(input.query),
        h1: measureCoverage(input.query),
        metaDescription: measureCoverage(input.query),
        mainContent: measureCoverage(input.query),
      },
      classification: 'fetch-failed',
      signals: technicalSignals,
      recommendation:
        'Verification failed; inspect fetch diagnostics before making content calls.',
      summary: 'Content verification failed.',
    }
  }
}
