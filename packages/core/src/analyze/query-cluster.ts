import { shouldExcludeBrandQuery } from '../brand.js'
import { querySearchAnalytics } from '../gsc/client.js'
import type { QueryCluster } from '../types.js'
import { analyzeQueryClustersFromRows } from './query-cluster-analysis.js'
import {
  aggregateQueryClusterRows,
  queryClusterTokens,
} from './query-cluster-primitives.js'
import { isLowActionabilityQuery } from './query-quality.js'
import { defaultDateRange } from './shared.js'

export { analyzeQueryClustersFromRows } from './query-cluster-analysis.js'
export {
  clusterQueryRows,
  type QueryClusterPage,
  type QueryClusterRow,
  queryClusterTokens,
} from './query-cluster-primitives.js'

type QueryClusterReport = {
  site: string
  scope?: string
  range: { startDate: string; endDate: string }
  generatedAt: string
  summary: {
    clusters: number
    queries: number
    impressions: number
    clicks: number
    highOpportunityClusters: number
    minImpressions: number
    limit: number
    brandFiltering: 'included' | 'excluded'
    verdict: string
  }
  clusters: QueryCluster[]
  caveats: string[]
  recommendations: string[]
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return count === 1 ? singular : pluralLabel
}

function reportVerdict(input: {
  clusters: QueryCluster[]
  highOpportunityClusters: number
}): string {
  if (!input.clusters.length) {
    return 'No query clusters were generated for this scope.'
  }
  if (input.highOpportunityClusters > 0) {
    const verb = input.highOpportunityClusters === 1 ? 'has' : 'have'
    return `${input.highOpportunityClusters} ${plural(input.highOpportunityClusters, 'cluster')} ${verb} enough demand and weak enough performance to review first.`
  }
  return 'No obvious high-opportunity clusters were found. Use this report for content structure and intent mapping rather than urgent fixes.'
}

export async function queryClusterReport(input: {
  site: string
  scope?: string
  brand?: string
  brandTerms?: string[]
  includeBrand?: boolean
  minImpressions?: number
  limit?: number
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

  const queryRows = aggregateQueryClusterRows(
    rows
      .map((row) => ({
        query: row.keys[0] ?? '',
        impressions: row.impressions,
        clicks: row.clicks,
        position: row.position,
        tokens: queryClusterTokens(row.keys[0] ?? ''),
        page: row.keys[1] ?? '',
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
  const { clusters, totals, highOpportunityClusters, minImpressions, limit } =
    analyzeQueryClustersFromRows({
      rows: queryRows,
      brand: input.brand,
      minImpressions: input.minImpressions,
      limit: input.limit,
    })

  return {
    site: input.site,
    scope: input.scope,
    range,
    generatedAt: new Date().toISOString(),
    summary: {
      clusters: clusters.length,
      queries: totals.queries,
      impressions: totals.impressions,
      clicks: totals.clicks,
      highOpportunityClusters,
      minImpressions,
      limit,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: reportVerdict({
        clusters,
        highOpportunityClusters,
      }),
    },
    clusters,
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate} (28 days), using final GSC data where available.`,
      input.scope
        ? `Scope: only pages containing "${input.scope}" were included.`
        : 'Scope: all pages in the selected GSC property were included.',
      input.brand
        ? `Brand filtering: ${input.includeBrand ? 'brand queries included' : `brand queries excluded using ${input.brandTerms?.length ? input.brandTerms.join(', ') : input.brand}`}.`
        : 'Brand intent detection used only query language because no brand term was supplied.',
      'Clusters are token-overlap groups. Review the top queries before creating, merging, or deleting pages.',
      `Query threshold: at least ${minImpressions} impressions per query; low-volume singletons are omitted and output is capped at ${limit} clusters.`,
      'Expected CTR is a heuristic using a leave-cluster-out site benchmark when enough peer URL data exists, otherwise the default position curve. Page-two clusters do not claim CTR-only click lift.',
    ],
    recommendations: clusters
      .filter((cluster) => cluster.recommendation)
      .slice(0, 5)
      .map((cluster) => cluster.recommendation ?? ''),
  }
}
