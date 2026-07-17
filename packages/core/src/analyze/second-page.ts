import { SeoError } from '../errors.js'
import { extractPage } from '../extract/page-extractor.js'
import { type FetchRateControls, fetchPage } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { finalGscDateRange } from '../gsc/dates.js'
import { countLabel, plural } from '../phrasing.js'
import { SessionLedger } from '../storage/ledger.js'
import type { QueryContentCoverage } from '../types/pages.js'
import {
  contentCoverageRecommendation,
  verifyQueryContent,
} from './content-coverage.js'
import {
  analyzeSecondPageRows,
  type SecondPageItem,
  type SecondPageRecommendation,
} from './second-page-analysis.js'
import type { SecondPageReport } from './second-page-analysis-types.js'

export * from './second-page-analysis.js'

const MAX_SOURCE_ROWS = 100_000

type SearchAnalytics = typeof querySearchAnalytics
type FetchPage = typeof fetchPage
type ExtractPage = typeof extractPage

export type SecondPageInput = {
  site: string
  range?: number
  minImpressions?: number
  limit?: number
  js?: boolean | 'auto'
  refresh?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  rate?: FetchRateControls
  brandTerms?: string[]
  includeBrand?: boolean
}

export type SecondPageDependencies = {
  searchAnalytics: SearchAnalytics
  fetch: FetchPage
  extract: ExtractPage
  now: () => Date
}

const defaultDependencies: SecondPageDependencies = {
  searchAnalytics: querySearchAnalytics,
  fetch: fetchPage,
  extract: extractPage,
  now: () => new Date(),
}

function integerOption(input: {
  value: number | undefined
  fallback: number
  minimum: number
  maximum: number
  label: string
}): number {
  if (input.value === undefined) return input.fallback
  if (
    !Number.isInteger(input.value) ||
    input.value < input.minimum ||
    input.value > input.maximum
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} must be a whole number between ${input.minimum} and ${input.maximum}.`,
    )
  }
  return input.value
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function uniqueWarnings(
  warnings: SecondPageReport['warnings'],
): SecondPageReport['warnings'] {
  return [
    ...new Map(
      warnings.map((warning) => [
        `${warning.stage}\u0000${warning.url}\u0000${warning.code}\u0000${warning.message}`,
        warning,
      ]),
    ).values(),
  ]
}

function reportDateRange(
  days: number,
  now: Date,
): {
  startDate: string
  endDate: string
} {
  return finalGscDateRange(days, now)
}

function findingFor(coverage: QueryContentCoverage): SecondPageRecommendation {
  const evidence = coverage.error ?? coverage.summary
  if (coverage.status === 'failed') {
    return {
      type: 'inspect-fetch',
      confidence: 'medium',
      evidence,
      action: contentCoverageRecommendation(coverage),
    }
  }
  if (coverage.classification === 'technical-check') {
    return {
      type: 'fix-technical',
      confidence: 'medium',
      evidence,
      action: contentCoverageRecommendation(coverage),
    }
  }
  if (coverage.classification === 'content-gap') {
    return {
      type: 'fix-content-gap',
      confidence: 'medium',
      evidence,
      action: contentCoverageRecommendation(coverage),
    }
  }
  if (coverage.classification === 'serp-framing') {
    return {
      type: 'improve-serp-framing',
      confidence: 'medium',
      evidence,
      action: contentCoverageRecommendation(coverage),
    }
  }
  return {
    type: 'investigate-ranking',
    confidence: 'low',
    evidence,
    action: `The page covers "${coverage.query}". Inspect internal links, competing URLs, intent alignment, and the search results before changing copy.`,
  }
}

function applyVerification(
  item: SecondPageItem,
  coverage: QueryContentCoverage,
): void {
  const recommendation = findingFor(coverage)
  item.contentVerification = coverage
  item.fetchDiagnostics = coverage.fetchDiagnostics
  item.finding = recommendation.type
  item.recommendation = recommendation
}

function verdict(report: {
  dataStatus: SecondPageReport['dataStatus']
  eligible: number
  returned: number
  technical: number
  failed: number
  content: number
}): string {
  if (report.dataStatus === 'empty') {
    return 'Google Search Console returned no retained query/page rows for this window.'
  }
  if (report.dataStatus === 'filtered') {
    return 'No pages met the position, brand, and minimum-impression criteria.'
  }
  if (report.technical > 0) {
    return `${countLabel(report.eligible, 'eligible average-position page')} found; ${countLabel(report.technical, 'returned page')} ${plural(report.technical, 'has', 'have')} verified technical issues to fix before content changes.`
  }
  if (report.failed > 0) {
    return `${countLabel(report.eligible, 'eligible average-position page')} found; ${countLabel(report.failed, 'returned page')} could not be verified and ${plural(report.failed, 'needs', 'need')} a fetch check before content changes.`
  }
  if (report.content > 0) {
    return `${countLabel(report.eligible, 'eligible average-position page')} found; ${countLabel(report.content, 'returned page')} ${plural(report.content, 'has', 'have')} verified content or search-framing gaps.`
  }
  return `${countLabel(report.eligible, 'eligible average-position page')} found; ${countLabel(report.returned, 'page')} ${plural(report.returned, 'is', 'are')} returned in priority order for investigation.`
}

function reportRecommendations(items: SecondPageItem[]): string[] {
  const first = items[0]
  if (!first) {
    return [
      'Widen the date window or lower the minimum page impressions only if you need to inspect smaller opportunities.',
    ]
  }
  return unique([
    first.recommendation.action,
    'Review page-level query groups before creating another URL; several queries may already map to the same ranking page.',
    'Treat the priority score as a triage heuristic, not an estimated traffic lift.',
  ])
}

export async function secondPage(
  input: SecondPageInput,
  dependencies: SecondPageDependencies = defaultDependencies,
): Promise<SecondPageReport> {
  const days = integerOption({
    value: input.range,
    fallback: 28,
    minimum: 1,
    maximum: 548,
    label: 'Days',
  })
  const verifyLimit = integerOption({
    value: input.verifyLimit,
    fallback: 5,
    minimum: 0,
    maximum: 100,
    label: 'Verification limit',
  })
  const now = dependencies.now()
  const range = reportDateRange(days, now)
  const result = await dependencies.searchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
      maxRows: MAX_SOURCE_ROWS,
    },
    { refresh: input.refresh },
  )
  const ledger = new SessionLedger()
  ledger.addGsc(result.calls, result.rowsFetched)
  const analysis = analyzeSecondPageRows({
    rows: result.rows,
    site: input.site,
    minImpressions: input.minImpressions,
    limit: input.limit,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const generatedAt = now.toISOString()
  const warnings: SecondPageReport['warnings'] = []
  const verificationRequested =
    input.verifyContent === true || input.verifyLimit !== undefined
  const verificationItems = verificationRequested
    ? analysis.items.slice(0, verifyLimit)
    : []

  for (const item of verificationItems) {
    const coverage = await verifyQueryContent({
      query: item.primaryQuery,
      url: item.url,
      js: input.js,
      refresh: input.refresh,
      rate: input.rate,
      verifiedAt: generatedAt,
      fetch: dependencies.fetch,
      extract: dependencies.extract,
    })
    applyVerification(item, coverage)
    warnings.push(
      ...(coverage.warnings ?? []).map((message) => ({
        stage: 'verification' as const,
        url: item.url,
        code: 'page-warning' as const,
        message,
      })),
    )
    if (coverage.error) {
      warnings.push({
        stage: 'verification',
        url: item.url,
        code: 'verification-failed',
        message: coverage.error,
      })
    }
  }

  const verified = verificationItems.filter(
    (item) => item.contentVerification?.status === 'verified',
  ).length
  const failed = verificationItems.filter(
    (item) => item.contentVerification?.status === 'failed',
  ).length
  const technicalIssues = verificationItems.filter(
    (item) => item.finding === 'fix-technical',
  ).length
  const contentIssues = verificationItems.filter((item) =>
    ['fix-content-gap', 'improve-serp-framing'].includes(item.finding),
  ).length

  return {
    site: input.site,
    range: days,
    dateRange: range,
    generatedAt,
    source: {
      provider: 'google-search-console',
      dimensions: ['query', 'page'],
      searchType: 'web',
      dataState: 'final',
      rowsFetched: result.rowsFetched,
      calls: result.calls,
      maxRows: MAX_SOURCE_ROWS,
      possiblyTruncated: result.rowsFetched >= MAX_SOURCE_ROWS,
      completeness: 'retained-query-rows-only',
    },
    dataStatus: analysis.dataStatus,
    selection: analysis.selection,
    methodology: analysis.methodology,
    provenance: {
      ...analysis.provenance,
      verification: {
        optional: true,
        population: 'returned_pages_in_priority_order',
      },
    },
    summary: {
      ...analysis.summary,
      contentIssues,
      technicalIssues,
      fetchFailures: failed,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: verdict({
        dataStatus: analysis.dataStatus,
        eligible: analysis.summary.eligiblePages,
        returned: analysis.summary.returnedPages,
        technical: technicalIssues,
        failed,
        content: contentIssues,
      }),
    },
    verification: verificationRequested
      ? {
          requested: true,
          limit: verifyLimit,
          attempted: verificationItems.length,
          verified,
          failed,
          technicalChecks: technicalIssues,
        }
      : { requested: false, attempted: 0, verified: 0, failed: 0 },
    items: analysis.items,
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate}, using final GSC data where available.`,
      `Selection: ${analysis.selection.sourceRows} source rows, ${analysis.selection.eligibleRows} eligible query/page rows, ${analysis.selection.eligiblePages} eligible page groups, ${analysis.selection.returnedPages} returned.`,
      `Positions use GSC average position per query/page row and must be greater than 10 and at most 20. Page position is impression-weighted across retained queries.`,
      `Minimum impressions (${analysis.minImpressions}) are applied after eligible rows are aggregated by page.`,
      verificationRequested
        ? `Content verification was attempted for the first ${verificationItems.length} returned pages in priority order.`
        : 'Content verification was not requested; unverified items are investigation prompts, not content findings.',
      'Priority is a deterministic demand-and-position heuristic. It is not an estimated click or ranking lift.',
      'Search Analytics exposes retained query rows only. Anonymized and lower-value queries can be absent even when pagination is exhausted.',
      result.rowsFetched >= MAX_SOURCE_ROWS
        ? `The report reached its ${MAX_SOURCE_ROWS.toLocaleString('en-US')}-row safety cap.`
        : '',
    ].filter(Boolean),
    recommendations: reportRecommendations(analysis.items),
    ledgerSummary: ledger.summary(),
    warnings: uniqueWarnings(warnings),
  }
}
