import { querySearchAnalytics } from '../gsc/client.js'
import {
  findOverlappingSearchUpdates,
  listSearchUpdates,
  type SearchUpdate,
} from '../updates/search-status.js'
import { defaultDateRange } from './shared.js'

export interface TrafficAnomaly {
  site: string
  metric: 'clicks' | 'impressions'
  baselineStart: string
  baselineEnd: string
  comparisonStart: string
  comparisonEnd: string
  baselineMean: number
  comparisonMean: number
  zScore: number
  direction: 'drop' | 'spike' | 'normal'
  significant: boolean
}

export interface UpdateCorrelationReport {
  site: string
  generatedAt: string
  anomalies: TrafficAnomaly[]
  overlappingUpdates: SearchUpdate[]
  classification:
    | 'likely-update-related'
    | 'possibly-update-related'
    | 'not-enough-evidence'
}

function mean(values: number[]): number {
  return (
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  )
}

function standardDeviation(values: number[]): number {
  const average = mean(values)
  const variance = mean(values.map((value) => (value - average) ** 2))
  return Math.sqrt(variance)
}

function toFixedNumber(value: number, digits = 3): number {
  return Number(value.toFixed(digits))
}

export async function trafficAnomaly(input: {
  site: string
  days?: number
  recentDays?: number
  refresh?: boolean
}): Promise<{
  site: string
  generatedAt: string
  anomalies: TrafficAnomaly[]
  rows: number
}> {
  const days = input.days ?? 90
  const recentDays = input.recentDays ?? 7
  const range = defaultDateRange(days)
  const result = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['date'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )

  const rows = [...result.rows].sort((a, b) =>
    String(a.keys[0]).localeCompare(String(b.keys[0])),
  )
  const baselineRows = rows.slice(0, Math.max(0, rows.length - recentDays))
  const comparisonRows = rows.slice(Math.max(0, rows.length - recentDays))
  if (baselineRows.length < 14 || comparisonRows.length < 3) {
    throw new Error('Not enough daily GSC data for anomaly detection.')
  }

  const metrics: Array<'clicks' | 'impressions'> = ['clicks', 'impressions']
  const anomalies = metrics.map((metric) => {
    const baselineValues = baselineRows.map((row) => row[metric])
    const comparisonValues = comparisonRows.map((row) => row[metric])
    const baselineMean = mean(baselineValues)
    const comparisonMean = mean(comparisonValues)
    const stdDev = standardDeviation(baselineValues)
    const standardError = stdDev / Math.sqrt(comparisonValues.length)
    const zScore =
      standardError > 0 ? (comparisonMean - baselineMean) / standardError : 0
    const significant = Math.abs(zScore) >= 2

    return {
      site: input.site,
      metric,
      baselineStart: baselineRows[0]?.keys[0] ?? range.startDate,
      baselineEnd: baselineRows.at(-1)?.keys[0] ?? range.endDate,
      comparisonStart: comparisonRows[0]?.keys[0] ?? range.endDate,
      comparisonEnd: comparisonRows.at(-1)?.keys[0] ?? range.endDate,
      baselineMean: toFixedNumber(baselineMean),
      comparisonMean: toFixedNumber(comparisonMean),
      zScore: toFixedNumber(zScore),
      direction: significant ? (zScore < 0 ? 'drop' : 'spike') : 'normal',
      significant,
    } satisfies TrafficAnomaly
  })

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    anomalies,
    rows: rows.length,
  }
}

export async function updateCorrelation(input: {
  site: string
  days?: number
  recentDays?: number
  paddingDays?: number
  refresh?: boolean
}): Promise<UpdateCorrelationReport> {
  const anomalyReport = await trafficAnomaly(input)
  const significant = anomalyReport.anomalies.filter(
    (anomaly) => anomaly.significant,
  )
  const comparisonStart = anomalyReport.anomalies[0]?.comparisonStart
  const comparisonEnd = anomalyReport.anomalies[0]?.comparisonEnd
  const updates = await listSearchUpdates({ product: 'Ranking', limit: 50 })
  const overlappingUpdates =
    comparisonStart && comparisonEnd
      ? findOverlappingSearchUpdates({
          updates,
          startDate: comparisonStart,
          endDate: comparisonEnd,
          paddingDays: input.paddingDays,
        })
      : []

  const classification =
    significant.length > 0 && overlappingUpdates.length > 0
      ? 'likely-update-related'
      : overlappingUpdates.length > 0
        ? 'possibly-update-related'
        : 'not-enough-evidence'

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    anomalies: anomalyReport.anomalies,
    overlappingUpdates,
    classification,
  }
}
