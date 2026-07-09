import type { GscRow } from '../types.js'
import { isLowActionabilityQuery } from './query-quality.js'
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

const DEFAULT_MIN_IMPRESSIONS = 100
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

function selectRows(input: {
  rows: GscRow[]
  site: string
  minImpressions: number
  brandTerms?: string[]
  includeBrand?: boolean
}): { rows: GscRow[]; selection: StrikingDistanceSelection } {
  const selection: StrikingDistanceSelection = {
    sourceRows: input.rows.length,
    invalidRows: 0,
    outsidePositionRows: 0,
    belowMinimumRows: 0,
    lowActionabilityRows: 0,
    brandRows: 0,
    eligibleRows: 0,
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
  const minImpressions = integerInRange(
    input.minImpressions,
    DEFAULT_MIN_IMPRESSIONS,
    0,
    MAX_MIN_IMPRESSIONS,
  )
  const limit = integerInRange(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
  const selected = selectRows({ ...input, minImpressions })
  const eligibleItems = selected.rows
    .map(strikingDistanceItem)
    .sort(compareStrikingDistanceItems)
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
    limit,
    dataStatus,
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
      grouping: {
        population: 'all_eligible_rows_before_limit',
        sharedTemplateMinimumUniqueUrls: 2,
        lowConfidenceTemplatesAreShared: false,
      },
    },
    provenance: {
      inputScope: 'provided_rows',
      selectionOrder: [
        'valid_row',
        'position',
        'minimum_impressions',
        'query_quality',
        'brand',
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
