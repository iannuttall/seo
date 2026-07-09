import { shouldExcludeBrandQuery } from '../../brand.js'
import type { GscRow } from '../../types.js'
import {
  createCtrBenchmarkContext,
  type PositionBenchmark,
  queryOpportunityRecommendation,
  roundedPosition,
} from '../opportunity-primitives.js'
import { detectPageTemplate } from '../page-patterns.js'
import { isLowActionabilityQuery } from '../query-quality.js'
import type { QuickWinItem } from './types.js'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function benchmarkDetails(benchmark: PositionBenchmark) {
  return {
    expectedCtr: benchmark.ctr,
    source: benchmark.source,
    peerRows: benchmark.rows,
    peerImpressions: benchmark.impressions,
    qualifiedPeerImpressions: benchmark.qualifiedImpressions,
    urlSamples: benchmark.urlSamples,
    positiveUrlSamples: benchmark.positiveUrlSamples,
  }
}

function isBenchmarkRow(input: {
  row: GscRow
  site: string
  brandTerms?: string[]
  includeBrand?: boolean
}): boolean {
  const query = input.row.keys[0] ?? ''
  return (
    input.row.keys.length >= 2 &&
    input.row.position >= 1 &&
    input.row.position <= 10 &&
    input.row.impressions > 0 &&
    !isLowActionabilityQuery(query) &&
    !shouldExcludeBrandQuery({
      query,
      siteUrl: input.site,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
    })
  )
}

export function analyzeQuickWinsFromRows(input: {
  rows: GscRow[]
  site: string
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
}): {
  items: QuickWinItem[]
  minImpressions: number
  benchmarkRows: number
  benchmarkByPosition: Record<string, PositionBenchmark>
} {
  const minImpressions = input.minImpressions ?? 200
  const benchmarkRows = input.rows.filter((row) =>
    isBenchmarkRow({
      row,
      site: input.site,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
    }),
  )
  const benchmarkContext = createCtrBenchmarkContext(benchmarkRows)

  const items = benchmarkRows
    .filter(
      (row) =>
        row.position >= 4 &&
        row.position <= 10 &&
        row.impressions >= minImpressions,
    )
    .map((row): QuickWinItem | undefined => {
      const benchmark = benchmarkContext.forRow(row)
      if (row.ctr >= benchmark.ctr) return undefined

      const query = row.keys[0] ?? ''
      const url = row.keys[1] ?? ''
      const rounded = roundedPosition(row.position)
      const estimatedClickLift = Number(
        (Math.max(0, benchmark.ctr - row.ctr) * row.impressions).toFixed(2),
      )
      const opportunity = queryOpportunityRecommendation({
        query,
        position: row.position,
        ctr: row.ctr,
        expectedCtr: benchmark.ctr,
        estimatedClickLift,
      })

      return {
        query,
        url,
        template: detectPageTemplate(url),
        position: row.position,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        expectedCtr: benchmark.ctr,
        benchmark: benchmarkDetails(benchmark),
        estimatedClickLift,
        recommendation: {
          principle: 'C.3',
          evidenceRef: `Query "${query}" sits at position ${rounded} with ${row.impressions} impressions and CTR ${row.ctr.toFixed(3)} versus benchmark ${benchmark.ctr.toFixed(3)}.`,
          action: `${opportunity.title} Match the title, meta description, and visible heading to the search intent before adding more body copy.`,
          effort: 'S',
          confidence: benchmark.source.startsWith('site_gsc_')
            ? 'medium'
            : 'low',
          impactEstimate: opportunity.expectedImpact,
        },
      }
    })
    .filter((item): item is QuickWinItem => item !== undefined)
    .sort(
      (left, right) =>
        right.estimatedClickLift - left.estimatedClickLift ||
        compareText(left.query, right.query) ||
        compareText(left.url, right.url),
    )

  return {
    items,
    minImpressions,
    benchmarkRows: benchmarkRows.length,
    benchmarkByPosition: benchmarkContext.byPosition,
  }
}
