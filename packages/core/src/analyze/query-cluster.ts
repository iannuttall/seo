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
import { integerOption } from './site-diagnostics/quick-wins-report-input.js'

export { analyzeQueryClustersFromRows } from './query-cluster-analysis.js'
export {
  clusterQueryRows,
  type QueryClusterPage,
  type QueryClusterRow,
  queryClusterTokens,
} from './query-cluster-primitives.js'

export type QueryClusterReport = {
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

export type QueryClusterSourceRow = Awaited<
  ReturnType<typeof querySearchAnalytics>
>['rows'][number]

function* retainedQueryClusterRows(input: {
  rows: QueryClusterSourceRow[]
  site: string
  brand?: string
  brandTerms?: string[]
  includeBrand?: boolean
}) {
  for (const row of input.rows) {
    const query = row.keys[0] ?? ''
    if (
      !query ||
      isLowActionabilityQuery(query) ||
      shouldExcludeBrandQuery({
        query,
        siteUrl: input.site,
        brandTerms:
          input.brandTerms ?? (input.brand ? [input.brand] : undefined),
        includeBrand: input.includeBrand,
      })
    ) {
      continue
    }
    yield {
      query,
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.position,
      tokens: queryClusterTokens(query),
      page: row.keys[1] ?? '',
    }
  }
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
  days?: number
  scope?: string
  brand?: string
  brandTerms?: string[]
  includeBrand?: boolean
  minImpressions?: number
  limit?: number
  refresh?: boolean
}): Promise<QueryClusterReport> {
  const days = integerOption({
    value: input.days,
    fallback: 28,
    minimum: 1,
    maximum: 548,
    label: 'days',
  })
  const range = defaultDateRange(days)
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

  return buildQueryClusterReportFromRows({
    ...input,
    days,
    range,
    generatedAt: new Date().toISOString(),
    rows,
  })
}

export function buildQueryClusterReportFromRows(input: {
  site: string
  days: number
  range: { startDate: string; endDate: string }
  generatedAt: string
  rows: QueryClusterSourceRow[]
  scope?: string
  brand?: string
  brandTerms?: string[]
  includeBrand?: boolean
  minImpressions?: number
  limit?: number
}): QueryClusterReport {
  const queryRows = aggregateQueryClusterRows(
    retainedQueryClusterRows({
      rows: input.rows,
      site: input.site,
      brand: input.brand,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
    }),
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
    range: input.range,
    generatedAt: input.generatedAt,
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
      `Date window: ${input.range.startDate} to ${input.range.endDate} (${input.days} days), using final GSC data where available.`,
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
