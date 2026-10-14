import {
  type ReportBrandTerms,
  resolveReportBrandTerms,
} from '../brand-evidence.js'
import type { GscRow } from '../types.js'
import type {
  CtrUnderperformer,
  CtrUnderperformerSelection,
} from './ctr-underperformers-types.js'
import {
  CTR_MIN_IMPRESSIONS_SCALE,
  type MinImpressionsPolicy,
  resolveMinImpressionsPolicy,
} from './min-impressions-policy.js'
import {
  type PositionBenchmark,
  roundedPosition,
} from './opportunity-primitives.js'
import {
  compareQueryFlags,
  countQueryFlags,
  queryFlags,
} from './query-quality.js'
import {
  CTR_SPLIT_POSITION,
  createSiteCtrCurve,
  prepareQueryPageRows,
  selectSiteCtrCurveRows,
} from './site-ctr-curve.js'

export const CTR_MAX_MIN_IMPRESSIONS = 1_000_000_000
export const CTR_DEFAULT_LIMIT = 25
export const CTR_MAX_LIMIT = 100

function compareText(left: string, right: string): number {
  const leftPoints = [...left].map((value) => value.codePointAt(0) ?? 0)
  const rightPoints = [...right].map((value) => value.codePointAt(0) ?? 0)
  for (
    let index = 0;
    index < Math.min(leftPoints.length, rightPoints.length);
    index++
  ) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0)
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

function initialSelection(sourceRows: number): CtrUnderperformerSelection {
  return {
    sourceRows,
    invalidRows: 0,
    validRows: 0,
    fragmentRows: 0,
    duplicateRows: 0,
    aggregatedRows: 0,
    outsidePageOneRows: 0,
    lowActionabilityRows: 0,
    brandRows: 0,
    benchmarkRows: 0,
    outsideCandidatePositionRows: 0,
    belowMinimumRows: 0,
    evaluatedRows: 0,
    eligibleUnderperformers: 0,
    likelyAutomatedRows: 0,
    navigationalOtherRows: 0,
    flaggedRows: 0,
    returnedUnderperformers: 0,
    limitedUnderperformers: 0,
  }
}

export function analyzeCtrUnderperformersFromRows(input: {
  rows: GscRow[]
  site: string
  minImpressions?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
}): {
  items: CtrUnderperformer[]
  totalClickShortfall: number
  returnedClickShortfall: number
  minImpressions: number
  minImpressionsPolicy: MinImpressionsPolicy
  limit: number
  selection: CtrUnderperformerSelection
  brand: ReportBrandTerms
  benchmarkByPosition: Record<string, PositionBenchmark>
} {
  const minImpressionsPolicy = resolveMinImpressionsPolicy({
    explicit: input.minImpressions,
    rows: input.rows,
    scale: CTR_MIN_IMPRESSIONS_SCALE,
    minimum: 1,
    maximum: CTR_MAX_MIN_IMPRESSIONS,
  })
  const minImpressions = minImpressionsPolicy.effective
  const limit = boundedInteger(input.limit, CTR_DEFAULT_LIMIT, 1, CTR_MAX_LIMIT)
  const selection = initialSelection(input.rows.length)
  const brand = resolveReportBrandTerms({
    siteUrl: input.site,
    rows: input.rows,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const prepared = prepareQueryPageRows(input.rows)
  selection.invalidRows = prepared.invalidRows
  selection.validRows = prepared.validRows
  selection.fragmentRows = prepared.fragment.fragmentRows
  selection.duplicateRows = prepared.duplicateRows
  selection.aggregatedRows = prepared.aggregatedRows
  const curveRows = selectSiteCtrCurveRows({
    rows: prepared.rows,
    site: input.site,
    brandTerms: brand.terms,
    includeBrand: input.includeBrand,
  })
  selection.outsidePageOneRows = curveRows.outsidePageOneRows
  selection.lowActionabilityRows = curveRows.lowActionabilityRows
  selection.brandRows = curveRows.brandRows
  const benchmarkRows = curveRows.rows
  selection.benchmarkRows = benchmarkRows.length
  const benchmarkContext = createSiteCtrCurve(benchmarkRows)

  const evaluatedRows = benchmarkRows.filter((row) => {
    if (row.position >= CTR_SPLIT_POSITION) {
      selection.outsideCandidatePositionRows++
      return false
    }
    if (row.impressions < minImpressions) {
      selection.belowMinimumRows++
      return false
    }
    return true
  })
  selection.evaluatedRows = evaluatedRows.length
  const eligibleItems = evaluatedRows
    .map((row): CtrUnderperformer => {
      const rounded = roundedPosition(row.position)
      const benchmark = benchmarkContext.forUrl(row)
      const expectedClicks = benchmark.ctr * row.impressions
      const clickShortfall = Math.max(0, expectedClicks - row.clicks)

      return {
        query: row.keys[0] ?? '',
        url: row.keys[1] ?? '',
        position: row.position,
        impressions: row.impressions,
        actualCtr: row.ctr,
        expectedCtr: benchmark.ctr,
        clicks: row.clicks,
        expectedClicks,
        clickShortfall,
        queryFlags: queryFlags(row.keys[0] ?? '', { siteUrl: input.site }),
        benchmark: {
          expectedCtr: benchmark.ctr,
          source: benchmark.source,
          peerRows: benchmark.rows,
          peerImpressions: benchmark.impressions,
          qualifiedPeerImpressions: benchmark.qualifiedImpressions,
          urlSamples: benchmark.urlSamples,
          positiveUrlSamples: benchmark.positiveUrlSamples,
        },
        recommendation: {
          principle: 'C.3',
          evidenceRef: `Query "${row.keys[0]}" has observed CTR ${row.ctr.toFixed(3)} versus a heuristic ${benchmark.ctr.toFixed(3)} benchmark at average position ${rounded}, producing a calculated ${clickShortfall.toFixed(0)}-click shortfall for this window.`,
          action: `Review the live SERP, query intent, displayed snippet, title, and meta description for "${row.keys[0]}". Test SERP copy only when that review finds a mismatch; the CTR gap alone does not identify the cause.`,
          effort: 'S',
          confidence: 'low',
        },
      }
    })
    .filter((item) => item.actualCtr < item.expectedCtr * 0.6)
    .sort(
      (left, right) =>
        compareQueryFlags(left.queryFlags, right.queryFlags) ||
        right.clickShortfall - left.clickShortfall ||
        compareText(left.query, right.query) ||
        compareText(left.url, right.url),
    )
  const items = eligibleItems.slice(0, limit)
  selection.eligibleUnderperformers = eligibleItems.length
  Object.assign(selection, countQueryFlags(eligibleItems))
  selection.returnedUnderperformers = items.length
  selection.limitedUnderperformers = eligibleItems.length - items.length

  return {
    items,
    totalClickShortfall: eligibleItems.reduce(
      (sum, item) => sum + item.clickShortfall,
      0,
    ),
    returnedClickShortfall: items.reduce(
      (sum, item) => sum + item.clickShortfall,
      0,
    ),
    minImpressions,
    minImpressionsPolicy,
    limit,
    selection,
    brand,
    benchmarkByPosition: benchmarkContext.byPosition,
  }
}
