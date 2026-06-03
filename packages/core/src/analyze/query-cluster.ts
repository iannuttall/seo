import { shouldExcludeBrandQuery } from '../brand.js'
import { querySearchAnalytics } from '../gsc/client.js'
import type { QueryCluster } from '../types.js'
import { isLowActionabilityQuery } from './query-quality.js'
import {
  CTR_BASELINE,
  defaultDateRange,
  jaccard,
  normalizeText,
  tokenize,
} from './shared.js'

const CLUSTER_THRESHOLD = 0.5
const MAX_TOKEN_BUCKET = 250
const MAX_TOKEN_SHARE = 0.08

export type QueryClusterRow = {
  query: string
  impressions: number
  clicks: number
  position: number
  tokens: string[]
}

type QueryClusterReport = {
  site: string
  scope?: string
  generatedAt: string
  summary: {
    clusters: number
    queries: number
    impressions: number
    clicks: number
    highOpportunityClusters: number
    brandFiltering: 'included' | 'excluded'
    verdict: string
  }
  clusters: QueryCluster[]
  caveats: string[]
  recommendations: string[]
}

function classifyIntent(query: string, brand?: string): QueryCluster['intent'] {
  const normalized = normalizeText(query)
  if (brand && normalized.includes(normalizeText(brand))) {
    return 'navigational'
  }
  if (/(buy|price|near me)/i.test(normalized)) {
    return 'transactional'
  }
  if (/(vs|review|best|top|compare)/i.test(normalized)) {
    return 'commercial'
  }
  if (/(how|what|why|guide)/i.test(normalized)) {
    return 'informational'
  }
  return 'mixed'
}

function clusterTotals(cluster: Pick<QueryCluster, 'queries'>): {
  impressions: number
  clicks: number
  averagePosition: number
  ctr: number
} {
  const totals = cluster.queries.reduce(
    (sum, query) => ({
      impressions: sum.impressions + query.impressions,
      clicks: sum.clicks + query.clicks,
      weightedPosition:
        sum.weightedPosition + query.position * query.impressions,
    }),
    { impressions: 0, clicks: 0, weightedPosition: 0 },
  )
  return {
    impressions: totals.impressions,
    clicks: totals.clicks,
    averagePosition: totals.impressions
      ? totals.weightedPosition / totals.impressions
      : 0,
    ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
  }
}

function expectedCtr(position: number): number {
  const rounded = Math.max(1, Math.min(10, Math.round(position)))
  return CTR_BASELINE[rounded] ?? 0.01
}

function opportunityScore(input: {
  queries: number
  impressions: number
  clicks: number
  ctr: number
  position: number
}): number {
  if (input.queries <= 1 || input.impressions < 50) return 0
  const expected = expectedCtr(input.position)
  const clickGap = Math.max(0, expected * input.impressions - input.clicks)
  const zeroClickBoost =
    input.clicks === 0 && input.impressions >= 100 ? 100 : 0
  const pageTwoBoost = input.position > 10 ? input.impressions * 0.03 : 0
  const weakCtrBoost =
    input.position <= 10 && input.ctr < expected * 0.6 ? clickGap : 0
  return zeroClickBoost + pageTwoBoost + weakCtrBoost
}

function clusterRecommendation(input: {
  label: string
  intent: QueryCluster['intent']
  queries: number
  impressions: number
  clicks: number
  position: number
}): string {
  if (input.queries === 1) {
    return 'This is a single-query cluster. Use it as supporting detail, not as a content hub or template decision by itself.'
  }
  if (input.impressions >= 500 && input.clicks === 0) {
    return `This "${input.label}" cluster has search demand but no clicks. Check whether the ranking page actually answers the cluster intent, then improve the section/title or create a stronger dedicated page if intent is distinct.`
  }
  if (input.position > 10) {
    return `This "${input.label}" cluster is mostly outside page one. Tighten the page section around the shared intent and add internal links from related pages before treating this as a CTR problem.`
  }
  if (input.clicks / Math.max(1, input.impressions) < 0.01) {
    return `This "${input.label}" cluster ranks with weak CTR. Rewrite SERP framing around the dominant intent (${input.intent}) before expanding content.`
  }
  return `This "${input.label}" cluster already gets clicks. Use it to refine page structure, FAQs, and internal anchors rather than creating duplicate pages.`
}

function clusterSummary(input: {
  label: string
  queries: number
  impressions: number
  clicks: number
  position: number
}): string {
  return `${input.queries} queries, ${input.impressions.toFixed(0)} impressions, ${input.clicks.toFixed(0)} clicks, average position ${input.position.toFixed(1)}.`
}

function clusterLabel(
  rows: Array<{ query: string; impressions: number }>,
): string {
  return [...rows].sort((a, b) => b.impressions - a.impressions)[0]?.query ?? ''
}

function aggregateRows(
  rows: Array<{
    query: string
    impressions: number
    clicks: number
    position: number
    tokens: string[]
  }>,
): QueryClusterRow[] {
  const byQuery = new Map<
    string,
    {
      query: string
      impressions: number
      clicks: number
      weightedPosition: number
      tokens: Set<string>
    }
  >()
  for (const row of rows) {
    const current = byQuery.get(row.query) ?? {
      query: row.query,
      impressions: 0,
      clicks: 0,
      weightedPosition: 0,
      tokens: new Set<string>(),
    }
    current.impressions += row.impressions
    current.clicks += row.clicks
    current.weightedPosition += row.position * row.impressions
    for (const token of row.tokens) current.tokens.add(token)
    byQuery.set(row.query, current)
  }
  return [...byQuery.values()].map((row) => ({
    query: row.query,
    impressions: row.impressions,
    clicks: row.clicks,
    position: row.impressions ? row.weightedPosition / row.impressions : 0,
    tokens: [...row.tokens],
  }))
}

export function clusterQueryRows(rows: QueryClusterRow[]): QueryClusterRow[][] {
  if (rows.length <= 1) return rows.map((row) => [row])

  const tokenBuckets = new Map<string, number[]>()
  for (const [index, row] of rows.entries()) {
    for (const token of row.tokens) {
      const bucket = tokenBuckets.get(token) ?? []
      bucket.push(index)
      tokenBuckets.set(token, bucket)
    }
  }

  const maxBucketSize = Math.max(
    20,
    Math.min(MAX_TOKEN_BUCKET, Math.floor(rows.length * MAX_TOKEN_SHARE)),
  )

  const assigned = new Set<number>()
  const groups: QueryClusterRow[][] = []
  const seedIds = rows
    .map((row, index) => ({ index, impressions: row.impressions }))
    .sort((a, b) => b.impressions - a.impressions)

  for (const seed of seedIds) {
    if (assigned.has(seed.index)) continue
    const seedRow = rows[seed.index]
    if (!seedRow) continue
    const candidateIds = new Set<number>()
    for (const token of seedRow.tokens) {
      const bucket = tokenBuckets.get(token)
      if (!bucket || bucket.length > maxBucketSize) continue
      for (const candidateId of bucket) {
        if (candidateId !== seed.index && !assigned.has(candidateId)) {
          candidateIds.add(candidateId)
        }
      }
    }

    const group = [seedRow]
    assigned.add(seed.index)
    for (const candidateId of candidateIds) {
      const candidate = rows[candidateId]
      if (!candidate) continue
      if (jaccard(seedRow.tokens, candidate.tokens) >= CLUSTER_THRESHOLD) {
        group.push(candidate)
        assigned.add(candidateId)
      }
    }
    groups.push(group)
  }
  return groups
}

function reportVerdict(input: {
  clusters: QueryCluster[]
  highOpportunityClusters: number
}): string {
  if (!input.clusters.length) {
    return 'No query clusters were generated for this scope.'
  }
  if (input.highOpportunityClusters > 0) {
    return `${input.highOpportunityClusters} cluster(s) have enough demand and weak enough performance to review first.`
  }
  return 'No obvious high-opportunity clusters were found. Use this report for content structure and intent mapping rather than urgent fixes.'
}

export async function queryClusterReport(input: {
  site: string
  scope?: string
  brand?: string
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}): Promise<QueryClusterReport> {
  const range = defaultDateRange(28)
  const filters = input.scope
    ? [
        {
          groupType: 'and' as const,
          filters: [
            {
              dimension: 'page',
              operator: 'contains' as const,
              expression: input.scope,
            },
          ],
        },
      ]
    : undefined
  const { rows } = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
      dimensionFilterGroups: filters,
    },
    { refresh: input.refresh },
  )

  const queryRows = aggregateRows(
    rows
      .map((row) => ({
        query: row.keys[0] ?? '',
        impressions: row.impressions,
        clicks: row.clicks,
        position: row.position,
        tokens: tokenize(row.keys[0] ?? ''),
      }))
      .filter(
        (row) =>
          row.query &&
          !isLowActionabilityQuery(row.query) &&
          !shouldExcludeBrandQuery({
            query: row.query,
            siteUrl: input.site,
            brandTerms:
              input.brandTerms ?? (input.brand ? [input.brand] : undefined),
            includeBrand: input.includeBrand,
          }),
      ),
  )
  const clusters: QueryCluster[] = []

  for (const clusterRows of clusterQueryRows(queryRows)) {
    const label = clusterLabel(clusterRows)
    const intents = new Set(
      clusterRows.map((row) => classifyIntent(row.query, input.brand)),
    )
    const [intent] = intents

    const totals = clusterTotals({ queries: clusterRows })
    clusters.push({
      label,
      intent: intents.size === 1 && intent ? intent : 'mixed',
      queries: clusterRows.map((row) => ({
        query: row.query,
        impressions: row.impressions,
        clicks: row.clicks,
        position: row.position,
      })),
      totals,
      opportunityScore: opportunityScore({
        queries: clusterRows.length,
        impressions: totals.impressions,
        clicks: totals.clicks,
        ctr: totals.ctr,
        position: totals.averagePosition,
      }),
      summary: clusterSummary({
        label,
        queries: clusterRows.length,
        impressions: totals.impressions,
        clicks: totals.clicks,
        position: totals.averagePosition,
      }),
      recommendation: clusterRecommendation({
        label,
        intent: intents.size === 1 && intent ? intent : 'mixed',
        queries: clusterRows.length,
        impressions: totals.impressions,
        clicks: totals.clicks,
        position: totals.averagePosition,
      }),
    })
  }

  const sortedClusters = clusters.sort((a, b) => {
    const leftScore = b.opportunityScore ?? 0
    const rightScore = a.opportunityScore ?? 0
    if (leftScore !== rightScore) return leftScore - rightScore
    const leftImpressions = b.totals?.impressions ?? 0
    const rightImpressions = a.totals?.impressions ?? 0
    if (leftImpressions !== rightImpressions) {
      return leftImpressions - rightImpressions
    }
    return b.queries.length - a.queries.length
  })
  const totals = sortedClusters.reduce(
    (sum, cluster) => ({
      queries: sum.queries + cluster.queries.length,
      impressions: sum.impressions + (cluster.totals?.impressions ?? 0),
      clicks: sum.clicks + (cluster.totals?.clicks ?? 0),
    }),
    { queries: 0, impressions: 0, clicks: 0 },
  )
  const highOpportunityClusters = sortedClusters.filter((cluster) => {
    const clusterTotal = cluster.totals
    if (!clusterTotal) return false
    return (
      (cluster.opportunityScore ?? 0) > 0 &&
      cluster.queries.length > 1 &&
      clusterTotal.impressions >= 100
    )
  }).length

  return {
    site: input.site,
    scope: input.scope,
    generatedAt: new Date().toISOString(),
    summary: {
      clusters: sortedClusters.length,
      queries: totals.queries,
      impressions: totals.impressions,
      clicks: totals.clicks,
      highOpportunityClusters,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: reportVerdict({
        clusters: sortedClusters,
        highOpportunityClusters,
      }),
    },
    clusters: sortedClusters,
    caveats: [
      'Date window: last 28 day(s), using final GSC data where available.',
      input.scope
        ? `Scope: only pages containing "${input.scope}" were included.`
        : 'Scope: all pages in the selected GSC property were included.',
      input.brand
        ? `Brand filtering: ${input.includeBrand ? 'brand queries included' : `brand queries excluded using ${input.brandTerms?.length ? input.brandTerms.join(', ') : input.brand}`}.`
        : 'Brand intent detection used only query language because no brand term was supplied.',
      'Clusters are token-overlap groups. Review the top queries before creating, merging, or deleting pages.',
    ],
    recommendations: sortedClusters
      .filter((cluster) => cluster.recommendation)
      .slice(0, 5)
      .map((cluster) => cluster.recommendation ?? ''),
  }
}
