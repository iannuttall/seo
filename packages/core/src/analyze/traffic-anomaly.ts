import { SeoError } from '../errors.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { shiftIsoDate } from '../gsc/dates.js'
import type { GscRow } from '../types.js'
import {
  findOverlappingSearchUpdates,
  listSearchUpdates,
  type SearchUpdate,
} from '../updates/search-status.js'
import { listChanges } from './experiments/change-log.js'
import type { ChangeScope, SeoChange } from './experiments/types.js'
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
  percentChange: number | null
  zScore: number | null
  significanceMethod: 'z-score' | 'outside-flat-baseline' | 'none'
  direction: 'drop' | 'spike' | 'normal'
  significant: boolean
}

export interface TrafficAnomalyCoverage {
  status: 'complete' | 'partial'
  requestedStart: string
  requestedEnd: string
  returnedRows: number
  observedDays: number
  invalidRows: number
  duplicateRows: number
  expectedDays: number
  missingDays: number
  baseline: {
    start: string
    end: string
    expectedDays: number
    observedDays: number
    missingDays: number
  }
  comparison: {
    start: string
    end: string
    expectedDays: number
    observedDays: number
    missingDays: number
  }
  caveats: string[]
}

export interface TrafficAnomalyReport {
  site: string
  generatedAt: string
  anomalies: TrafficAnomaly[]
  rows: number
  coverage?: TrafficAnomalyCoverage
}

export interface UpdateCorrelationReport {
  site: string
  generatedAt: string
  anomalies: TrafficAnomaly[]
  overlappingUpdates: SearchUpdate[]
  classification:
    | 'significant-movement-with-update-overlap'
    | 'update-overlap-without-significant-movement'
    | 'no-update-overlap'
    | 'insufficient-data'
  attribution: 'not-established'
  confidence: 'none'
  confounders: UpdateConfounder[]
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

export type UpdateConfounder = {
  source: 'change-log' | 'manual'
  title: string
  date?: string
  scope?: ChangeScope
  target?: string
  description?: string
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

function percentChange(baseline: number, comparison: number): number | null {
  if (!baseline) return comparison ? null : 0
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
    anomaly.percentChange === null
      ? null
      : anomaly.direction === 'drop'
        ? Math.abs(anomaly.percentChange)
        : anomaly.percentChange
  const changePhrase =
    change === null
      ? 'from a zero baseline; percentage change is undefined'
      : `${formatPercent(change)} vs baseline`
  if (anomaly.direction === 'normal') {
    return `${formatMetric(anomaly.metric)} changed ${changePhrase} (${anomaly.baselineMean.toLocaleString('en-GB')} -> ${anomaly.comparisonMean.toLocaleString('en-GB')} per observed day${anomaly.zScore === null ? '; the baseline had no observed variance' : `, z ${anomaly.zScore}`}).`
  }
  return `${formatMetric(anomaly.metric)} ${direction} ${changePhrase} (${anomaly.baselineMean.toLocaleString('en-GB')} -> ${anomaly.comparisonMean.toLocaleString('en-GB')} per observed day${anomaly.zScore === null ? '; outside the flat observed baseline' : `, z ${anomaly.zScore}`}).`
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return count === 1 ? singular : pluralLabel
}

function strongestSignal(
  anomalies: TrafficAnomaly[],
): TrafficAnomaly | undefined {
  return [...anomalies].sort((a, b) => {
    if (a.significant !== b.significant) return a.significant ? -1 : 1
    const zDifference = Math.abs(b.zScore ?? 0) - Math.abs(a.zScore ?? 0)
    if (zDifference) return zDifference
    const changeDifference =
      Math.abs(b.percentChange ?? 0) - Math.abs(a.percentChange ?? 0)
    if (changeDifference) return changeDifference
    return a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0
  })[0]
}

function dateMs(value: string): number {
  return new Date(value).getTime()
}

function changesInWindow(input: {
  changes: SeoChange[]
  startDate?: string
  endDate?: string
  paddingDays: number
}): SeoChange[] {
  if (!input.startDate || !input.endDate) return []
  const paddingMs = input.paddingDays * 86_400_000
  const start = dateMs(input.startDate) - paddingMs
  const end = dateMs(input.endDate) + paddingMs
  return input.changes.filter((change) => {
    const changedAt = dateMs(change.changedAt)
    return changedAt >= start && changedAt <= end
  })
}

function movementIsLarge(anomalies: TrafficAnomaly[]): boolean {
  const significant = anomalies.filter((anomaly) => anomaly.significant)
  if (significant.length < 2) return false
  const directions = new Set(significant.map((anomaly) => anomaly.direction))
  if (directions.size !== 1 || directions.has('normal')) return false
  const clicks = significant.find((anomaly) => anomaly.metric === 'clicks')
  const impressions = significant.find(
    (anomaly) => anomaly.metric === 'impressions',
  )
  if (!clicks || !impressions) return false
  if (clicks.percentChange === null || impressions.percentChange === null) {
    return false
  }
  const clickChange = Math.abs(clicks.percentChange)
  const impressionChange = Math.abs(impressions.percentChange)
  const strongestZ = Math.max(
    ...significant.map((item) => Math.abs(item.zScore ?? 0)),
  )
  const outsideFlatBaseline = significant.some(
    (item) => item.significanceMethod === 'outside-flat-baseline',
  )
  return (
    (strongestZ >= 3 || outsideFlatBaseline) &&
    Math.min(clickChange, impressionChange) >= 45 &&
    Math.max(clickChange, impressionChange) >= 60
  )
}

function confounderTitle(confounder: UpdateConfounder): string {
  const date = confounder.date ? `${confounder.date}: ` : ''
  const scope = confounder.scope ? `${confounder.scope} ` : ''
  return `${date}${scope}${confounder.title}`
}

export function interpretUpdateCorrelation(input: {
  site: string
  anomalies: TrafficAnomaly[]
  overlappingUpdates: SearchUpdate[]
  confounders?: UpdateConfounder[]
  days: number
  recentDays: number
  paddingDays: number
  refresh?: boolean
}): Pick<
  UpdateCorrelationReport,
  | 'classification'
  | 'attribution'
  | 'confidence'
  | 'confounders'
  | 'summary'
  | 'evidence'
  | 'caveats'
  | 'actions'
  | 'source'
> {
  const significant = input.anomalies.filter((anomaly) => anomaly.significant)
  const strongest = strongestSignal(input.anomalies)
  const updateNames = input.overlappingUpdates.map((update) => update.name)
  const hasUpdate = input.overlappingUpdates.length > 0
  const confounders = input.confounders ?? []
  const hasConfounders = confounders.length > 0
  const largeMovement = movementIsLarge(input.anomalies)
  const classification: UpdateCorrelationReport['classification'] =
    significant.length > 0 && hasUpdate
      ? 'significant-movement-with-update-overlap'
      : hasUpdate
        ? 'update-overlap-without-significant-movement'
        : 'no-update-overlap'
  const direction = strongest?.direction ?? 'normal'
  const movement =
    direction === 'drop'
      ? largeMovement
        ? 'collapsed'
        : 'dropped'
      : direction === 'spike'
        ? largeMovement
          ? 'surged'
          : 'grew'
        : 'did not move enough to call an anomaly'
  const attribution: UpdateCorrelationReport['attribution'] = 'not-established'
  const confidence: UpdateCorrelationReport['confidence'] = 'none'
  const knownChangePhrase =
    confounders.length === 1
      ? '1 known site change also overlaps'
      : `${confounders.length} known site changes also overlap`
  const summary =
    significant.length && hasUpdate
      ? `${input.site} ${movement} during a period that overlaps ${updateNames.join(', ')}.${hasConfounders ? ` ${knownChangePhrase} this window.` : ''} The overlap is timing context and does not establish what caused the movement.`
      : hasUpdate
        ? `${input.site} overlaps ${updateNames.join(', ')}, but no significant GSC movement was detected in this window.`
        : `${input.site} had no official Google Ranking update overlap in the recent comparison window.`

  const actions =
    significant.length && hasUpdate && hasConfounders
      ? [
          'Start with the overlapping site changes. Test whether pruning, blocking, redirects, deploys, or tracking changes explain the observed movement.',
          'Run segment-impact for page and query and compare affected sections against the saved change targets.',
          'Compare changed and unchanged sections, then record which explanation the segment evidence supports.',
        ]
      : significant.length && hasUpdate
        ? [
            'Run update-postmortem and segment-impact next to find the winning or losing templates, queries, countries, and devices without assuming a cause.',
            direction === 'drop'
              ? 'For a collapse, avoid broad rewrites first. Identify the templates that lost impressions, then check indexability, intent fit, and SERP changes.'
              : 'For a surge, document the winning templates and reinforce them with internal links before changing pages that improved.',
            'Add any missed deploy, pruning, blocking, or content changes to change-log so later comparisons include that evidence.',
          ]
        : hasUpdate
          ? [
              'No significant movement was detected in this comparison. Keep the overlap as context and avoid an update-impact conclusion.',
            ]
          : [
              'If traffic moved, investigate site changes, seasonality, indexing, and segment-level movement before looking for update causes.',
            ]

  return {
    classification,
    attribution,
    confidence,
    confounders,
    summary,
    evidence: [
      ...input.anomalies.map(anomalyEvidence),
      hasUpdate
        ? `${input.overlappingUpdates.length} official Google Ranking update ${plural(input.overlappingUpdates.length, 'window')} overlapped the comparison period: ${updateNames.join(', ')}.`
        : 'No official Google Ranking update windows overlapped the comparison period.',
      largeMovement
        ? 'Both clicks and impressions moved sharply in the same direction.'
        : 'Clicks and impressions did not both meet the sharp-movement evidence threshold.',
      hasConfounders
        ? `Known overlapping site changes: ${confounders.map(confounderTitle).join('; ')}.`
        : 'No saved or manually supplied overlapping site changes were found.',
    ],
    caveats: [
      `GSC window: ${input.days} days; recent comparison window: ${input.recentDays} days.`,
      `Update overlap padding: ${input.paddingDays} ${plural(input.paddingDays, 'day')} either side of the comparison window.`,
      input.refresh
        ? 'Data freshness: cache bypassed for GSC data.'
        : 'Data freshness: local GSC cache may have been used.',
      'Source: official Google Search Status Dashboard Ranking incidents only; third-party volatility and unconfirmed chatter are not included.',
      'An update-window overlap cannot establish causation, even when movement is large and no known site change was recorded.',
      'Attribution remains not established. Use segment-impact and update-postmortem to describe which templates or intents moved, then test possible explanations separately.',
    ],
    actions,
    source: {
      name: 'Google Search Status Dashboard incidents feed',
      url: 'https://status.search.google.com/incidents.json',
      product: 'Ranking',
    },
  }
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

function calendarDays(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00.000Z`)
  const endMs = Date.parse(`${end}T00:00:00.000Z`)
  return Math.floor((endMs - startMs) / 86_400_000) + 1
}

function validMetricRow(row: GscRow): boolean {
  return (
    row.keys.length === 1 &&
    Number.isFinite(row.clicks) &&
    row.clicks >= 0 &&
    Number.isFinite(row.impressions) &&
    row.impressions >= 0
  )
}

function aggregateDailyRows(input: {
  rows: GscRow[]
  startDate: string
  endDate: string
}): { rows: GscRow[]; invalidRows: number; duplicateRows: number } {
  const byDate = new Map<string, GscRow>()
  let invalidRows = 0
  let duplicateRows = 0

  for (const row of input.rows) {
    const date = row.keys[0]
    if (
      !date ||
      !validIsoDate(date) ||
      date < input.startDate ||
      date > input.endDate ||
      !validMetricRow(row)
    ) {
      invalidRows += 1
      continue
    }
    const existing = byDate.get(date)
    if (existing) {
      duplicateRows += 1
      existing.clicks += row.clicks
      existing.impressions += row.impressions
      continue
    }
    byDate.set(date, { ...row, keys: [date] })
  }

  return {
    rows: [...byDate.values()].sort((a, b) => {
      const aDate = a.keys[0] ?? ''
      const bDate = b.keys[0] ?? ''
      return aDate < bDate ? -1 : aDate > bDate ? 1 : 0
    }),
    invalidRows,
    duplicateRows,
  }
}

export function analyzeTrafficAnomalyRows(input: {
  site: string
  rows: GscRow[]
  startDate: string
  endDate: string
  recentDays: number
}): {
  anomalies: TrafficAnomaly[]
  coverage: TrafficAnomalyCoverage
} {
  if (
    !validIsoDate(input.startDate) ||
    !validIsoDate(input.endDate) ||
    input.startDate > input.endDate
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Pass a valid Search Console date range.',
    )
  }
  if (!Number.isInteger(input.recentDays) || input.recentDays < 1) {
    throw new SeoError(
      'INVALID_INPUT',
      'recentDays must be a positive integer.',
    )
  }

  const expectedDays = calendarDays(input.startDate, input.endDate)
  const comparisonStart = shiftIsoDate(input.endDate, -(input.recentDays - 1))
  const baselineEnd = shiftIsoDate(comparisonStart, -1)
  const baselineExpectedDays = calendarDays(input.startDate, baselineEnd)
  if (comparisonStart < input.startDate || baselineExpectedDays < 14) {
    throw new SeoError(
      'INSUFFICIENT_DATA',
      'The requested calendar range does not contain at least 14 baseline days before the comparison window.',
    )
  }

  const aggregated = aggregateDailyRows({
    rows: input.rows,
    startDate: input.startDate,
    endDate: input.endDate,
  })
  const baselineRows = aggregated.rows.filter(
    (row) => (row.keys[0] ?? '') <= baselineEnd,
  )
  const comparisonRows = aggregated.rows.filter(
    (row) => (row.keys[0] ?? '') >= comparisonStart,
  )
  if (baselineRows.length < 14 || comparisonRows.length < 3) {
    throw new SeoError(
      'INSUFFICIENT_DATA',
      `Not enough observed daily GSC data for anomaly detection (${baselineRows.length} baseline days and ${comparisonRows.length} comparison days).`,
    )
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
      standardError > 0 ? (comparisonMean - baselineMean) / standardError : null
    const outsideFlatBaseline =
      zScore === null && comparisonMean !== baselineMean
    const significant =
      outsideFlatBaseline || (zScore !== null && Math.abs(zScore) >= 2)
    const direction = significant
      ? comparisonMean < baselineMean
        ? 'drop'
        : 'spike'
      : 'normal'
    const relativeChange = percentChange(baselineMean, comparisonMean)

    return {
      site: input.site,
      metric,
      baselineStart: input.startDate,
      baselineEnd,
      comparisonStart,
      comparisonEnd: input.endDate,
      baselineMean: toFixedNumber(baselineMean),
      comparisonMean: toFixedNumber(comparisonMean),
      baselineTotal: toFixedNumber(baselineTotal),
      comparisonTotal: toFixedNumber(comparisonTotal),
      percentChange:
        relativeChange === null ? null : toFixedNumber(relativeChange),
      zScore: zScore === null ? null : toFixedNumber(zScore),
      significanceMethod: significant
        ? outsideFlatBaseline
          ? 'outside-flat-baseline'
          : 'z-score'
        : 'none',
      direction,
      significant,
    } satisfies TrafficAnomaly
  })

  const baselineMissingDays = baselineExpectedDays - baselineRows.length
  const comparisonMissingDays = input.recentDays - comparisonRows.length
  const missingDays = expectedDays - aggregated.rows.length
  const caveats = [
    ...(missingDays > 0
      ? [
          `${missingDays} requested calendar ${plural(missingDays, 'day')} had no returned date aggregate and ${missingDays === 1 ? 'was' : 'were'} not filled with zeros.`,
        ]
      : []),
    ...(aggregated.invalidRows > 0
      ? [
          `${aggregated.invalidRows} invalid provider ${plural(aggregated.invalidRows, 'row')} ${aggregated.invalidRows === 1 ? 'was' : 'were'} excluded.`,
        ]
      : []),
    ...(aggregated.duplicateRows > 0
      ? [
          `${aggregated.duplicateRows} duplicate date ${plural(aggregated.duplicateRows, 'row')} ${aggregated.duplicateRows === 1 ? 'was' : 'were'} aggregated before analysis.`,
        ]
      : []),
  ]

  return {
    anomalies,
    coverage: {
      status:
        missingDays > 0 || aggregated.invalidRows > 0 ? 'partial' : 'complete',
      requestedStart: input.startDate,
      requestedEnd: input.endDate,
      returnedRows: input.rows.length,
      observedDays: aggregated.rows.length,
      invalidRows: aggregated.invalidRows,
      duplicateRows: aggregated.duplicateRows,
      expectedDays,
      missingDays,
      baseline: {
        start: input.startDate,
        end: baselineEnd,
        expectedDays: baselineExpectedDays,
        observedDays: baselineRows.length,
        missingDays: baselineMissingDays,
      },
      comparison: {
        start: comparisonStart,
        end: input.endDate,
        expectedDays: input.recentDays,
        observedDays: comparisonRows.length,
        missingDays: comparisonMissingDays,
      },
      caveats,
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
}): Promise<TrafficAnomalyReport> {
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

  const analyzed = analyzeTrafficAnomalyRows({
    site: input.site,
    rows: result.rows,
    startDate: range.startDate,
    endDate: range.endDate,
    recentDays,
  })

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    anomalies: analyzed.anomalies,
    rows: result.rows.length,
    coverage: analyzed.coverage,
  }
}

export async function updateCorrelation(input: {
  site: string
  days?: number
  recentDays?: number
  startDate?: string
  endDate?: string
  paddingDays?: number
  knownConfounders?: string[]
  includeChangeLog?: boolean
  refresh?: boolean
  trafficAnomalies?: TrafficAnomaly[]
}): Promise<UpdateCorrelationReport> {
  const days = input.days ?? 90
  const recentDays = input.recentDays ?? 7
  const paddingDays = input.paddingDays ?? 3
  const anomalies =
    input.trafficAnomalies ?? (await trafficAnomaly(input)).anomalies
  const comparisonStart = anomalies[0]?.comparisonStart
  const comparisonEnd = anomalies[0]?.comparisonEnd
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
  const savedConfounders =
    input.includeChangeLog === false
      ? []
      : changesInWindow({
          changes: listChanges({ site: input.site, limit: 100 }),
          startDate: comparisonStart,
          endDate: comparisonEnd,
          paddingDays,
        }).map(
          (change): UpdateConfounder => ({
            source: 'change-log',
            title: change.title,
            date: change.changedAt,
            scope: change.scope,
            target: change.target,
            description: change.description,
          }),
        )
  const manualConfounders = (input.knownConfounders ?? []).map(
    (title): UpdateConfounder => ({
      source: 'manual',
      title,
    }),
  )
  const confounders = [...savedConfounders, ...manualConfounders]

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    anomalies,
    overlappingUpdates,
    ...interpretUpdateCorrelation({
      site: input.site,
      anomalies,
      overlappingUpdates,
      confounders,
      days,
      recentDays,
      paddingDays,
      refresh: input.refresh,
    }),
  }
}
