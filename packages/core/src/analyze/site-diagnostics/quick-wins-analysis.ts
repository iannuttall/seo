import { createCtrBenchmarkContext } from '../opportunity-primitives.js'
import { samePageUrl } from '../page-technical-signals.js'
import { CTR_BASELINE } from '../shared.js'
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
const FALLBACK_SOURCE = 'builtin_position_ctr_curve_v1'

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
  const selected = selectBenchmarkRows(input)
  const benchmarkContext = createCtrBenchmarkContext(selected.rows, {
    samplePopulation: 'all_qualified_url_samples',
    fallbackSource: FALLBACK_SOURCE,
  })
  const eligibleItems: QuickWinItem[] = []

  for (const row of selected.rows) {
    if (row.position < 4) {
      selected.selection.outsideCandidatePositionRows++
      continue
    }
    if (row.impressions < minImpressions) {
      selected.selection.belowMinimumRows++
      continue
    }
    const targetUrl = row.keys[1] ?? ''
    const excludedTargetRows = selected.rows.filter((candidate) =>
      samePageUrl(candidate.keys[1] ?? '', targetUrl),
    ).length
    const benchmark = benchmarkContext.forUrl(row)
    if (row.ctr >= benchmark.ctr) {
      selected.selection.atOrAboveTargetRows++
      continue
    }
    eligibleItems.push(quickWinItem({ row, benchmark, excludedTargetRows }))
    selected.selection.eligibleRows++
  }

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
      benchmark: {
        method: 'position_bucket_url_p75_v2',
        samplePopulation: 'all_qualified_url_samples',
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
            Object.entries(CTR_BASELINE).map(([position, ctr]) => [
              position,
              ctr,
            ]),
          ),
        },
        heuristic: true,
      },
      priority: {
        method: 'impressions_x_target_ctr_shortfall',
        formula: 'impressions * max(0, target CTR - observed CTR)',
        heuristic: true,
        estimatedClickLift: false,
      },
    },
    provenance: {
      inputScope: 'provided_rows',
      selectionOrder: [
        'valid_row',
        'benchmark_position',
        'query_quality',
        'brand',
        'candidate_position',
        'minimum_impressions',
        'target_ctr_shortfall',
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
