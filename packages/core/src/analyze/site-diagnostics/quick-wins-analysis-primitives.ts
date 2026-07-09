import { shouldExcludeBrandQuery } from '../../brand.js'
import type { GscRow } from '../../types.js'
import type { PositionBenchmark } from '../opportunity-primitives.js'
import { detectPageTemplate } from '../page-patterns.js'
import { isLowActionabilityQuery } from '../query-quality.js'
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

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function validRow(row: GscRow, query: string, url: string): boolean {
  return (
    row.keys.length >= 2 &&
    Boolean(query) &&
    validHttpUrl(url) &&
    Number.isFinite(row.clicks) &&
    row.clicks >= 0 &&
    Number.isFinite(row.impressions) &&
    row.impressions > 0 &&
    row.clicks <= row.impressions &&
    Number.isFinite(row.ctr) &&
    row.ctr >= 0 &&
    row.ctr <= 1 &&
    Number.isFinite(row.position) &&
    row.position >= 1
  )
}

export function selectBenchmarkRows(input: AnalyzeQuickWinsInput): {
  rows: GscRow[]
  selection: QuickWinSelection
} {
  const selection: QuickWinSelection = {
    sourceRows: input.rows.length,
    invalidRows: 0,
    outsideBenchmarkPositionRows: 0,
    lowActionabilityRows: 0,
    brandRows: 0,
    benchmarkRows: 0,
    outsideCandidatePositionRows: 0,
    belowMinimumRows: 0,
    atOrAboveTargetRows: 0,
    eligibleRows: 0,
    returnedRows: 0,
    limitedRows: 0,
  }
  const rows: GscRow[] = []

  for (const row of input.rows) {
    const query = row.keys[0]?.trim() ?? ''
    const url = row.keys[1]?.trim() ?? ''
    if (!validRow(row, query, url)) {
      selection.invalidRows++
    } else if (row.position > 10) {
      selection.outsideBenchmarkPositionRows++
    } else if (isLowActionabilityQuery(query)) {
      selection.lowActionabilityRows++
    } else if (
      shouldExcludeBrandQuery({
        query,
        siteUrl: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    ) {
      selection.brandRows++
    } else {
      rows.push({ ...row, keys: [query, url] })
      selection.benchmarkRows++
    }
  }

  return { rows, selection }
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
    right.estimatedCtrClickShortfall - left.estimatedCtrClickShortfall ||
    right.impressions - left.impressions ||
    compareText(left.query, right.query) ||
    compareText(left.url, right.url)
  )
}

export function roundedSum(values: number[]): number {
  return Number(values.reduce((sum, value) => sum + value, 0).toFixed(2))
}
