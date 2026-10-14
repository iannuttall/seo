import type { FetchRateControls } from '../../fetch/page-fetcher/types.js'
import type { SearchAnalyticsQuery } from '../../gsc/client/types.js'
import { countLabel } from '../../phrasing.js'
import { SessionLedger } from '../../storage/ledger.js'
import type { PageFetchResult } from '../../types.js'
import {
  contentCoverageRecommendation,
  type PageExtractor,
  type PageFetcher,
  type QueryContentCoverage,
  requirePageVerification,
  verifyQueryContentWith,
} from '../content-coverage-analysis.js'
import { groupQuickWins } from './quick-win-groups.js'
import { analyzeQuickWinsFromRows } from './quick-wins-analysis.js'
import {
  defaultDateRange,
  explicitDateRange,
  integerOption,
} from './quick-wins-report-input.js'
import {
  quickWinTemplateRecommendations,
  quickWinTemplateSummaries,
} from './quick-wins-templates.js'
import type { QuickWinItem } from './quick-wins-types.js'

const DEFAULT_DAYS = 28
const MAX_DAYS = 548
const DEFAULT_VERIFY_LIMIT = 5
const MAX_VERIFY_LIMIT = 100
const MAX_SOURCE_ROWS = 100_000

export type QuickWinsInput = {
  site: string
  days?: number
  startDate?: string
  endDate?: string
  minImpressions?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean | 'auto'
  rate?: FetchRateControls
  refresh?: boolean
}

export type QuickWinsDependencies = {
  searchAnalytics: SearchAnalyticsQuery
  /** Required only when page verification is requested. */
  fetch?: PageFetcher
  /** Required only when page verification is requested. */
  extract?: PageExtractor
  now: () => Date
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function applyVerification(
  item: QuickWinItem,
  coverage: QueryContentCoverage,
): void {
  item.contentVerification = coverage
  item.finding = coverage.classification
  item.recommendation = {
    ...item.recommendation,
    action: contentCoverageRecommendation(coverage),
    confidence:
      coverage.status === 'verified' && coverage.classification !== 'covered'
        ? 'medium'
        : 'low',
    evidenceRef: `${item.recommendation.evidenceRef} ${coverage.summary}`,
  }
}

export type QuickWinsReport = Awaited<ReturnType<typeof quickWinsReportWith>>

export async function quickWinsReportWith(
  input: QuickWinsInput,
  dependencies: QuickWinsDependencies,
) {
  const explicitRange = explicitDateRange(input, MAX_DAYS)
  const days =
    explicitRange?.days ??
    integerOption({
      value: input.days,
      fallback: DEFAULT_DAYS,
      minimum: 1,
      maximum: MAX_DAYS,
      label: 'Days',
    })
  const verifyLimit = integerOption({
    value: input.verifyLimit,
    fallback: DEFAULT_VERIFY_LIMIT,
    minimum: 0,
    maximum: MAX_VERIFY_LIMIT,
    label: 'Verification limit',
  })
  const generatedAt = dependencies.now().toISOString()
  const range =
    explicitRange?.range ?? defaultDateRange(days, new Date(generatedAt))
  const source = await dependencies.searchAnalytics(
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
  ledger.addGsc(source.calls, source.rowsFetched)
  const analysis = analyzeQuickWinsFromRows({
    rows: source.rows,
    site: input.site,
    minImpressions: input.minImpressions,
    limit: input.limit,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const verificationRequested =
    input.verifyContent === true ||
    (input.verifyContent !== false && input.verifyLimit !== undefined)
  const verificationItems = verificationRequested
    ? analysis.items.slice(0, verifyLimit)
    : []
  const fetches = new Map<string, Promise<PageFetchResult>>()
  if (verificationItems.length) {
    const { fetch, extract } = requirePageVerification(dependencies)
    const cachedFetch: PageFetcher = (url, options) => {
      const existing = fetches.get(url)
      if (existing) return existing
      const request = fetch(url, options)
      fetches.set(url, request)
      return request
    }

    for (const item of verificationItems) {
      const coverage = await verifyQueryContentWith({
        query: item.query,
        url: item.url,
        js: input.js,
        refresh: input.refresh,
        rate: input.rate,
        verifiedAt: generatedAt,
        fetch: cachedFetch,
        extract,
      })
      applyVerification(item, coverage)
    }
  }

  const groups = groupQuickWins(analysis.eligibleItems)
  const templates = quickWinTemplateSummaries(analysis.eligibleItems)
  const templateActions = quickWinTemplateRecommendations(
    analysis.eligibleItems,
  )
  const verified = verificationItems.filter(
    (item) => item.contentVerification?.status === 'verified',
  ).length
  const failed = verificationItems.filter(
    (item) => item.contentVerification?.status === 'failed',
  ).length
  const technical = verificationItems.filter(
    (item) => item.contentVerification?.classification === 'technical-check',
  ).length
  const recommendations = unique([
    ...templateActions.slice(0, 3).map((item) => item.action),
    ...groups.slice(0, 3).map((item) => item.recommendation),
    analysis.items[0]?.recommendation.action ?? '',
  ]).slice(0, 5)
  const warnings = verificationItems.flatMap((item) => {
    const coverage = item.contentVerification
    if (!coverage) return []
    return [
      ...(coverage.warnings ?? []).map((message) => ({
        stage: 'verification' as const,
        url: item.url,
        code: 'page-warning' as const,
        message,
      })),
      ...(coverage.error
        ? [
            {
              stage: 'verification' as const,
              url: item.url,
              code: 'verification-failed' as const,
              message: coverage.error,
            },
          ]
        : []),
    ]
  })

  return {
    site: input.site,
    generatedAt,
    range,
    rangeDays: days,
    source: {
      provider: 'google-search-console' as const,
      dimensions: ['query', 'page'] as const,
      searchType: 'web' as const,
      dataState: 'final' as const,
      rowsFetched: source.rowsFetched,
      calls: source.calls,
      maxRows: MAX_SOURCE_ROWS,
      possiblyTruncated: source.rowsFetched >= MAX_SOURCE_ROWS,
      completeness: 'retained-query-rows-only' as const,
    },
    dataStatus: analysis.dataStatus,
    selection: analysis.selection,
    methodology: analysis.methodology,
    provenance: {
      ...analysis.provenance,
      verification: {
        optional: true as const,
        population: 'returned_rows_in_priority_order' as const,
        fetchDeduplication: 'exact_url' as const,
      },
    },
    brand: analysis.brand,
    benchmark: {
      method: analysis.methodology.benchmark.method,
      peerRows: analysis.selection.benchmarkRows,
      byPosition: analysis.benchmarkByPosition,
    },
    verification: verificationRequested
      ? {
          requested: true as const,
          limit: verifyLimit,
          attemptedRows: verificationItems.length,
          attemptedUrls: fetches.size,
          verified,
          technical,
          failed,
        }
      : {
          requested: false as const,
          attemptedRows: 0 as const,
          attemptedUrls: 0 as const,
          verified: 0 as const,
          technical: 0 as const,
          failed: 0 as const,
        },
    summary: {
      ...analysis.summary,
      repeatedQueryGroups: groups.length,
      templatePatterns: templateActions.length,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict:
        analysis.dataStatus === 'empty'
          ? 'Search Console returned no retained query/page rows for this date window.'
          : analysis.dataStatus === 'filtered'
            ? 'No retained rows met the quick-win report criteria.'
            : `${countLabel(analysis.summary.eligibleRows, 'eligible CTR-target row')} found; ${countLabel(analysis.summary.returnedRows, 'row')} returned for review.`,
    },
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate}, using final GSC data where available.`,
      `Selection: ${analysis.selection.sourceRows} source rows, ${analysis.selection.benchmarkRows} benchmark rows, ${analysis.selection.eligibleRows} eligible rows, ${analysis.selection.returnedRows} returned.`,
      'Position is GSC average position across impressions; a value from 4 to 10 does not mean the URL ranked on page one for every impression.',
      'Target CTR comes from the site CTR curve that ctr-underperformers also uses, or a versioned built-in heuristic. The calculated CTR click shortfall is for prioritisation and is not a traffic forecast.',
      'Rows at average position below 4 belong to ctr-underperformers, so the two reports do not repeat rows.',
      `Brand queries: ${analysis.brand.filtering}. Brand terms used: ${analysis.brand.terms.join(', ') || 'none'} (${analysis.brand.source === 'provided' ? 'provided' : 'host forms, plus the bare domain stem only when Search Console shows the site is its navigational answer'}).`,
      analysis.selection.fragmentRows
        ? `${countLabel(analysis.selection.fragmentRows, 'source row')} with a #fragment URL merged into the base URL.`
        : '',
      analysis.selection.flaggedRows
        ? `${countLabel(analysis.selection.flaggedRows, 'eligible row')} carry heuristic query flags (likely-automated or navigational-other) and rank after unflagged rows.`
        : '',
      'Search Analytics exposes top retained query rows only. Anonymized and lower-value queries can be absent even after pagination is exhausted.',
      source.rowsFetched >= MAX_SOURCE_ROWS
        ? `The report reached its ${MAX_SOURCE_ROWS.toLocaleString('en-US')}-row safety cap.`
        : '',
      verificationRequested
        ? `Page evidence was checked for ${verificationItems.length} returned rows across ${fetches.size} distinct URLs.`
        : 'Page evidence was not requested; CTR shortfalls do not establish why CTR differs.',
    ].filter(Boolean),
    recommendations: recommendations.length
      ? recommendations
      : [
          analysis.dataStatus === 'empty'
            ? 'Choose a longer window only if this property should have Search Console data.'
            : 'Adjust the minimum impressions only if you intentionally want a broader, lower-confidence review.',
        ],
    templates,
    templateRecommendations: templateActions,
    groups,
    items: analysis.items,
    ledgerSummary: ledger.summary(),
    warnings,
  }
}
