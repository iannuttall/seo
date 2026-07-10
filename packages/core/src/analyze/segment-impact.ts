import { querySearchAnalytics } from '../gsc/client.js'
import { analyzeSegmentRows } from './segment-impact-analysis.js'
import {
  resolveSegmentRanges,
  segmentRangeDays,
  validateSegmentRanges,
  validateSegmentSite,
} from './segment-impact-input.js'
import type {
  SegmentDimension,
  SegmentImpactReport,
} from './segment-impact-types.js'
import { validateDecayRanges } from './site-diagnostics/decay-report-input.js'
import { integerOption } from './site-diagnostics/quick-wins-report-input.js'

export { analyzeSegmentRows } from './segment-impact-analysis.js'
export { unavailableSegmentImpactReport } from './segment-impact-fallback.js'
export {
  resolveSegmentRanges,
  segmentComparisonRange,
  segmentRangeDays,
} from './segment-impact-input.js'
export type * from './segment-impact-types.js'

const DEFAULT_MAX_ROWS = 100_000
type SearchAnalytics = typeof querySearchAnalytics

export interface SegmentImpactInput {
  site: string
  dimension?: SegmentDimension
  days?: number
  compareDays?: number
  startDate?: string
  endDate?: string
  limit?: number
  unmatchedLimit?: number
  maxRows?: number
  refresh?: boolean
}

export interface SegmentImpactDependencies {
  searchAnalytics: SearchAnalytics
  now: () => Date
}

const defaultDependencies: SegmentImpactDependencies = {
  searchAnalytics: querySearchAnalytics,
  now: () => new Date(),
}

export function compareSegmentRows(input: {
  site: string
  dimension: SegmentDimension
  before: { startDate: string; endDate: string }
  after: { startDate: string; endDate: string }
  beforeRows: import('../types.js').GscRow[]
  afterRows: import('../types.js').GscRow[]
  limit?: number
  unmatchedLimit?: number
  maxRows?: number
  generatedAt?: string
}): SegmentImpactReport {
  validateSegmentSite(input.site)
  const limit = integerOption({
    value: input.limit,
    fallback: 25,
    minimum: 1,
    maximum: 100,
    label: 'limit',
  })
  const unmatchedLimit = integerOption({
    value: input.unmatchedLimit,
    fallback: 25,
    minimum: 0,
    maximum: 100,
    label: 'unmatchedLimit',
  })
  const maxRows = integerOption({
    value: input.maxRows,
    fallback: DEFAULT_MAX_ROWS,
    minimum: 1,
    maximum: 250_000,
    label: 'maxRows',
  })
  const rangeDays = validateSegmentRanges({
    before: input.before,
    after: input.after,
  })
  return analyzeSegmentRows({
    ...input,
    ...rangeDays,
    limit,
    unmatchedLimit,
    maxRows,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  })
}

export async function segmentImpact(
  input: SegmentImpactInput,
  dependencies: SegmentImpactDependencies = defaultDependencies,
): Promise<SegmentImpactReport> {
  validateSegmentSite(input.site)
  const now = dependencies.now()
  const ranges = resolveSegmentRanges({ ...input, now })
  validateDecayRanges({
    current: ranges.after,
    previous: ranges.before,
    now,
  })
  const limit = integerOption({
    value: input.limit,
    fallback: 25,
    minimum: 1,
    maximum: 100,
    label: 'limit',
  })
  const unmatchedLimit = integerOption({
    value: input.unmatchedLimit,
    fallback: 25,
    minimum: 0,
    maximum: 100,
    label: 'unmatchedLimit',
  })
  const maxRows = integerOption({
    value: input.maxRows,
    fallback: DEFAULT_MAX_ROWS,
    minimum: 1,
    maximum: 250_000,
    label: 'maxRows',
  })
  const dimension = input.dimension ?? 'page'
  const request = {
    dimensions: [dimension],
    type: 'web' as const,
    dataState: 'final' as const,
    aggregationType: 'auto' as const,
    maxRows,
  }
  const [beforeResult, afterResult] = await Promise.all([
    dependencies.searchAnalytics(
      input.site,
      { ...ranges.before, ...request },
      { refresh: input.refresh },
    ),
    dependencies.searchAnalytics(
      input.site,
      { ...ranges.after, ...request },
      { refresh: input.refresh },
    ),
  ])

  return analyzeSegmentRows({
    site: input.site,
    dimension,
    before: ranges.before,
    after: ranges.after,
    beforeDays: segmentRangeDays(ranges.before),
    afterDays: segmentRangeDays(ranges.after),
    beforeRows: beforeResult.rows,
    afterRows: afterResult.rows,
    beforeRowsFetched: beforeResult.rowsFetched,
    afterRowsFetched: afterResult.rowsFetched,
    beforeCalls: beforeResult.calls,
    afterCalls: afterResult.calls,
    limit,
    unmatchedLimit,
    maxRows,
    generatedAt: now.toISOString(),
  })
}
