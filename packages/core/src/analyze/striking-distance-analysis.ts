import { resolveReportBrandTerms } from '../brand-evidence.js'
import type { GscRow } from '../types.js'
import { collapseFragmentPageRows } from './page-fragments.js'
import {
  countQueryFlags,
  isLowActionabilityQuery,
  QUERY_FLAG_METHOD,
  queryFlags,
} from './query-quality.js'
import {
  compareStrikingDistanceItems,
  groupStrikingDistanceItems,
  isStrikingDistanceBrandRow,
  isValidStrikingDistanceRow,
  strikingDistanceItem,
} from './striking-distance-analysis-primitives.js'
import type {
  AnalyzeStrikingDistanceInput,
  StrikingDistanceAnalysis,
  StrikingDistanceSelection,
} from './striking-distance-analysis-types.js'

export type {
  AnalyzeStrikingDistanceInput,
  StrikingDistanceAnalysis,
  StrikingDistanceAnalysisGroup,
  StrikingDistanceAnalysisItem,
} from './striking-distance-analysis-types.js'

// The default minimum scales with the property's retained impressions so a
// small site is not filtered to nothing: one row in 5,000 retained
// query/page impressions, rounded up, between 10 and 100. A site with
// 500,000 or more retained impressions keeps the earlier fixed 100. This is
// a heuristic, recorded in `minImpressionsPolicy`.
export const STRIKING_DISTANCE_MIN_IMPRESSIONS_SCALE = {
  share: 0.0002,
  floor: 10,
  ceiling: 100,
  basis: 'sum_of_retained_query_page_impressions',
  heuristic: true,
} as const
const MAX_MIN_IMPRESSIONS = 1_000_000_000
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

function integerInRange(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

function scaledMinimum(basisImpressions: number): number {
  const scale = STRIKING_DISTANCE_MIN_IMPRESSIONS_SCALE
  return Math.min(
    scale.ceiling,
    Math.max(scale.floor, Math.ceil(basisImpressions * scale.share)),
  )
}

function minimumPolicy(input: {
  explicit: number | undefined
  rows: GscRow[]
}): StrikingDistanceAnalysis['minImpressionsPolicy'] {
  let basisImpressions = 0
  for (const row of input.rows) {
    if (Number.isFinite(row.impressions) && row.impressions > 0) {
      basisImpressions += row.impressions
    }
  }
  if (input.explicit !== undefined && Number.isFinite(input.explicit)) {
    return {
      effective: integerInRange(input.explicit, 0, 0, MAX_MIN_IMPRESSIONS),
      source: 'explicit',
      basisImpressions,
      scale: STRIKING_DISTANCE_MIN_IMPRESSIONS_SCALE,
    }
  }
  return {
    effective: scaledMinimum(basisImpressions),
    source: 'scaled-default',
    basisImpressions,
    scale: STRIKING_DISTANCE_MIN_IMPRESSIONS_SCALE,
  }
}

function selectRows(input: {
  rows: GscRow[]
  sourceRows: number
  fragmentRows: number
  mergedRows: number
  site: string
  minImpressions: number
  brandTerms: string[]
  includeBrand?: boolean
}): { rows: GscRow[]; selection: StrikingDistanceSelection } {
  const selection: StrikingDistanceSelection = {
    sourceRows: input.sourceRows,
    fragmentRows: input.fragmentRows,
    mergedRows: input.mergedRows,
    invalidRows: 0,
    outsidePositionRows: 0,
    belowMinimumRows: 0,
    lowActionabilityRows: 0,
    brandRows: 0,
    eligibleRows: 0,
    likelyAutomatedRows: 0,
    navigationalOtherRows: 0,
    flaggedRows: 0,
    returnedRows: 0,
    limitedRows: 0,
  }
  const rows: GscRow[] = []

  for (const row of input.rows) {
    const query = row.keys[0]?.trim() ?? ''
    const url = row.keys[1]?.trim() ?? ''
    if (!isValidStrikingDistanceRow(row, query, url)) {
      selection.invalidRows++
    } else if (row.position <= 10 || row.position > 20) {
      selection.outsidePositionRows++
    } else if (row.impressions < input.minImpressions) {
      selection.belowMinimumRows++
    } else if (isLowActionabilityQuery(query)) {
      selection.lowActionabilityRows++
    } else if (
      isStrikingDistanceBrandRow({
        query,
        site: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    ) {
      selection.brandRows++
    } else {
      rows.push(row)
      selection.eligibleRows++
    }
  }
  return { rows, selection }
}

export function analyzeStrikingDistanceRows(
  input: AnalyzeStrikingDistanceInput,
): StrikingDistanceAnalysis {
  const collapsed = collapseFragmentPageRows(input.rows, { pageKeyIndex: 1 })
  const minImpressionsPolicy = minimumPolicy({
    explicit: input.minImpressions,
    rows: collapsed.rows,
  })
  const minImpressions = minImpressionsPolicy.effective
  const limit = integerInRange(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
  const brand = resolveReportBrandTerms({
    siteUrl: input.site,
    rows: input.rows,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const selected = selectRows({
    rows: collapsed.rows,
    sourceRows: input.rows.length,
    fragmentRows: collapsed.provenance.fragmentRows,
    mergedRows: collapsed.provenance.mergedRows,
    site: input.site,
    minImpressions,
    brandTerms: brand.terms,
    includeBrand: input.includeBrand,
  })
  const eligibleItems = selected.rows
    .map((row) =>
      strikingDistanceItem(
        row,
        queryFlags(row.keys[0]?.trim() ?? '', { siteUrl: input.site }),
      ),
    )
    .sort(compareStrikingDistanceItems)
  Object.assign(selected.selection, countQueryFlags(eligibleItems))
  const items = eligibleItems.slice(0, limit)
  selected.selection.returnedRows = items.length
  selected.selection.limitedRows = eligibleItems.length - items.length
  const groups = groupStrikingDistanceItems(eligibleItems)
  const eligibleImpressions = eligibleItems.reduce(
    (sum, item) => sum + item.impressions,
    0,
  )
  const returnedImpressions = items.reduce(
    (sum, item) => sum + item.impressions,
    0,
  )
  const dataStatus =
    input.rows.length === 0
      ? 'empty'
      : eligibleItems.length === 0
        ? 'filtered'
        : 'available'

  return {
    site: input.site,
    minImpressions,
    minImpressionsPolicy,
    limit,
    dataStatus,
    brand,
    selection: selected.selection,
    methodology: {
      id: 'gsc_striking_distance_v2',
      source: 'google_search_console_query_page_rows',
      position: { minimumExclusive: 10, maximumInclusive: 20 },
      ctrEligibilityFilter: false,
      priority: {
        method: 'impressions_x_position_proximity',
        formula: 'impressions * clamp((21 - position) / 10, 0.1, 1)',
        heuristic: true,
        estimatedClickLift: false,
      },
      queryFlags: QUERY_FLAG_METHOD,
      grouping: {
        population: 'all_eligible_rows_before_limit',
        sharedTemplateMinimumUniqueUrls: 2,
        lowConfidenceTemplatesAreShared: false,
      },
    },
    provenance: {
      inputScope: 'provided_rows',
      selectionOrder: [
        'fragment_and_duplicate_merge',
        'valid_row',
        'position',
        'minimum_impressions',
        'query_quality',
        'brand',
        'query_flag_ranking',
      ],
      selection: selected.selection,
    },
    summary: {
      eligibleRows: eligibleItems.length,
      returnedRows: items.length,
      eligibleImpressions: Number(eligibleImpressions.toFixed(3)),
      returnedImpressions: Number(returnedImpressions.toFixed(3)),
      uniqueEligibleUrls: new Set(eligibleItems.map((item) => item.url)).size,
      uniqueEligibleQueries: new Set(eligibleItems.map((item) => item.query))
        .size,
      groups: groups.length,
    },
    groups,
    items,
  }
}
