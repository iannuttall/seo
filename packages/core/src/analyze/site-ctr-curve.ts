import { shouldExcludeBrandQuery } from '../brand.js'
import type { GscRow } from '../types.js'
import { createCtrBenchmarkContext } from './opportunity-primitives.js'
import {
  collapseFragmentPageRows,
  type FragmentCollapseProvenance,
} from './page-fragments.js'
import { isLowActionabilityQuery } from './query-quality.js'
import { CTR_BASELINE } from './shared.js'

// One site CTR curve for the CTR reports. quick-wins and ctr-underperformers
// prepare rows, choose benchmark rows and build the curve with this module,
// so the same row at the same position gets the same expected CTR in both.
//
// The two reports split page one by average position so they do not repeat
// each other:
// - ctr-underperformers: average position below 4. The row is already near
//   the top, so the open question is the title, snippet and result features.
// - quick-wins: average position 4 to 10. The row is on page one but below
//   the top results, so a CTR shortfall there is a near-top gain to review.
// striking-distance and second-page cover positions above 10 through 20.

export const SITE_CTR_CURVE_FALLBACK_SOURCE = 'builtin_position_ctr_curve_v1'
export const SITE_CTR_CURVE_BENCHMARK_MAX_POSITION = 10
export const CTR_SPLIT_POSITION = 4

export const SITE_CTR_CURVE_METHOD = {
  method: 'position_bucket_url_p75_v2',
  samplePopulation: 'all_qualified_url_samples',
  benchmarkPositions: { minimumInclusive: 1, maximumInclusive: 10 },
  leaveOut: 'target_url',
  minimumUrlImpressions: 30,
  minimumQualifiedImpressions: 1000,
  minimumUrlSamples: 5,
  minimumPositiveUrlSamples: 3,
  fallback: {
    id: 'seo_builtin_position_ctr',
    version: 1,
    kind: 'built_in_heuristic',
    curve: Object.fromEntries(
      Object.entries(CTR_BASELINE).map(([position, ctr]) => [position, ctr]),
    ) as Record<string, number>,
  },
  sharedWith: ['quick-wins', 'ctr-underperformers'],
  heuristic: true,
} as const

export type PreparedQueryPageRows = {
  rows: GscRow[]
  sourceRows: number
  invalidRows: number
  validRows: number
  /** Valid rows merged into another row with the same query and base URL. */
  duplicateRows: number
  aggregatedRows: number
  fragment: FragmentCollapseProvenance
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
    row.position >= 1
  )
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Validates query/page rows, collapses #fragment URLs, and aggregates rows
 * that share a normalized query and URL (summed clicks and impressions,
 * impression-weighted position, recomputed CTR). Output order is by key.
 */
export function prepareQueryPageRows(rows: GscRow[]): PreparedQueryPageRows {
  const collapsed = collapseFragmentPageRows(rows, { pageKeyIndex: 1 })
  const groups = new Map<
    string,
    {
      query: string
      url: string
      first: GscRow
      clicks: number
      impressions: number
      weightedPosition: number
      count: number
    }
  >()
  let invalidRows = 0
  for (const row of collapsed.rows) {
    const query = row.keys?.[0]?.trim() ?? ''
    const url = normalizedHttpUrl(row.keys?.[1]?.trim() ?? '')
    if (row.keys?.length !== 2 || !query || !url || !validMetrics(row)) {
      invalidRows++
      continue
    }
    const key = `${normalizedQuery(query)}\u0000${url}`
    const group = groups.get(key)
    if (group) {
      if (compareText(query, group.query) < 0) group.query = query
      group.clicks += row.clicks
      group.impressions += row.impressions
      group.weightedPosition += row.position * row.impressions
      group.count++
    } else {
      groups.set(key, {
        query,
        url,
        first: row,
        clicks: row.clicks,
        impressions: row.impressions,
        weightedPosition: row.position * row.impressions,
        count: 1,
      })
    }
  }
  const prepared = [...groups.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(
      ([, group]): GscRow =>
        group.count === 1
          ? { ...group.first, keys: [group.query, group.url] }
          : {
              keys: [group.query, group.url],
              clicks: group.clicks,
              impressions: group.impressions,
              ctr: group.clicks / group.impressions,
              position: Number(
                (group.weightedPosition / group.impressions).toFixed(6),
              ),
            },
    )
  const validCollapsedRows = collapsed.rows.length - invalidRows
  return {
    rows: prepared,
    sourceRows: rows.length,
    invalidRows,
    validRows: rows.length - invalidRows,
    duplicateRows:
      collapsed.provenance.mergedRows + (validCollapsedRows - prepared.length),
    aggregatedRows: prepared.length,
    fragment: collapsed.provenance,
  }
}

export type SiteCtrCurveRowSelection = {
  rows: GscRow[]
  outsidePageOneRows: number
  lowActionabilityRows: number
  brandRows: number
}

/**
 * The benchmark population: prepared rows at average position 1 to 10 that
 * are actionable and not brand queries.
 */
export function selectSiteCtrCurveRows(input: {
  rows: GscRow[]
  site: string
  brandTerms: string[]
  includeBrand?: boolean
}): SiteCtrCurveRowSelection {
  const selection: SiteCtrCurveRowSelection = {
    rows: [],
    outsidePageOneRows: 0,
    lowActionabilityRows: 0,
    brandRows: 0,
  }
  for (const row of input.rows) {
    const query = row.keys[0] ?? ''
    if (row.position > SITE_CTR_CURVE_BENCHMARK_MAX_POSITION) {
      selection.outsidePageOneRows++
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
      selection.rows.push(row)
    }
  }
  return selection
}

/** The site CTR curve shared by quick-wins and ctr-underperformers. */
export function createSiteCtrCurve(rows: GscRow[]) {
  return createCtrBenchmarkContext(rows, {
    samplePopulation: 'all_qualified_url_samples',
    fallbackSource: SITE_CTR_CURVE_FALLBACK_SOURCE,
  })
}
