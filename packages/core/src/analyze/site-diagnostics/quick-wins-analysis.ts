import { resolveReportBrandTerms } from '../../brand-evidence.js'
import {
  countQueryFlags,
  QUERY_FLAG_METHOD,
  queryFlags,
} from '../query-quality.js'
import {
  CTR_SPLIT_POSITION,
  createSiteCtrCurve,
  SITE_CTR_CURVE_METHOD,
} from '../site-ctr-curve.js'
import {
  boundedInteger,
  compareQuickWinItems,
  quickWinItem,
  roundedSum,
  selectBenchmarkRows,
} from './quick-wins-analysis-primitives.js'
import type {
  AnalyzeQuickWinsInput,
  QuickWinAnalysis,
  QuickWinItem,
} from './quick-wins-types.js'

export type {
  AnalyzeQuickWinsInput,
  QuickWinAnalysis,
  QuickWinItem,
  QuickWinSelection,
} from './quick-wins-types.js'

const DEFAULT_MIN_IMPRESSIONS = 200
const MAX_MIN_IMPRESSIONS = 1_000_000_000
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

export function analyzeQuickWinsFromRows(
  input: AnalyzeQuickWinsInput,
): QuickWinAnalysis {
  const minImpressions = boundedInteger(
    input.minImpressions,
    DEFAULT_MIN_IMPRESSIONS,
    0,
    MAX_MIN_IMPRESSIONS,
  )
  const limit = boundedInteger(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
  const brand = resolveReportBrandTerms({
    siteUrl: input.site,
    rows: input.rows,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const selected = selectBenchmarkRows(input, brand.terms)
  const benchmarkContext = createSiteCtrCurve(selected.rows)
  const eligibleItems: QuickWinItem[] = []

  for (const row of selected.rows) {
    if (row.position < CTR_SPLIT_POSITION) {
      selected.selection.outsideCandidatePositionRows++
      continue
    }
    if (row.impressions < minImpressions) {
      selected.selection.belowMinimumRows++
      continue
    }
    const excludedTargetRows = benchmarkContext.urlRowCount(row)
    const benchmark = benchmarkContext.forUrl(row)
    if (row.ctr >= benchmark.ctr) {
      selected.selection.atOrAboveTargetRows++
      continue
    }
    eligibleItems.push(
      quickWinItem({
        row,
        benchmark,
        excludedTargetRows,
        queryFlags: queryFlags(row.keys[0] ?? '', { siteUrl: input.site }),
      }),
    )
    selected.selection.eligibleRows++
  }
  Object.assign(selected.selection, countQueryFlags(eligibleItems))

  eligibleItems.sort(compareQuickWinItems)
  const items = eligibleItems.slice(0, limit)
  selected.selection.returnedRows = items.length
  selected.selection.limitedRows = eligibleItems.length - items.length

  return {
    site: input.site,
    minImpressions,
    limit,
    dataStatus:
      input.rows.length === 0
        ? 'empty'
        : eligibleItems.length === 0
          ? 'filtered'
          : 'available',
    selection: selected.selection,
    methodology: {
      id: 'gsc_quick_wins_v2',
      source: 'google_search_console_query_page_rows',
      position: {
        metric: 'gsc_average_position',
        minimumInclusive: 4,
        maximumInclusive: 10,
      },
      benchmark: SITE_CTR_CURVE_METHOD,
      priority: {
        method: 'impressions_x_target_ctr_shortfall',
        formula: 'impressions * max(0, target CTR - observed CTR)',
        heuristic: true,
        estimatedClickLift: false,
      },
      queryFlags: QUERY_FLAG_METHOD,
    },
    brand,
    provenance: {
      inputScope: 'provided_rows',
      selectionOrder: [
        'valid_row',
        'fragment_and_duplicate_merge',
        'benchmark_position',
        'query_quality',
        'brand',
        'candidate_position',
        'minimum_impressions',
        'target_ctr_shortfall',
        'query_flag_ranking',
        'limit',
      ],
      selection: selected.selection,
    },
    summary: {
      eligibleRows: eligibleItems.length,
      returnedRows: items.length,
      eligibleImpressions: roundedSum(
        eligibleItems.map((item) => item.impressions),
      ),
      returnedImpressions: roundedSum(items.map((item) => item.impressions)),
      eligibleEstimatedCtrClickShortfall: roundedSum(
        eligibleItems.map((item) => item.estimatedCtrClickShortfall),
      ),
      returnedEstimatedCtrClickShortfall: roundedSum(
        items.map((item) => item.estimatedCtrClickShortfall),
      ),
      uniqueEligibleUrls: new Set(eligibleItems.map((item) => item.url)).size,
      uniqueEligibleQueries: new Set(eligibleItems.map((item) => item.query))
        .size,
    },
    items,
    eligibleItems,
    benchmarkByPosition: benchmarkContext.byPosition,
  }
}
