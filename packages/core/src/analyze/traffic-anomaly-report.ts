import { SeoError } from '../errors.js'
import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { defaultDateRange } from './shared.js'
import {
  analyzeTrafficAnomalyRows,
  type TrafficAnomalyReport,
} from './traffic-anomaly-analysis.js'

export type TrafficAnomalyInput = {
  site: string
  days?: number
  recentDays?: number
  startDate?: string
  endDate?: string
  refresh?: boolean
}

export type TrafficAnomalyDependencies = {
  searchAnalytics: SearchAnalyticsQuery
  now: () => Date
}

export async function trafficAnomalyWith(
  input: TrafficAnomalyInput,
  dependencies: TrafficAnomalyDependencies,
): Promise<TrafficAnomalyReport> {
  const days = input.days ?? 90
  const recentDays = input.recentDays ?? 7
  if (
    (input.startDate && !input.endDate) ||
    (!input.startDate && input.endDate)
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Pass both startDate and endDate, or neither.',
    )
  }
  const range =
    input.startDate && input.endDate
      ? { startDate: input.startDate, endDate: input.endDate }
      : defaultDateRange(days, dependencies.now())
  const result = await dependencies.searchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['date'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )

  const analyzed = analyzeTrafficAnomalyRows({
    site: input.site,
    rows: result.rows,
    startDate: range.startDate,
    endDate: range.endDate,
    recentDays,
  })

  const coverage = analyzed.coverage
  return {
    site: input.site,
    generatedAt: dependencies.now().toISOString(),
    range,
    anomalies: analyzed.anomalies,
    rows: result.rows.length,
    selection: {
      sourceRows: result.rows.length,
      invalidRows: coverage.invalidRows,
      duplicateRows: coverage.duplicateRows,
      observedDays: coverage.observedDays,
      expectedDays: coverage.expectedDays,
      missingDays: coverage.missingDays,
      baselineDays: coverage.baseline.observedDays,
      comparisonDays: coverage.comparison.observedDays,
    },
    coverage,
    detection: analyzed.detection,
  }
}
