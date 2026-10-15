import type { GscRow } from '../types.js'

// Search Console can report `/page#section` as its own page row (jump links
// and sitelinks). For page-level review that row belongs to `/page`. This
// helper strips the fragment and merges rows that then share every key.
// Merged clicks and impressions are sums, so one search that showed both
// URLs counts twice, as it does in any by-page total.

export type FragmentCollapseProvenance = {
  method: 'strip_fragment_sum_clicks_impressions_weighted_position_v1'
  pageKeyIndex: number
  sourceRows: number
  /** Source rows whose page key carried a #fragment. */
  fragmentRows: number
  /** Source rows absorbed into another row after the fragment was removed. */
  mergedRows: number
  /** Rows passed through unchanged because the page key or metrics were unusable. */
  passthroughRows: number
  outputRows: number
}

export type FragmentCollapseResult = {
  rows: GscRow[]
  provenance: FragmentCollapseProvenance
}

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

// Only rows with valid Search Console metrics are merged. Anything else
// passes through unchanged so the report's own validation still counts it.
function usableMetrics(row: GscRow): boolean {
  return (
    Number.isFinite(row.clicks) &&
    Number.isFinite(row.impressions) &&
    Number.isFinite(row.ctr) &&
    Number.isFinite(row.position) &&
    row.clicks >= 0 &&
    row.impressions > 0 &&
    row.clicks <= row.impressions &&
    row.ctr >= 0 &&
    row.ctr <= 1 &&
    row.position >= 1
  )
}

/** Removes a `#fragment` from a page URL string. */
export function stripPageFragment(page: string): string {
  const index = page.indexOf('#')
  return index === -1 ? page : page.slice(0, index)
}

/**
 * Collapses `#fragment` page URLs into their base URL and merges duplicate
 * rows: clicks and impressions are summed, position is impression-weighted
 * and CTR is recomputed. Rows that need no merge keep their original values.
 * Output is ordered by keys (codepoint order), so input order never changes
 * the result. Pure and Worker-safe.
 */
export function collapseFragmentPageRows(
  rows: GscRow[],
  options: { pageKeyIndex?: number } = {},
): FragmentCollapseResult {
  const pageKeyIndex = options.pageKeyIndex ?? 1
  const groups = new Map<
    string,
    {
      keys: string[]
      first: GscRow
      clicks: number
      impressions: number
      weightedPosition: number
      count: number
    }
  >()
  const passthrough: GscRow[] = []
  let fragmentRows = 0

  for (const row of rows) {
    const page = row.keys?.[pageKeyIndex]
    if (typeof page !== 'string' || !usableMetrics(row)) {
      passthrough.push(row)
      continue
    }
    const base = stripPageFragment(page)
    if (base !== page) fragmentRows++
    const keys = [...row.keys]
    keys[pageKeyIndex] = base
    const key = keys.join('\u0000')
    const group = groups.get(key)
    if (group) {
      group.clicks += row.clicks
      group.impressions += row.impressions
      group.weightedPosition += row.position * row.impressions
      group.count++
    } else {
      groups.set(key, {
        keys,
        first: row,
        clicks: row.clicks,
        impressions: row.impressions,
        weightedPosition: row.position * row.impressions,
        count: 1,
      })
    }
  }

  const merged = [...groups.entries()]
    .sort(([left], [right]) => compareCodepoints(left, right))
    .map(([, group]): GscRow => {
      if (group.count === 1) {
        return group.first.keys[pageKeyIndex] === group.keys[pageKeyIndex]
          ? group.first
          : { ...group.first, keys: group.keys }
      }
      return {
        keys: group.keys,
        clicks: group.clicks,
        impressions: group.impressions,
        ctr: group.clicks / group.impressions,
        position: Number(
          (group.weightedPosition / group.impressions).toFixed(6),
        ),
      }
    })
  const output = [...merged, ...passthrough]

  return {
    rows: output,
    provenance: {
      method: 'strip_fragment_sum_clicks_impressions_weighted_position_v1',
      pageKeyIndex,
      sourceRows: rows.length,
      fragmentRows,
      mergedRows: rows.length - output.length,
      passthroughRows: passthrough.length,
      outputRows: output.length,
    },
  }
}
