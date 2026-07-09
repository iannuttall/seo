import type { GscRow } from '../types.js'
import { createCtrBenchmarkContext } from './opportunity-primitives.js'
import {
  benchmarkDetails,
  opportunityType,
  recommendationFor,
  verificationFor,
} from './page-opportunities-evidence.js'
import {
  normalizePageOpportunityOptions,
  samePage,
  selectBenchmarkRows,
  selectTargetRows,
} from './page-opportunities-selection.js'
import type {
  PageOpportunityAnalysis,
  PageOpportunityAnalysisInput,
  PageOpportunityItem,
} from './page-opportunities-types.js'

export { technicalPageSignals } from './page-opportunities-evidence.js'
export type {
  PageOpportunityAnalysis,
  PageOpportunityAnalysisInput,
  PageOpportunityBenchmark,
  PageOpportunityItem,
  PageOpportunitySelection,
  PageOpportunityType,
  PageOpportunityVerification,
} from './page-opportunities-types.js'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareItems(
  left: PageOpportunityItem,
  right: PageOpportunityItem,
): number {
  return (
    (right.estimatedCtrClickShortfall ?? -1) -
      (left.estimatedCtrClickShortfall ?? -1) ||
    right.impressions - left.impressions ||
    left.position - right.position ||
    compareText(left.query, right.query) ||
    compareText(left.url, right.url)
  )
}

function analyzeRow(input: {
  row: GscRow
  reportInput: PageOpportunityAnalysisInput
  benchmarkContext: ReturnType<typeof createCtrBenchmarkContext>
  excludedTargetRows: GscRow[]
}): PageOpportunityItem {
  const query = input.row.keys[0]?.trim() ?? ''
  const pageOne = input.row.position >= 1 && input.row.position <= 10
  const benchmark = pageOne
    ? input.benchmarkContext.forAggregate(input.row, input.excludedTargetRows)
    : undefined
  const expectedClicks = benchmark
    ? Number((benchmark.ctr * input.row.impressions).toFixed(2))
    : undefined
  const estimatedCtrClickShortfall = benchmark
    ? Number(
        Math.max(
          0,
          benchmark.ctr * input.row.impressions - input.row.clicks,
        ).toFixed(2),
      )
    : undefined
  const verification = verificationFor({
    query,
    url: input.reportInput.url,
    page: input.reportInput.page,
    fetchDiagnostics: input.reportInput.fetchDiagnostics,
    httpStatus: input.reportInput.httpStatus,
  })
  const type = opportunityType({
    position: input.row.position,
    ctr: input.row.ctr,
    expectedCtr: benchmark?.ctr,
    verification,
  })

  return {
    query,
    url: input.row.keys[1] ?? input.reportInput.url,
    clicks: input.row.clicks,
    impressions: input.row.impressions,
    ctr: input.row.ctr,
    position: input.row.position,
    expectedCtr: benchmark?.ctr,
    expectedClicks,
    estimatedCtrClickShortfall,
    estimatedClickLift: estimatedCtrClickShortfall,
    opportunityType: type,
    benchmark: benchmarkDetails(benchmark, input.excludedTargetRows.length),
    verification,
    recommendation: recommendationFor({
      query,
      position: input.row.position,
      type,
    }),
  }
}

export function analyzePageOpportunitiesFromRows(
  input: PageOpportunityAnalysisInput,
): PageOpportunityAnalysis {
  const { minImpressions, limit } = normalizePageOpportunityOptions(input)
  const { eligibleRows, selection } = selectTargetRows({
    rows: input.targetRows,
    site: input.site,
    url: input.url,
    minImpressions,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const benchmarkRows = selectBenchmarkRows({
    rows: input.benchmarkRows,
    site: input.site,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const excludedTargetRows = benchmarkRows.filter((row) =>
    samePage(row.keys[1] ?? '', input.url),
  )
  const benchmarkContext = createCtrBenchmarkContext(benchmarkRows)
  const items = eligibleRows
    .map((row) =>
      analyzeRow({
        row,
        reportInput: input,
        benchmarkContext,
        excludedTargetRows,
      }),
    )
    .sort(compareItems)
    .slice(0, limit)
  const estimatedCtrClickShortfall = Number(
    items
      .reduce((sum, item) => sum + (item.estimatedCtrClickShortfall ?? 0), 0)
      .toFixed(2),
  )

  return {
    site: input.site,
    url: input.url,
    minImpressions,
    limit,
    httpStatus: input.httpStatus,
    dataStatus:
      input.targetRows.length === 0
        ? 'empty'
        : eligibleRows.length === 0
          ? 'filtered'
          : 'available',
    sourceRows: input.targetRows.length,
    eligibleRows: eligibleRows.length,
    returnedRows: items.length,
    benchmarkSourceRows: input.benchmarkRows.length,
    benchmarkEligibleRows: benchmarkRows.length,
    excludedTargetBenchmarkRows: excludedTargetRows.length,
    selection: {
      ...selection,
      returnedRows: items.length,
      limitedRows: Math.max(0, eligibleRows.length - items.length),
    },
    items,
    summary: {
      clicks: items.reduce((sum, item) => sum + item.clicks, 0),
      impressions: items.reduce((sum, item) => sum + item.impressions, 0),
      opportunities: items.filter(
        (item) =>
          item.opportunityType !== 'covered' &&
          item.opportunityType !== 'unverified',
      ).length,
      estimatedCtrClickShortfall,
      estimatedClickLift: estimatedCtrClickShortfall,
    },
  }
}
