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
  baselineTotal: number
  comparisonTotal: number
  percentChange: number
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
  confidence: 'medium' | 'low'
  summary: string
  evidence: string[]
  caveats: string[]
  actions: string[]
  source: {
    name: string
    url: string
    product: string
  }
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

function percentChange(baseline: number, comparison: number): number {
  if (!baseline) return comparison ? 100 : 0
  return ((comparison - baseline) / baseline) * 100
}

function formatPercent(value: number): string {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1)
  return `${rounded}%`
}

function formatMetric(metric: TrafficAnomaly['metric']): string {
  return metric === 'clicks' ? 'Clicks' : 'Impressions'
}

function anomalyEvidence(anomaly: TrafficAnomaly): string {
  const direction = anomaly.direction === 'drop' ? 'fell' : 'rose'
  const change =
    anomaly.direction === 'drop'
      ? Math.abs(anomaly.percentChange)
      : anomaly.percentChange
  if (anomaly.direction === 'normal') {
    return `${formatMetric(anomaly.metric)} changed ${formatPercent(anomaly.percentChange)} vs baseline (${anomaly.baselineMean.toLocaleString('en-GB')} -> ${anomaly.comparisonMean.toLocaleString('en-GB')} per day, z ${anomaly.zScore}).`
  }
  return `${formatMetric(anomaly.metric)} ${direction} ${formatPercent(change)} vs baseline (${anomaly.baselineMean.toLocaleString('en-GB')} -> ${anomaly.comparisonMean.toLocaleString('en-GB')} per day, z ${anomaly.zScore}).`
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return count === 1 ? singular : pluralLabel
}

function strongestSignal(
  anomalies: TrafficAnomaly[],
): TrafficAnomaly | undefined {
  return [...anomalies].sort(
    (a, b) => Math.abs(b.zScore) - Math.abs(a.zScore),
  )[0]
}

function buildUpdateCorrelationInterpretation(input: {
  site: string
  anomalies: TrafficAnomaly[]
  overlappingUpdates: SearchUpdate[]
  classification: UpdateCorrelationReport['classification']
  days: number
  recentDays: number
  paddingDays: number
  refresh?: boolean
}): Pick<
  UpdateCorrelationReport,
  'confidence' | 'summary' | 'evidence' | 'caveats' | 'actions' | 'source'
> {
  const significant = input.anomalies.filter((anomaly) => anomaly.significant)
  const strongest = strongestSignal(input.anomalies)
  const updateNames = input.overlappingUpdates.map((update) => update.name)
  const hasUpdate = input.overlappingUpdates.length > 0
  const direction = strongest?.direction ?? 'normal'
  const movement =
    direction === 'drop'
      ? 'dropped'
      : direction === 'spike'
        ? 'grew'
        : 'did not move enough to call an anomaly'
  const confidence: UpdateCorrelationReport['confidence'] =
    significant.length && hasUpdate ? 'medium' : 'low'
  const summary =
    significant.length && hasUpdate
      ? `${input.site} ${movement} during a period that overlaps ${updateNames.join(', ')}. Treat this as update-adjacent, not proof the update caused it.`
      : hasUpdate
        ? `${input.site} overlaps ${updateNames.join(', ')}, but GSC movement was not statistically significant in this window.`
        : `${input.site} had no official Google Ranking update overlap in the recent comparison window.`

  const actions =
    significant.length && hasUpdate
      ? [
          'Run segment-impact for page and query to separate affected templates, countries, and intents before editing pages.',
          'Check your own deployment, pruning, blocking, redirect, and tracking changes inside the same date window before blaming the Google update.',
          direction === 'drop'
            ? 'For drops, start with pages that lost both clicks and impressions; if impressions fell harder than CTR, this is more likely ranking/index coverage than snippet copy.'
            : 'For spikes, identify winning templates and queries so you can reinforce internal links and avoid changing pages that just improved.',
        ]
      : hasUpdate
        ? [
            'Do not call this an update hit yet. Expand the recent window or run segment-impact if you suspect delayed movement.',
          ]
        : [
            'If traffic moved, investigate site changes, seasonality, indexing, and segment-level movement before looking for update causes.',
          ]

  return {
    confidence,
    summary,
    evidence: [
      ...input.anomalies.map(anomalyEvidence),
      hasUpdate
        ? `${input.overlappingUpdates.length} official Google Ranking update ${plural(input.overlappingUpdates.length, 'window')} overlapped the comparison period: ${updateNames.join(', ')}.`
        : 'No official Google Ranking update windows overlapped the comparison period.',
    ],
    caveats: [
      `GSC window: ${input.days} days; recent comparison window: ${input.recentDays} days.`,
      `Update overlap padding: ${input.paddingDays} day(s) either side of the comparison window.`,
      input.refresh
        ? 'Data freshness: cache bypassed for GSC data.'
        : 'Data freshness: local GSC cache may have been used.',
      'Source: official Google Search Status Dashboard Ranking incidents only; third-party volatility and unconfirmed chatter are not included.',
      'Correlation is not causation. Site changes during the same window can fully explain the movement.',
    ],
    actions,
    source: {
      name: 'Google Search Status Dashboard incidents feed',
      url: 'https://status.search.google.com/incidents.json',
      product: 'Ranking',
    },
  }
}

export async function trafficAnomaly(input: {
  site: string
  days?: number
  recentDays?: number
  startDate?: string
  endDate?: string
  refresh?: boolean
}): Promise<{
  site: string
  generatedAt: string
  anomalies: TrafficAnomaly[]
  rows: number
}> {
  const days = input.days ?? 90
  const recentDays = input.recentDays ?? 7
  if (
    (input.startDate && !input.endDate) ||
    (!input.startDate && input.endDate)
  ) {
    throw new Error('Pass both startDate and endDate, or neither.')
  }
  const range =
    input.startDate && input.endDate
      ? { startDate: input.startDate, endDate: input.endDate }
      : defaultDateRange(days)
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
    const baselineTotal = baselineValues.reduce((sum, value) => sum + value, 0)
    const comparisonTotal = comparisonValues.reduce(
      (sum, value) => sum + value,
      0,
    )
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
      baselineTotal: toFixedNumber(baselineTotal),
      comparisonTotal: toFixedNumber(comparisonTotal),
      percentChange: toFixedNumber(percentChange(baselineMean, comparisonMean)),
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
  startDate?: string
  endDate?: string
  paddingDays?: number
  refresh?: boolean
}): Promise<UpdateCorrelationReport> {
  const days = input.days ?? 90
  const recentDays = input.recentDays ?? 7
  const paddingDays = input.paddingDays ?? 3
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
          paddingDays,
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
    ...buildUpdateCorrelationInterpretation({
      site: input.site,
      anomalies: anomalyReport.anomalies,
      overlappingUpdates,
      classification,
      days,
      recentDays,
      paddingDays,
      refresh: input.refresh,
    }),
  }
}
