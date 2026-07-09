import { querySearchAnalytics } from '../../gsc/client.js'
import { SessionLedger } from '../../storage/ledger.js'
import { analyzeCannibalRows } from './cannibal-analysis.js'
import type { CannibalReport } from './cannibal-types.js'
import {
  defaultDateRange,
  explicitDateRange,
  integerOption,
} from './quick-wins-report-input.js'

export * from './cannibal-analysis.js'
export type * from './cannibal-types.js'

const MAX_GSC_ROWS = 100_000
type SearchAnalytics = typeof querySearchAnalytics

export interface CannibalReportInput {
  site: string
  days?: number
  startDate?: string
  endDate?: string
  limit?: number
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}

export interface CannibalDependencies {
  searchAnalytics: SearchAnalytics
  now: () => Date
}

const defaultDependencies: CannibalDependencies = {
  searchAnalytics: querySearchAnalytics,
  now: () => new Date(),
}

function verdict(input: {
  status: CannibalReport['dataStatus']
  eligible: number
  returned: number
}): string {
  if (input.status === 'empty') {
    return 'Search Console returned no retained query/page rows for this window.'
  }
  if (!input.eligible) {
    return 'No material multi-URL query candidates remained after validation and filtering.'
  }
  return `${input.returned} of ${input.eligible} multi-URL query candidate${input.eligible === 1 ? '' : 's'} returned for intent and technical review.`
}

export async function cannibalReport(
  input: CannibalReportInput,
  dependencies: CannibalDependencies = defaultDependencies,
): Promise<CannibalReport> {
  const days = integerOption({
    value: input.days,
    fallback: 28,
    minimum: 1,
    maximum: 548,
    label: 'days',
  })
  const limit = integerOption({
    value: input.limit,
    fallback: 25,
    minimum: 1,
    maximum: 100,
    label: 'limit',
  })
  const minImpressions = integerOption({
    value: input.minImpressions,
    fallback: 50,
    minimum: 0,
    maximum: 1_000_000_000,
    label: 'minImpressions',
  })
  const now = dependencies.now()
  const explicit = explicitDateRange(input, 548)
  const range = explicit?.range ?? defaultDateRange(days, now)
  const rangeDays = explicit?.days ?? days
  const requestBase = {
    ...range,
    type: 'web' as const,
    dataState: 'final' as const,
    maxRows: MAX_GSC_ROWS,
  }
  const [pageExposure, propertyDemand] = await Promise.all([
    dependencies.searchAnalytics(
      input.site,
      {
        ...requestBase,
        dimensions: ['query', 'page'],
        aggregationType: 'auto',
      },
      { refresh: input.refresh },
    ),
    dependencies.searchAnalytics(
      input.site,
      {
        ...requestBase,
        dimensions: ['query'],
        aggregationType: 'byProperty',
      },
      { refresh: input.refresh },
    ),
  ])
  const ledger = new SessionLedger()
  ledger.addGsc(pageExposure.calls, pageExposure.rowsFetched)
  ledger.addGsc(propertyDemand.calls, propertyDemand.rowsFetched)
  const analysis = analyzeCannibalRows({
    site: input.site,
    rows: pageExposure.rows,
    propertyRows: propertyDemand.rows,
    minImpressions,
    limit,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const pageTruncated = pageExposure.rowsFetched >= MAX_GSC_ROWS
  const propertyTruncated = propertyDemand.rowsFetched >= MAX_GSC_ROWS
  const possiblyTruncated = pageTruncated || propertyTruncated
  const dataStatus: CannibalReport['dataStatus'] =
    pageExposure.rowsFetched === 0
      ? 'empty'
      : possiblyTruncated || analysis.selection.missingPropertyQueries > 0
        ? 'partial'
        : analysis.selection.eligibleClusters === 0
          ? 'filtered'
          : 'complete'

  return {
    schemaVersion: 1,
    site: input.site,
    generatedAt: now.toISOString(),
    range,
    rangeDays,
    dataStatus,
    source: {
      provider: 'google-search-console',
      searchType: 'web',
      dataState: 'final',
      pageExposure: {
        dimensions: ['query', 'page'],
        aggregationType: 'auto',
        rowsFetched: pageExposure.rowsFetched,
        calls: pageExposure.calls,
        maxRows: MAX_GSC_ROWS,
        possiblyTruncated: pageTruncated,
      },
      propertyDemand: {
        dimensions: ['query'],
        aggregationType: 'byProperty',
        rowsFetched: propertyDemand.rowsFetched,
        calls: propertyDemand.calls,
        maxRows: MAX_GSC_ROWS,
        possiblyTruncated: propertyTruncated,
      },
      completeness: possiblyTruncated ? 'possibly-truncated' : 'complete',
    },
    methodology: {
      id: 'gsc_url_overlap_v2',
      version: 2,
      minimumPageImpressions: 10,
      minimumPageImpressionShare: 0.1,
      maximumDominantPageShare: 0.8,
      matching: 'normalized_exact_query',
      finding: 'url-overlap-candidate',
      requiresIntentReview: true,
    },
    verification: {
      status: 'not-requested',
      technicalStateChecked: false,
      searchIntentChecked: false,
    },
    filters: analysis.filters,
    selection: analysis.selection,
    summary: {
      eligibleClusters: analysis.selection.eligibleClusters,
      returnedClusters: analysis.selection.returnedClusters,
      suppressedQueries: analysis.selection.suppressedQueries,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: verdict({
        status: dataStatus,
        eligible: analysis.selection.eligibleClusters,
        returned: analysis.selection.returnedClusters,
      }),
    },
    templates: analysis.templates,
    suppressed: analysis.suppressed,
    suppressionSummary: analysis.suppressionSummary,
    items: analysis.items,
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate} (${rangeDays} days), using final GSC data where available.`,
      'This report finds queries with material exposure across multiple URLs. It does not prove that the URLs satisfy the same intent or that consolidation is correct.',
      'Page exposure impressions can count more than one URL for a property impression. Property-level query impressions are reported separately instead of calling page exposure split demand.',
      'Search Console retains top rows and omits anonymized queries, so absent rows are not proof of absent traffic.',
      'The suggested owner is only a deterministic review starting point based on clicks, impressions, and position. Verify intent, indexability, redirects, and canonicals before changing URLs.',
    ],
    recommendations: analysis.items.length
      ? [
          'Review the highest-exposure candidates first. Confirm whether URLs serve the same intent and inspect technical state before changing canonicals, redirects, or content.',
        ]
      : [
          'No URL-overlap action is recommended from the retained rows and current filters.',
        ],
    ledgerSummary: ledger.summary(),
  }
}
