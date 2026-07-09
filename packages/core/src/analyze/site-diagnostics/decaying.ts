import { SeoError } from '../../errors.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { SessionLedger } from '../../storage/ledger.js'
import { analyzeDecay } from './decay-analysis.js'
import {
  decayComparisonRange,
  decayNumberOption,
  validateDecayRanges,
} from './decay-report-input.js'
import type { DecayComparison, DecayReport } from './decay-types.js'
import {
  defaultDateRange,
  explicitDateRange,
  integerOption,
} from './quick-wins-report-input.js'

export { decayComparisonRange } from './decay-report-input.js'
export type * from './decay-types.js'

const MAX_GSC_ROWS = 100_000
type SearchAnalytics = typeof querySearchAnalytics

export interface DecayingReportInput {
  site: string
  days?: number
  startDate?: string
  endDate?: string
  comparison?: DecayComparison
  limit?: number
  minDropPct?: number
  minPreviousClicks?: number
  minClickLoss?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}

export interface DecayingDependencies {
  searchAnalytics: SearchAnalytics
  now: () => Date
}

const defaultDependencies: DecayingDependencies = {
  searchAnalytics: querySearchAnalytics,
  now: () => new Date(),
}

function verdict(
  report: Pick<DecayReport, 'dataStatus' | 'selection'>,
): string {
  if (report.dataStatus === 'empty')
    return 'Search Console returned no retained query/page rows for either comparison window.'
  if (
    report.dataStatus === 'partial' &&
    report.selection.currentAggregatedRows === 0
  ) {
    return 'The current retained-row window is empty, so no query/page losses were inferred.'
  }
  if (
    report.dataStatus === 'partial' &&
    report.selection.previousAggregatedRows === 0
  ) {
    return 'The comparison retained-row window is empty, so query/page decay could not be measured.'
  }
  if (!report.selection.eligibleRows) {
    return 'No observed retained query/page declines matched the report filters.'
  }
  return `${report.selection.returnedRows} of ${report.selection.eligibleRows} observed retained query/page declines returned for review.`
}

export async function decayingReport(
  input: DecayingReportInput,
  dependencies: DecayingDependencies = defaultDependencies,
): Promise<DecayReport> {
  if (
    input.comparison !== undefined &&
    input.comparison !== 'previous-period' &&
    input.comparison !== 'year-over-year'
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'comparison must be previous-period or year-over-year.',
    )
  }
  if (
    input.brandTerms &&
    (input.brandTerms.length > 20 ||
      input.brandTerms.some((term) => !term.trim() || term.trim().length > 200))
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'brandTerms must contain at most 20 non-empty terms of 200 characters or fewer.',
    )
  }
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
  const minDropPct = decayNumberOption({
    value: input.minDropPct,
    fallback: 20,
    minimum: 0,
    maximum: 100,
    label: 'minDropPct',
  })
  const minPreviousClicks = decayNumberOption({
    value: input.minPreviousClicks,
    fallback: 2,
    minimum: 0,
    maximum: 1_000_000_000,
    label: 'minPreviousClicks',
  })
  const minClickLoss = decayNumberOption({
    value: input.minClickLoss,
    fallback: 1,
    minimum: 0,
    maximum: 1_000_000_000,
    label: 'minClickLoss',
  })
  const now = dependencies.now()
  const explicit = explicitDateRange(input, 548)
  const currentRange = explicit?.range ?? defaultDateRange(days, now)
  const comparison = input.comparison ?? 'previous-period'
  const previousRange = decayComparisonRange(currentRange, comparison)
  validateDecayRanges({
    current: currentRange,
    previous: previousRange,
    now,
  })
  const request = {
    dimensions: ['query', 'page'] as ['query', 'page'],
    aggregationType: 'auto' as const,
    type: 'web' as const,
    dataState: 'final' as const,
    maxRows: MAX_GSC_ROWS,
  }
  const [current, previous] = await Promise.all([
    dependencies.searchAnalytics(
      input.site,
      { ...request, ...currentRange },
      { refresh: input.refresh },
    ),
    dependencies.searchAnalytics(
      input.site,
      { ...request, ...previousRange },
      { refresh: input.refresh },
    ),
  ])
  const ledger = new SessionLedger()
  ledger.addGsc(current.calls, current.rowsFetched)
  ledger.addGsc(previous.calls, previous.rowsFetched)
  const analysis = analyzeDecay({
    site: input.site,
    currentRows: current.rows,
    previousRows: previous.rows,
    minDropPct,
    minPreviousClicks,
    minClickLoss,
    limit,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const currentTruncated = current.rowsFetched >= MAX_GSC_ROWS
  const previousTruncated = previous.rowsFetched >= MAX_GSC_ROWS
  const possiblyTruncated = currentTruncated || previousTruncated
  const dataStatus: DecayReport['dataStatus'] =
    current.rowsFetched === 0 && previous.rowsFetched === 0
      ? 'empty'
      : current.rowsFetched === 0 ||
          previous.rowsFetched === 0 ||
          possiblyTruncated ||
          analysis.selection.currentInvalidRows > 0 ||
          analysis.selection.previousInvalidRows > 0 ||
          analysis.selection.currentRowNotRetained > 0
        ? 'partial'
        : analysis.selection.eligibleRows === 0
          ? 'filtered'
          : 'complete'
  const reportBase = { dataStatus, selection: analysis.selection }
  return {
    schemaVersion: 1,
    site: input.site,
    generatedAt: now.toISOString(),
    comparison,
    ranges: { current: currentRange, previous: previousRange },
    rangeDays: explicit?.days ?? days,
    dataStatus,
    source: {
      provider: 'google-search-console',
      dimensions: ['query', 'page'],
      aggregationType: 'auto',
      searchType: 'web',
      dataState: 'final',
      current: {
        rowsFetched: current.rowsFetched,
        calls: current.calls,
        maxRows: MAX_GSC_ROWS,
        possiblyTruncated: currentTruncated,
      },
      previous: {
        rowsFetched: previous.rowsFetched,
        calls: previous.calls,
        maxRows: MAX_GSC_ROWS,
        possiblyTruncated: previousTruncated,
      },
      completeness: possiblyTruncated
        ? 'possibly-truncated'
        : 'retained-query-rows-only',
    },
    methodology: {
      id: 'gsc_retained_query_page_decay_v2',
      version: 2,
      gscHistoryMonths: 16,
      missingRowsTreatedAsZero: false,
      urlShiftsExcluded: true,
      causeLanguage: 'signals-not-attribution',
    },
    filters: {
      minDropPct,
      minPreviousClicks,
      minClickLoss,
      limit,
      brand: input.includeBrand ? 'included' : 'excluded',
    },
    selection: analysis.selection,
    summary: {
      eligibleRows: analysis.selection.eligibleRows,
      returnedRows: analysis.selection.returnedRows,
      groups: analysis.selection.eligibleGroups,
      observedRetainedQueryClickLoss:
        analysis.totals.eligibleObservedRetainedQueryClickLoss,
      returnedObservedRetainedQueryClickLoss:
        analysis.totals.returnedObservedRetainedQueryClickLoss,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: verdict(reportBase),
    },
    caveats: [
      `Current window: ${currentRange.startDate} to ${currentRange.endDate}; comparison: ${previousRange.startDate} to ${previousRange.endDate}.`,
      'Only declines observed in retained GSC query/page rows are counted. Missing current rows are reported in selection and never converted to zero traffic.',
      'Queries retained on a different current URL are counted as URL shifts and excluded from content-decay actions.',
      'Search Console API history is limited to a rolling 16 months. Ranges outside that horizon are rejected instead of compared partially.',
      'Search Console omits anonymized and lower-volume rows and does not guarantee every row. Signals do not establish cause.',
    ],
    recommendations: analysis.groups.length
      ? analysis.groups.slice(0, 5).map((group) => group.recommendation)
      : [
          'No content-decay action is recommended from the observed retained rows.',
        ],
    items: analysis.items,
    groups: analysis.groups,
    templates: analysis.templates,
    ledgerSummary: ledger.summary(),
    warnings: [
      ...(possiblyTruncated
        ? [
            'At least one GSC window reached the 100,000-row safety cap. Results may be truncated.',
          ]
        : []),
      ...(analysis.selection.currentRowNotRetained
        ? [
            `${analysis.selection.currentRowNotRetained} previous query/page rows were not retained in the current response and were excluded rather than treated as zero.`,
          ]
        : []),
      ...(analysis.selection.currentInvalidRows ||
      analysis.selection.previousInvalidRows
        ? [
            `${analysis.selection.currentInvalidRows} current and ${analysis.selection.previousInvalidRows} comparison rows had invalid dimensions or metrics and were excluded.`,
          ]
        : []),
      ...(previous.rowsFetched === 0 && current.rowsFetched > 0
        ? [
            'The comparison window returned no retained query/page rows, so decay could not be measured.',
          ]
        : []),
      ...(analysis.selection.urlShiftRows
        ? [
            `${analysis.selection.urlShiftRows} previous query/page rows now appear under another URL and were excluded from content-decay actions.`,
          ]
        : []),
    ],
  }
}
