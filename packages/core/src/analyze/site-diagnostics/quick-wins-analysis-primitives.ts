import type { GscRow } from '../../types.js'
import type { PositionBenchmark } from '../opportunity-primitives.js'
import { detectPageTemplate } from '../page-patterns.js'
import { compareQueryFlags, type QueryFlag } from '../query-quality.js'
import {
  prepareQueryPageRows,
  selectSiteCtrCurveRows,
} from '../site-ctr-curve.js'
import type {
  AnalyzeQuickWinsInput,
  QuickWinBenchmark,
  QuickWinItem,
  QuickWinSelection,
} from './quick-wins-types.js'

export function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

export function selectBenchmarkRows(
  input: AnalyzeQuickWinsInput,
  brandTerms: string[],
): {
  rows: GscRow[]
  selection: QuickWinSelection
} {
  const prepared = prepareQueryPageRows(input.rows)
  const curveRows = selectSiteCtrCurveRows({
    rows: prepared.rows,
    site: input.site,
    brandTerms,
    includeBrand: input.includeBrand,
  })
  const selection: QuickWinSelection = {
    sourceRows: prepared.sourceRows,
    invalidRows: prepared.invalidRows,
    fragmentRows: prepared.fragment.fragmentRows,
    duplicateRows: prepared.duplicateRows,
    aggregatedRows: prepared.aggregatedRows,
    outsideBenchmarkPositionRows: curveRows.outsidePageOneRows,
    lowActionabilityRows: curveRows.lowActionabilityRows,
    brandRows: curveRows.brandRows,
    benchmarkRows: curveRows.rows.length,
    outsideCandidatePositionRows: 0,
    belowMinimumRows: 0,
    atOrAboveTargetRows: 0,
    eligibleRows: 0,
    likelyAutomatedRows: 0,
    navigationalOtherRows: 0,
    flaggedRows: 0,
    returnedRows: 0,
    limitedRows: 0,
  }
  return { rows: curveRows.rows, selection }
}

function benchmarkDetails(input: {
  benchmark: PositionBenchmark
  excludedTargetRows: number
}): QuickWinBenchmark {
  return {
    targetCtr: input.benchmark.ctr,
    source: input.benchmark.source,
    samplePopulation: 'all_qualified_url_samples',
    peerRows: input.benchmark.rows,
    peerImpressions: input.benchmark.impressions,
    qualifiedPeerImpressions: input.benchmark.qualifiedImpressions,
    urlSamples: input.benchmark.urlSamples,
    positiveUrlSamples: input.benchmark.positiveUrlSamples,
    excludedTargetRows: input.excludedTargetRows,
    leaveOut: 'target_url',
    confidence: input.benchmark.source.startsWith('site_gsc_')
      ? 'site-data'
      : 'fallback',
    heuristic: true,
  }
}

export function quickWinItem(input: {
  row: GscRow
  benchmark: PositionBenchmark
  excludedTargetRows: number
  queryFlags: QueryFlag[]
}): QuickWinItem {
  const query = input.row.keys[0] ?? ''
  const url = input.row.keys[1] ?? ''
  const estimatedCtrClickShortfall = Number(
    (
      Math.max(0, input.benchmark.ctr - input.row.ctr) * input.row.impressions
    ).toFixed(2),
  )
  const benchmark = benchmarkDetails({
    benchmark: input.benchmark,
    excludedTargetRows: input.excludedTargetRows,
  })

  return {
    query,
    url,
    template: detectPageTemplate(url),
    position: input.row.position,
    clicks: input.row.clicks,
    impressions: input.row.impressions,
    ctr: input.row.ctr,
    targetCtr: input.benchmark.ctr,
    benchmark,
    queryFlags: input.queryFlags,
    estimatedCtrClickShortfall,
    priority: {
      method: 'impressions_x_target_ctr_shortfall',
      score: estimatedCtrClickShortfall,
      heuristic: true,
      estimatedClickLift: false,
    },
    finding: 'ctr-target-shortfall',
    recommendation: {
      principle: 'C.3',
      evidenceRef: `GSC average position is ${input.row.position.toFixed(1)} with ${input.row.impressions} impressions and CTR ${input.row.ctr.toFixed(4)} versus a heuristic target of ${input.benchmark.ctr.toFixed(4)} from ${benchmark.source}.`,
      action:
        'Inspect the live search result, query intent, title, snippet, device/country mix, and page evidence before choosing an edit.',
      effort: 'S',
      confidence: 'low',
      impactEstimate: `${estimatedCtrClickShortfall.toFixed(2)} calculated CTR click shortfall in this window if observed CTR matched the heuristic target; this is not a traffic forecast.`,
    },
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function compareQuickWinItems(
  left: QuickWinItem,
  right: QuickWinItem,
): number {
  return (
    compareQueryFlags(left.queryFlags, right.queryFlags) ||
    right.estimatedCtrClickShortfall - left.estimatedCtrClickShortfall ||
    right.impressions - left.impressions ||
    compareText(left.query, right.query) ||
    compareText(left.url, right.url)
  )
}

export function roundedSum(values: number[]): number {
  return Number(values.reduce((sum, value) => sum + value, 0).toFixed(2))
}
