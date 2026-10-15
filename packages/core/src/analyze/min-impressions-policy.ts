import type { GscRow } from '../types.js'

// One default minimum for reports that filter query/page rows by impressions.
// A fixed minimum filters a small or mid-size site to nothing, so the default
// scales with the property's retained impressions: one row in 5,000 retained
// impressions, rounded up, between a floor and a ceiling. An explicit minimum
// always wins. The scaling is a heuristic and every report records it as
// `minImpressionsPolicy`. This module is pure and Worker-safe.

export type MinImpressionsScale = {
  share: number
  floor: number
  ceiling: number
  basis: 'sum_of_retained_query_page_impressions'
  heuristic: true
}

export type MinImpressionsPolicy = {
  effective: number
  source: 'explicit' | 'scaled-default'
  basisImpressions: number
  scale: MinImpressionsScale
}

// Position reports (striking-distance) rank rows by demand and position
// only, so a small floor keeps small sites useful. A site with 500,000 or
// more retained impressions keeps the earlier fixed 100.
export const POSITION_MIN_IMPRESSIONS_SCALE = {
  share: 0.0002,
  floor: 10,
  ceiling: 100,
  basis: 'sum_of_retained_query_page_impressions',
  heuristic: true,
} as const satisfies MinImpressionsScale

// CTR reports (ctr-underperformers and quick-wins) compare a row's observed
// CTR with the site CTR curve, so the floor must give CTR a usable sample.
// At 10 impressions one click moves CTR by ten points, and a row at position
// 3 with zero clicks is flagged about a third of the time by chance. The
// floor of 30 matches the site CTR curve's own minimum URL sample
// (SITE_CTR_CURVE_METHOD.minimumUrlImpressions): a row is not judged on less
// evidence than a peer needs to count toward the benchmark. Rows near 30
// impressions are still noisy (a row exactly at a 10% expected CTR falls
// below the 0.6x low-ctr threshold about 18% of the time), which is why the
// items stay low confidence and the gap is reported as a hypothesis. The
// ceiling keeps the earlier fixed 200 for sites with 1,000,000 or more
// retained impressions.
export const CTR_MIN_IMPRESSIONS_SCALE = {
  share: 0.0002,
  floor: 30,
  ceiling: 200,
  basis: 'sum_of_retained_query_page_impressions',
  heuristic: true,
} as const satisfies MinImpressionsScale

/** Sum of finite, positive impressions across the provided rows. */
export function retainedImpressions(rows: readonly GscRow[]): number {
  let total = 0
  for (const row of rows) {
    if (Number.isFinite(row.impressions) && row.impressions > 0) {
      total += row.impressions
    }
  }
  return total
}

export function scaledMinImpressions(
  basisImpressions: number,
  scale: MinImpressionsScale,
): number {
  return Math.min(
    scale.ceiling,
    Math.max(scale.floor, Math.ceil(basisImpressions * scale.share)),
  )
}

/**
 * Resolves the minimum impressions for one report run. A finite explicit
 * value wins and is floored and clamped to the report's own bounds;
 * otherwise the default scales with the rows' retained impressions.
 */
export function resolveMinImpressionsPolicy(input: {
  explicit: number | undefined
  rows: readonly GscRow[]
  scale: MinImpressionsScale
  minimum: number
  maximum: number
}): MinImpressionsPolicy {
  const basisImpressions = retainedImpressions(input.rows)
  if (input.explicit !== undefined && Number.isFinite(input.explicit)) {
    return {
      effective: Math.min(
        input.maximum,
        Math.max(input.minimum, Math.floor(input.explicit)),
      ),
      source: 'explicit',
      basisImpressions,
      scale: input.scale,
    }
  }
  return {
    effective: scaledMinImpressions(basisImpressions, input.scale),
    source: 'scaled-default',
    basisImpressions,
    scale: input.scale,
  }
}

/** One caveat line describing the minimum a report used. */
export function minImpressionsCaveat(input: {
  policy: MinImpressionsPolicy
  belowMinimumRows: number
}): string {
  const { policy } = input
  const below = `${input.belowMinimumRows} ${input.belowMinimumRows === 1 ? 'row was' : 'rows were'} below it`
  if (policy.source === 'explicit') {
    return `Minimum impressions per query/page row: ${policy.effective} (requested); ${below}.`
  }
  const oneIn = Math.round(1 / policy.scale.share).toLocaleString('en-US')
  return `Minimum impressions per query/page row: ${policy.effective}, scaled from ${policy.basisImpressions} retained impressions (1 in ${oneIn}, between ${policy.scale.floor} and ${policy.scale.ceiling}); ${below}. This scaling is a heuristic.`
}
