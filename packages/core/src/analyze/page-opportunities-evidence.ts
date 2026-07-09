import type { ExtractedPage, PageFetchDiagnostics } from '../types.js'
import { measureCoverage } from './content-coverage.js'
import type { PositionBenchmark } from './opportunity-primitives.js'
import { samePage } from './page-opportunities-selection.js'
import type {
  PageOpportunityBenchmark,
  PageOpportunityType,
  PageOpportunityVerification,
} from './page-opportunities-types.js'

function absoluteUrl(value: string, base: string): string {
  try {
    return new URL(value, base).toString()
  } catch {
    return value
  }
}

export function technicalPageSignals(input: {
  url: string
  page?: ExtractedPage
  fetchDiagnostics?: PageFetchDiagnostics
  httpStatus?: number
}): string[] {
  const signals: string[] = []
  if (
    input.httpStatus !== undefined &&
    (input.httpStatus < 200 || input.httpStatus > 299)
  ) {
    signals.push('http-non-2xx')
  }
  if (input.httpStatus === 204 || input.httpStatus === 205) {
    signals.push('http-no-content')
  }
  if (input.fetchDiagnostics?.blocked) signals.push('fetch-blocked')
  if (
    input.fetchDiagnostics &&
    !input.fetchDiagnostics.fetched &&
    input.fetchDiagnostics.source !== 'cache'
  ) {
    signals.push('fetch-incomplete')
  }
  if (
    (input.fetchDiagnostics?.redirectChain?.length ?? 0) > 0 ||
    (input.page && !samePage(input.url, input.page.finalUrl))
  ) {
    signals.push('redirected')
  }
  if (/\b(?:noindex|none)\b/i.test(input.page?.metaRobots ?? '')) {
    signals.push('meta-noindex')
  }
  if (/\b(?:noindex|none)\b/i.test(input.page?.xRobotsTag ?? '')) {
    signals.push('x-robots-noindex')
  }
  if (
    input.page?.canonical &&
    !samePage(
      input.page.finalUrl,
      absoluteUrl(input.page.canonical, input.page.finalUrl),
    )
  ) {
    signals.push('canonical-mismatch')
  }
  return signals
}

export function verificationFor(input: {
  query: string
  url: string
  page?: ExtractedPage
  fetchDiagnostics?: PageFetchDiagnostics
  httpStatus?: number
}): PageOpportunityVerification {
  const signals = technicalPageSignals(input)
  if (signals.length > 0) {
    return {
      status: 'technical-check',
      reason:
        'Fetch or indexability evidence needs checking before making an on-page recommendation.',
      signals,
      httpStatus: input.httpStatus,
    }
  }
  if (!input.page) {
    return {
      status: 'unverified',
      reason: input.fetchDiagnostics?.fetched
        ? 'The page was fetched, but extracted content was not available for verification.'
        : 'On-page content was not verified for this analysis.',
      signals: [],
      httpStatus: input.httpStatus,
    }
  }

  const h1 = input.page.headings
    .filter((heading) => heading.level === 1)
    .map((heading) => heading.text)
    .join(' ')
  return {
    status: 'verified',
    reason: 'The recommendation uses extracted on-page evidence.',
    signals: [],
    httpStatus: input.httpStatus,
    fields: {
      title: measureCoverage(input.query, input.page.title),
      metaDescription: measureCoverage(input.query, input.page.metaDescription),
      h1: measureCoverage(input.query, h1),
      mainContent: measureCoverage(input.query, input.page.contentText),
    },
  }
}

function verifiedCoverageType(
  verification: PageOpportunityVerification,
): 'content-gap' | 'serp-framing' | 'covered' {
  const fields = verification.fields
  if (!fields) return 'covered'
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

export function opportunityType(input: {
  position: number
  ctr: number
  expectedCtr?: number
  verification: PageOpportunityVerification
}): PageOpportunityType {
  if (input.verification.status === 'technical-check') return 'technical-check'
  if (input.verification.status === 'verified') {
    const coverageType = verifiedCoverageType(input.verification)
    if (coverageType !== 'covered') return coverageType
  }
  if (input.position > 10) return 'ranking'
  if (input.expectedCtr !== undefined && input.ctr < input.expectedCtr * 0.65) {
    return 'ctr'
  }
  return input.verification.status === 'verified' ? 'covered' : 'unverified'
}

export function recommendationFor(input: {
  query: string
  position: number
  type: PageOpportunityType
}): string {
  if (input.type === 'technical-check') {
    return `Check fetchability, indexability, redirects, and canonical signals for this URL before changing content for "${input.query}".`
  }
  if (input.type === 'unverified') {
    const signal =
      input.position > 10
        ? 'GSC shows the query outside page one.'
        : 'GSC shows page-one visibility.'
    return `${signal} Verify the live page and current SERP intent before deciding whether content, internal links, or snippet wording needs work.`
  }
  if (input.type === 'content-gap') {
    return `The extracted copy does not clearly cover the main terms in "${input.query}". Confirm the search intent, then improve the existing answer if the query belongs on this page.`
  }
  if (input.type === 'serp-framing') {
    return `The extracted body covers "${input.query}", but the title, meta description, or H1 does not reflect it clearly. Check the live SERP before testing more precise framing.`
  }
  if (input.type === 'ranking') {
    return 'This query ranks outside page one, so no CTR lift is claimed. Check intent fit, content quality, internal links, and competing pages before choosing an edit.'
  }
  if (input.type === 'ctr') {
    return 'This page-one query is below its directional CTR benchmark. Review the live SERP, then test title and meta-description framing without assuming the body needs rewriting.'
  }
  return `The extracted page covers "${input.query}" and its CTR is not materially below the benchmark. Avoid a blind rewrite; monitor the query and inspect the SERP for format changes.`
}

export function benchmarkDetails(
  benchmark: PositionBenchmark | undefined,
  excludedTargetRows: number,
): PageOpportunityBenchmark {
  if (!benchmark) {
    return {
      applicable: false,
      source: 'not_applicable_outside_page_one',
      peerRows: 0,
      peerImpressions: 0,
      qualifiedPeerImpressions: 0,
      urlSamples: 0,
      positiveUrlSamples: 0,
      excludedTargetRows,
    }
  }
  return {
    applicable: true,
    expectedCtr: benchmark.ctr,
    source: benchmark.source,
    peerRows: benchmark.rows,
    peerImpressions: benchmark.impressions,
    qualifiedPeerImpressions: benchmark.qualifiedImpressions,
    urlSamples: benchmark.urlSamples,
    positiveUrlSamples: benchmark.positiveUrlSamples,
    excludedTargetRows,
  }
}
