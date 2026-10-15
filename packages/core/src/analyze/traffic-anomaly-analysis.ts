import { SeoError } from '../errors.js'
import { shiftIsoDate } from '../gsc/dates.js'
import type { GscRow } from '../types.js'
import type { SearchUpdate } from '../updates/search-updates.js'
import type { ChangeScope, SeoChange } from './experiments/types.js'

// Pure traffic anomaly detection and Google update correlation. The local
// report in traffic-anomaly.ts fetches rows and calls these functions.

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
  significanceMethod:
    | 'z-score'
    | 'outside-flat-baseline'
    | 'step-change'
    | 'none'
  direction: 'drop' | 'spike' | 'normal'
  significant: boolean
  /**
   * How the comparison was chosen. `step-change`: the daily series has a
   * sustained level change, so the baseline is every day before it and the
   * comparison is every day from it. `recent-window`: no step change, so the
   * last recentDays are compared with the days before them. Optional only
   * for older fixtures.
   */
  detection?: 'step-change' | 'recent-window'
  /** First observed day at the new level for a step change, else null. */
  changeDate?: string | null
}

/** The step-change heuristic and its thresholds, returned with the report. */
export const STEP_CHANGE_RULES = {
  method: 'best-split',
  description:
    'Heuristic. The change date is the split of the daily series where the mean before and the mean after differ most, weighted by segment length. It counts as a step change only when it is sudden and sustained. Sudden: the median of up to localDays observed days after the date differs from the median of up to localDays days before it by at least minLocalShiftInStdDevs pooled within-segment standard deviations, so one unusual day is not a step and a slow trend is not a step. Sustained: the mean of every day from the date differs from the mean before it by a z-score of at least minZScore, stricter than the recent-window test because the date is chosen from the data. Otherwise the last recentDays are compared with the days before them.',
  minDaysBefore: 7,
  minDaysAfter: 3,
  localDays: 7,
  minLocalShiftInStdDevs: 2,
  minZScore: 3,
} as const

export type TrafficAnomalyDetection = typeof STEP_CHANGE_RULES & {
  recentDays: number
}

/**
 * The dates to check against Google updates (before padding): the change
 * date of the first significant step change, else the comparison window.
 */
export function changeWindow(
  anomalies: TrafficAnomaly[],
): { start: string; end: string } | undefined {
  const step = anomalies.find(
    (anomaly) =>
      anomaly.significant &&
      anomaly.detection === 'step-change' &&
      anomaly.changeDate,
  )
  if (step?.changeDate) return { start: step.changeDate, end: step.changeDate }
  const first = anomalies[0]
  return first && { start: first.comparisonStart, end: first.comparisonEnd }
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
  /**
   * The recent-window split (last recentDays against the days before). A
   * metric with a step change uses its own dates, shown on its anomaly row.
   */
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

export type TrafficAnomalySelection = {
  sourceRows: number
  invalidRows: number
  duplicateRows: number
  observedDays: number
  expectedDays: number
  missingDays: number
  baselineDays: number
  comparisonDays: number
}

export interface TrafficAnomalyReport {
  site: string
  generatedAt: string
  /** The Search Console window used. Optional only for older fixtures. */
  range?: { startDate: string; endDate: string }
  anomalies: TrafficAnomaly[]
  rows: number
  /** Row and day counts behind the anomaly test. Optional only for older fixtures. */
  selection?: TrafficAnomalySelection
  coverage?: TrafficAnomalyCoverage
  /** Detection method and thresholds. Optional only for older fixtures. */
  detection?: TrafficAnomalyDetection
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
      : `${formatPercent(change)} vs baseline${anomaly.detection === 'step-change' && anomaly.changeDate ? `, starting ${anomaly.changeDate}` : ''}`
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

export function changesInWindow(input: {
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
        : `${input.site} had no official Google Ranking update overlap around the change date or in the recent comparison window.`

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
        ? `${input.overlappingUpdates.length} official Google Ranking update ${plural(input.overlappingUpdates.length, 'window')} overlapped the change date or comparison window: ${updateNames.join(', ')}.`
        : 'No official Google Ranking update windows overlapped the change date or comparison window.',
      largeMovement
        ? 'Both clicks and impressions moved sharply in the same direction.'
        : 'Clicks and impressions did not both meet the sharp-movement evidence threshold.',
      hasConfounders
        ? `Known overlapping site changes: ${confounders.map(confounderTitle).join('; ')}.`
        : 'No saved or manually supplied overlapping site changes were found.',
    ],
    caveats: [
      `GSC window: ${input.days} days; recent comparison window: ${input.recentDays} days.`,
      `Update overlap padding: ${input.paddingDays} ${plural(input.paddingDays, 'day')} either side of the step-change date, or of the recent comparison window when no step change was found.`,
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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function sumOfSquaredDeviations(values: number[]): number {
  const average = mean(values)
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0)
}

// Finds the most likely level change in observed daily values (date order)
// and tests it against STEP_CHANGE_RULES. Linear in the number of days. Ties
// keep the earliest split, so the result does not depend on input order.
function findStepChange(
  values: number[],
): { index: number; flat: boolean } | null {
  const {
    minDaysBefore,
    minDaysAfter,
    localDays,
    minLocalShiftInStdDevs,
    minZScore,
  } = STEP_CHANGE_RULES
  const count = values.length
  if (count < minDaysBefore + minDaysAfter) return null
  const sums = [0]
  for (const value of values) sums.push((sums.at(-1) ?? 0) + value)
  const total = sums[count] ?? 0
  let index = -1
  let bestScore = 0
  for (let split = minDaysBefore; split <= count - minDaysAfter; split++) {
    const before = (sums[split] ?? 0) / split
    const after = (total - (sums[split] ?? 0)) / (count - split)
    const score =
      Math.abs(after - before) * Math.sqrt((split * (count - split)) / count)
    if (score > bestScore) {
      bestScore = score
      index = split
    }
  }
  if (index < 0) return null

  const before = values.slice(0, index)
  const after = values.slice(index)
  const shift = mean(after) - mean(before)
  const pooledStdDev = Math.sqrt(
    (sumOfSquaredDeviations(before) + sumOfSquaredDeviations(after)) / count,
  )
  if (pooledStdDev === 0) return shift === 0 ? null : { index, flat: true }
  const localShift =
    median(after.slice(0, localDays)) - median(before.slice(-localDays))
  const sudden =
    Math.abs(localShift) >= minLocalShiftInStdDevs * pooledStdDev &&
    Math.sign(localShift) === Math.sign(shift)
  const beforeStdDev = standardDeviation(before)
  const sustained =
    beforeStdDev === 0 ||
    Math.abs(shift) / (beforeStdDev / Math.sqrt(after.length)) >= minZScore
  return sudden && sustained ? { index, flat: false } : null
}

function compareSegments(input: {
  site: string
  metric: TrafficAnomaly['metric']
  baseline: number[]
  comparison: number[]
  baselineStart: string
  baselineEnd: string
  comparisonStart: string
  comparisonEnd: string
  step?: { changeDate: string; flat: boolean }
}): TrafficAnomaly {
  const baselineMean = mean(input.baseline)
  const comparisonMean = mean(input.comparison)
  const baselineTotal = input.baseline.reduce((sum, value) => sum + value, 0)
  const comparisonTotal = input.comparison.reduce(
    (sum, value) => sum + value,
    0,
  )
  const stdDev = standardDeviation(input.baseline)
  const standardError = stdDev / Math.sqrt(input.comparison.length)
  const zScore =
    standardError > 0 ? (comparisonMean - baselineMean) / standardError : null
  const outsideFlatBaseline = zScore === null && comparisonMean !== baselineMean
  const significant = input.step
    ? true
    : outsideFlatBaseline || (zScore !== null && Math.abs(zScore) >= 2)
  const direction = significant
    ? comparisonMean < baselineMean
      ? 'drop'
      : 'spike'
    : 'normal'
  const relativeChange = percentChange(baselineMean, comparisonMean)

  return {
    site: input.site,
    metric: input.metric,
    baselineStart: input.baselineStart,
    baselineEnd: input.baselineEnd,
    comparisonStart: input.comparisonStart,
    comparisonEnd: input.comparisonEnd,
    baselineMean: toFixedNumber(baselineMean),
    comparisonMean: toFixedNumber(comparisonMean),
    baselineTotal: toFixedNumber(baselineTotal),
    comparisonTotal: toFixedNumber(comparisonTotal),
    percentChange:
      relativeChange === null ? null : toFixedNumber(relativeChange),
    zScore: zScore === null ? null : toFixedNumber(zScore),
    significanceMethod: !significant
      ? 'none'
      : input.step
        ? input.step.flat
          ? 'outside-flat-baseline'
          : 'step-change'
        : outsideFlatBaseline
          ? 'outside-flat-baseline'
          : 'z-score',
    direction,
    significant,
    detection: input.step ? 'step-change' : 'recent-window',
    changeDate: input.step?.changeDate ?? null,
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
  detection: TrafficAnomalyDetection
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
  const stepCaveats: string[] = []
  const anomalies = metrics.map((metric): TrafficAnomaly => {
    const values = aggregated.rows.map((row) => row[metric])
    const step = findStepChange(values)
    const changeRow = step ? aggregated.rows[step.index] : undefined
    const changeDate = changeRow?.keys[0]
    if (step && changeDate) {
      const previousDate = aggregated.rows[step.index - 1]?.keys[0]
      const gap = previousDate ? calendarDays(previousDate, changeDate) - 2 : 0
      stepCaveats.push(
        `${formatMetric(metric)} changed level on ${changeDate}, so its baseline is every observed day before that date and its comparison is every observed day from it.`,
        ...(gap > 0
          ? [
              `The ${metric} change date follows ${gap} missing ${plural(gap, 'day')}; the change may have started on one of them.`,
            ]
          : []),
      )
      return compareSegments({
        site: input.site,
        metric,
        baseline: values.slice(0, step.index),
        comparison: values.slice(step.index),
        baselineStart: input.startDate,
        baselineEnd: shiftIsoDate(changeDate, -1),
        comparisonStart: changeDate,
        comparisonEnd: input.endDate,
        step: { changeDate, flat: step.flat },
      })
    }
    return compareSegments({
      site: input.site,
      metric,
      baseline: baselineRows.map((row) => row[metric]),
      comparison: comparisonRows.map((row) => row[metric]),
      baselineStart: input.startDate,
      baselineEnd,
      comparisonStart,
      comparisonEnd: input.endDate,
    })
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
    ...stepCaveats,
  ]

  return {
    anomalies,
    detection: { ...STEP_CHANGE_RULES, recentDays: input.recentDays },
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
