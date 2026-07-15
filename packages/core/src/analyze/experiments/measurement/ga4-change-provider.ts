import {
  ga4ReportQualityWarnings,
  ga4RowsToObjects,
  type runGa4Report,
} from '../../../ga4/client.js'
import type { AnalyticsTestMetrics } from '../types.js'
import { analyticsDelta, summarizeGoogleAnalyticsRows } from './analytics.js'

type Window = { startDate: string; endDate: string }

async function queryGoogleAnalyticsMetrics(input: {
  propertyId: string
  window: Window
  filter?: unknown
  refresh?: boolean
  googleAnalyticsReport: typeof runGa4Report
  label: string
}): Promise<{
  metrics: AnalyticsTestMetrics
  source: {
    rows: number
    rowCount: number
    timeZone?: string
    currencyCode?: string
  }
  warnings: string[]
}> {
  const result = await input.googleAnalyticsReport(
    input.propertyId,
    {
      dateRanges: [input.window],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'sessions' },
        { name: 'engagedSessions' },
        { name: 'conversions' },
        { name: 'totalRevenue' },
      ],
      ...(input.filter ? { dimensionFilter: input.filter } : {}),
      limit: 10_000,
    },
    { refresh: input.refresh },
  )
  const rows = ga4RowsToObjects(result)
  return {
    metrics: summarizeGoogleAnalyticsRows(rows),
    source: {
      rows: rows.length,
      rowCount: result.rowCount ?? rows.length,
      timeZone: result.metadata?.timeZone,
      currencyCode: result.metadata?.currencyCode,
    },
    warnings: ga4ReportQualityWarnings(result, input.label),
  }
}

export async function queryGoogleAnalyticsChangeWindows(input: {
  propertyId: string
  before: Window
  after: Window
  filter?: unknown
  refresh?: boolean
  googleAnalyticsReport: typeof runGa4Report
}) {
  const [before, after] = await Promise.all([
    queryGoogleAnalyticsMetrics({
      ...input,
      window: input.before,
      label: 'Google Analytics before window',
    }),
    queryGoogleAnalyticsMetrics({
      ...input,
      window: input.after,
      label: 'Google Analytics after window',
    }),
  ])
  const metadataWarnings: string[] = []
  if (
    before.source.timeZone &&
    after.source.timeZone &&
    before.source.timeZone !== after.source.timeZone
  ) {
    metadataWarnings.push(
      'Google Analytics returned different property timezones across the two windows.',
    )
  }
  if (
    before.source.currencyCode &&
    after.source.currencyCode &&
    before.source.currencyCode !== after.source.currencyCode
  ) {
    metadataWarnings.push(
      'Google Analytics returned different currency codes across the two windows.',
    )
  }
  return {
    report: {
      propertyId: input.propertyId,
      before: { ...input.before, metrics: before.metrics },
      after: { ...input.after, metrics: after.metrics },
      delta: analyticsDelta({ before: before.metrics, after: after.metrics }),
      note: 'Google Analytics attribution is landing-page based. Query-level tests use GSC only.',
    },
    source: { before: before.source, after: after.source },
    warnings: [
      ...new Set([...before.warnings, ...after.warnings, ...metadataWarnings]),
    ],
  }
}
