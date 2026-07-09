import { shouldExcludeBrandQuery } from '../brand.js'
import type { GscRow } from '../types/pages.js'
import { detectPageTemplate } from './page-patterns.js'
import type {
  AnalyzeSecondPageInput,
  SecondPageAnalysis,
  SecondPageItem,
  SecondPageQuery,
  SecondPageRecommendation,
  SecondPageSelection,
} from './second-page-analysis-types.js'

export type {
  AnalyzeSecondPageInput,
  SecondPageAnalysis,
  SecondPageItem,
  SecondPageQuery,
  SecondPageRecommendation,
  SecondPageSelection,
} from './second-page-analysis-types.js'

const DEFAULT_MIN_IMPRESSIONS = 50
const MAX_MIN_IMPRESSIONS = 1_000_000_000
const DEFAULT_LIMIT = 10
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

function compareText(left: string, right: string): number {
  const leftPoints = [...left].map((character) => character.codePointAt(0) ?? 0)
  const rightPoints = [...right].map(
    (character) => character.codePointAt(0) ?? 0,
  )
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

function validRow(row: GscRow, query: string, url?: string): boolean {
  return (
    Boolean(query && url) &&
    Number.isFinite(row.clicks) &&
    Number.isFinite(row.impressions) &&
    Number.isFinite(row.ctr) &&
    Number.isFinite(row.position) &&
    row.clicks >= 0 &&
    row.impressions > 0 &&
    row.clicks <= row.impressions &&
    row.ctr >= 0 &&
    row.ctr <= 1 &&
    row.position > 0
  )
}

function queryFromRow(row: GscRow): SecondPageQuery {
  return {
    query: row.keys[0]?.trim() ?? '',
    clicks: Number(row.clicks.toFixed(3)),
    impressions: Number(row.impressions.toFixed(3)),
    ctr: Number(row.ctr.toFixed(4)),
    position: Number(row.position.toFixed(2)),
  }
}

function compareQueries(left: SecondPageQuery, right: SecondPageQuery): number {
  return (
    right.impressions - left.impressions ||
    left.position - right.position ||
    right.clicks - left.clicks ||
    compareText(left.query, right.query)
  )
}

function recommendation(input: {
  url: string
  primaryQuery: string
  impressions: number
  position: number
}): SecondPageRecommendation {
  return {
    type: 'investigate-ranking',
    confidence: 'low',
    evidence: `GSC reports ${input.impressions} eligible impressions at an impression-weighted average position of ${input.position.toFixed(2)} for ${input.url}.`,
    action: `Inspect indexability, canonical state, query coverage, competing URLs, and relevant internal links for ${input.url} before choosing a change. Start with "${input.primaryQuery}" as the highest-impression query in this page group.`,
  }
}

function pageItem(url: string, rows: GscRow[]): SecondPageItem {
  const queries = rows.map(queryFromRow).sort(compareQueries)
  const impressions = queries.reduce((sum, query) => sum + query.impressions, 0)
  const clicks = queries.reduce((sum, query) => sum + query.clicks, 0)
  const position =
    queries.reduce(
      (sum, query) => sum + query.position * query.impressions,
      0,
    ) / impressions
  const proximity = Math.min(1, Math.max(0.1, (21 - position) / 10))
  const primaryQuery = queries[0]?.query ?? ''
  const nextRecommendation = recommendation({
    url,
    primaryQuery,
    impressions,
    position,
  })

  return {
    url,
    primaryQuery,
    template: detectPageTemplate(url),
    queries,
    queryCount: queries.length,
    clicks: Number(clicks.toFixed(3)),
    impressions: Number(impressions.toFixed(3)),
    ctr: Number((clicks / impressions).toFixed(4)),
    position: Number(position.toFixed(2)),
    priority: {
      method: 'impressions_x_position_proximity',
      score: Number((impressions * proximity).toFixed(2)),
      demandImpressions: Number(impressions.toFixed(3)),
      positionProximity: Number(proximity.toFixed(4)),
      heuristic: true,
      estimatedClickLift: false,
    },
    finding: 'unverified',
    recommendation: nextRecommendation,
  }
}

function compareItems(left: SecondPageItem, right: SecondPageItem): number {
  return (
    right.priority.score - left.priority.score ||
    right.impressions - left.impressions ||
    left.position - right.position ||
    compareText(left.url, right.url)
  )
}

export function analyzeSecondPageRows(
  input: AnalyzeSecondPageInput,
): SecondPageAnalysis {
  const minImpressions = integerInRange(
    input.minImpressions,
    DEFAULT_MIN_IMPRESSIONS,
    0,
    MAX_MIN_IMPRESSIONS,
  )
  const limit = integerInRange(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
  const selection: SecondPageSelection = {
    sourceRows: input.rows.length,
    invalidRows: 0,
    outsidePositionRows: 0,
    brandRows: 0,
    eligibleRows: 0,
    sourcePages: 0,
    belowMinimumPages: 0,
    eligiblePages: 0,
    returnedPages: 0,
    limitedPages: 0,
  }
  const grouped = new Map<string, GscRow[]>()

  for (const row of input.rows) {
    const query = row.keys[0]?.trim() ?? ''
    const url = normalizedHttpUrl(row.keys[1]?.trim() ?? '')
    if (!validRow(row, query, url)) {
      selection.invalidRows++
    } else if (row.position <= 10 || row.position > 20) {
      selection.outsidePositionRows++
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
      const rows = grouped.get(url ?? '') ?? []
      rows.push({ ...row, keys: [query, url ?? ''] })
      grouped.set(url ?? '', rows)
      selection.eligibleRows++
    }
  }

  selection.sourcePages = grouped.size
  const aggregated = [...grouped.entries()].map(([url, rows]) =>
    pageItem(url, rows),
  )
  const eligibleItems = aggregated
    .filter((item) => {
      if (item.impressions >= minImpressions) return true
      selection.belowMinimumPages++
      return false
    })
    .sort(compareItems)
  const items = eligibleItems.slice(0, limit)
  selection.eligiblePages = eligibleItems.length
  selection.returnedPages = items.length
  selection.limitedPages = eligibleItems.length - items.length

  const eligibleClicks = eligibleItems.reduce(
    (sum, item) => sum + item.clicks,
    0,
  )
  const eligibleImpressions = eligibleItems.reduce(
    (sum, item) => sum + item.impressions,
    0,
  )
  const returnedClicks = items.reduce((sum, item) => sum + item.clicks, 0)
  const returnedImpressions = items.reduce(
    (sum, item) => sum + item.impressions,
    0,
  )

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
    selection,
    methodology: {
      id: 'gsc_second_page_v2',
      source: 'google_search_console_query_page_rows',
      position: {
        metric: 'gsc_average_position',
        minimumExclusive: 10,
        maximumInclusive: 20,
        appliedAt: 'query_page_row',
      },
      aggregation: {
        unit: 'page',
        minimumImpressionsAppliedAt: 'eligible_page_aggregate',
        ctr: 'sum_clicks_divided_by_sum_impressions',
        position: 'impression_weighted_query_page_position',
        queries: 'all_eligible_queries_retained',
      },
      priority: {
        method: 'impressions_x_position_proximity',
        formula:
          'page impressions * clamp((21 - weighted position) / 10, 0.1, 1)',
        heuristic: true,
        estimatedClickLift: false,
      },
    },
    provenance: {
      inputScope: 'provided_rows',
      selectionOrder: [
        'valid_row',
        'position',
        'brand',
        'page_aggregation',
        'minimum_page_impressions',
        'priority',
        'limit',
      ],
      selection,
    },
    summary: {
      eligiblePages: eligibleItems.length,
      returnedPages: items.length,
      eligibleTemplates: new Set(eligibleItems.map((item) => item.template.id))
        .size,
      returnedTemplates: new Set(items.map((item) => item.template.id)).size,
      eligibleQueries: eligibleItems.reduce(
        (sum, item) => sum + item.queryCount,
        0,
      ),
      returnedQueries: items.reduce((sum, item) => sum + item.queryCount, 0),
      eligibleClicks: Number(eligibleClicks.toFixed(3)),
      eligibleImpressions: Number(eligibleImpressions.toFixed(3)),
      returnedClicks: Number(returnedClicks.toFixed(3)),
      returnedImpressions: Number(returnedImpressions.toFixed(3)),
    },
    items,
  }
}
