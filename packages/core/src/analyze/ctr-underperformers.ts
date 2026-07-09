import { shouldExcludeBrandQuery } from '../brand.js'
import { querySearchAnalytics } from '../gsc/client.js'
import type { GscRow } from '../types.js'
import {
  createCtrBenchmarkContext,
  roundedPosition,
} from './opportunity-primitives.js'
import { isLowActionabilityQuery } from './query-quality.js'
import { defaultDateRange } from './shared.js'

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return count === 1 ? singular : pluralLabel
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export type CtrUnderperformer = {
  query: string
  url: string
  position: number
  impressions: number
  actualCtr: number
  expectedCtr: number
  clicks: number
  expectedClicks: number
  clickShortfall: number
  benchmark: {
    expectedCtr: number
    source: string
    peerRows: number
    peerImpressions: number
    qualifiedPeerImpressions: number
    urlSamples: number
    positiveUrlSamples: number
  }
  recommendation: {
    principle: 'C.3'
    evidenceRef: string
    action: string
    effort: 'S'
    confidence: 'medium'
  }
}

export function analyzeCtrUnderperformersFromRows(input: {
  rows: GscRow[]
  site: string
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
}): {
  items: CtrUnderperformer[]
  totalClickShortfall: number
  minImpressions: number
} {
  const minImpressions = input.minImpressions ?? 200
  const benchmarkRows = input.rows.filter((row) => {
    const query = row.keys[0] ?? ''
    return (
      row.position >= 1 &&
      row.position <= 10 &&
      row.impressions > 0 &&
      !isLowActionabilityQuery(query) &&
      !shouldExcludeBrandQuery({
        query,
        siteUrl: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    )
  })
  const benchmarkContext = createCtrBenchmarkContext(benchmarkRows)

  const items = benchmarkRows
    .filter((row) => row.impressions >= minImpressions)
    .map((row): CtrUnderperformer => {
      const rounded = roundedPosition(row.position)
      const benchmark = benchmarkContext.forRow(row)
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
          evidenceRef: `Query "${row.keys[0]}" has CTR ${row.ctr.toFixed(3)} vs expected ${benchmark.ctr.toFixed(3)} at position ${rounded}, leaving about ${clickShortfall.toFixed(0)} clicks on the table.`,
          action: `This page ranks on page one for "${row.keys[0]}" but gets fewer clicks than expected. Rewrite the title and meta description to match the main search intent; do not rewrite the page body unless rankings also drop.`,
          effort: 'S',
          confidence: 'medium',
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

  return {
    items,
    totalClickShortfall: items.reduce(
      (sum, item) => sum + item.clickShortfall,
      0,
    ),
    minImpressions,
  }
}

export async function ctrUnderperformersReport(input: {
  site: string
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}) {
  const range = defaultDateRange(28)
  const { rows } = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )
  const { items, totalClickShortfall, minImpressions } =
    analyzeCtrUnderperformersFromRows({
      rows,
      site: input.site,
      minImpressions: input.minImpressions,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
    })
  const top = items[0]

  return {
    site: input.site,
    range,
    generatedAt: new Date().toISOString(),
    summary: {
      underperformers: items.length,
      estimatedClickShortfall: totalClickShortfall,
      minImpressions,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: top
        ? `${items.length} CTR ${plural(items.length, 'underperformer')} found, with about ${totalClickShortfall.toFixed(0)} estimated clicks available. Start with "${top.query}" because it has the largest click gap.`
        : 'No high-impression page-one queries are materially underperforming the expected CTR curve.',
    },
    items,
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate} (28 days), using final GSC data where available.`,
      `Brand queries: ${input.includeBrand ? 'included' : 'excluded'}.`,
      `Only queries ranking position 1-10 with at least ${minImpressions} impressions were checked.`,
      'Expected CTR uses a robust site-aware position benchmark when enough peer data exists, otherwise the fallback position curve.',
      'CTR benchmarks are directional heuristics, not promises of available clicks. Validate the search intent and SERP before editing.',
    ],
    recommendations: top
      ? [
          `Rewrite the title and meta description for "${top.query}" first. Keep the page body mostly stable unless rankings or content coverage are also weak.`,
          'Prioritise rows with high impressions, low actual CTR, and clear search intent. Avoid testing tiny queries where noise will hide the result.',
          'After changing SERP copy, annotate the change and compare the next full 28-day period before making more edits.',
        ]
      : [
          'No CTR-only action is recommended from this report. Use striking-distance or page-opportunities if you want more growth ideas.',
        ],
  }
}
