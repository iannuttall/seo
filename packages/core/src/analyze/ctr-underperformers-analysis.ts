import { shouldExcludeBrandQuery } from '../brand.js'
import type { GscRow } from '../types.js'
import type {
  CtrUnderperformer,
  CtrUnderperformerSelection,
} from './ctr-underperformers-types.js'
import {
  createCtrBenchmarkContext,
  roundedPosition,
} from './opportunity-primitives.js'
import { isLowActionabilityQuery } from './query-quality.js'

export const CTR_DEFAULT_MIN_IMPRESSIONS = 200
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

function normalizedQuery(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizedHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function validMetrics(row: GscRow): boolean {
  return (
    Number.isFinite(row.clicks) &&
    row.clicks >= 0 &&
    Number.isFinite(row.impressions) &&
    row.impressions > 0 &&
    row.clicks <= row.impressions &&
    Number.isFinite(row.ctr) &&
    row.ctr >= 0 &&
    row.ctr <= 1 &&
    Number.isFinite(row.position) &&
    row.position > 0
  )
}

type AggregatedCtrRow = GscRow & { sourceRows: number }

function aggregateCtrRows(
  rows: GscRow[],
  selection: CtrUnderperformerSelection,
): AggregatedCtrRow[] {
  const groups = new Map<
    string,
    {
      query: string
      url: string
      clicks: number
      impressions: number
      weightedPosition: number
      sourceRows: number
    }
  >()

  for (const row of rows) {
    const query = row.keys[0]?.trim() ?? ''
    const url = normalizedHttpUrl(row.keys[1]?.trim() ?? '')
    if (row.keys.length !== 2 || !query || !url || !validMetrics(row)) {
      selection.invalidRows++
      continue
    }
    selection.validRows++
    const key = `${normalizedQuery(query)}\u0000${url}`
    const group = groups.get(key) ?? {
      query,
      url,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      sourceRows: 0,
    }
    if (compareText(query, group.query) < 0) group.query = query
    group.clicks += row.clicks
    group.impressions += row.impressions
    group.weightedPosition += row.position * row.impressions
    group.sourceRows++
    groups.set(key, group)
  }

  const aggregated = [...groups.values()].map(
    (group): AggregatedCtrRow => ({
      keys: [group.query, group.url],
      clicks: group.clicks,
      impressions: group.impressions,
      ctr: group.clicks / group.impressions,
      position: group.weightedPosition / group.impressions,
      sourceRows: group.sourceRows,
    }),
  )
  selection.duplicateRows = aggregated.reduce(
    (count, row) => count + row.sourceRows - 1,
    0,
  )
  selection.aggregatedRows = aggregated.length
  return aggregated
}

function initialSelection(sourceRows: number): CtrUnderperformerSelection {
  return {
    sourceRows,
    invalidRows: 0,
    validRows: 0,
    duplicateRows: 0,
    aggregatedRows: 0,
    outsidePageOneRows: 0,
    lowActionabilityRows: 0,
    brandRows: 0,
    benchmarkRows: 0,
    belowMinimumRows: 0,
    evaluatedRows: 0,
    eligibleUnderperformers: 0,
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
  limit: number
  selection: CtrUnderperformerSelection
} {
  const minImpressions = boundedInteger(
    input.minImpressions,
    CTR_DEFAULT_MIN_IMPRESSIONS,
    1,
    CTR_MAX_MIN_IMPRESSIONS,
  )
  const limit = boundedInteger(input.limit, CTR_DEFAULT_LIMIT, 1, CTR_MAX_LIMIT)
  const selection = initialSelection(input.rows.length)
  const aggregatedRows = aggregateCtrRows(input.rows, selection)
  const benchmarkRows = aggregatedRows.filter((row) => {
    const query = row.keys[0] ?? ''
    if (row.position < 1 || row.position > 10) {
      selection.outsidePageOneRows++
      return false
    }
    if (isLowActionabilityQuery(query)) {
      selection.lowActionabilityRows++
      return false
    }
    if (
      shouldExcludeBrandQuery({
        query,
        siteUrl: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    ) {
      selection.brandRows++
      return false
    }
    return true
  })
  selection.benchmarkRows = benchmarkRows.length
  const benchmarkContext = createCtrBenchmarkContext(benchmarkRows)

  const evaluatedRows = benchmarkRows.filter((row) => {
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
        right.clickShortfall - left.clickShortfall ||
        compareText(left.query, right.query) ||
        compareText(left.url, right.url),
    )
  const items = eligibleItems.slice(0, limit)
  selection.eligibleUnderperformers = eligibleItems.length
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
    limit,
    selection,
  }
}
