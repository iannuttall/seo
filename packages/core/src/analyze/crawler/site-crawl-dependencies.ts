import { totalmem } from 'node:os'
import { publicHttpFetch } from '../../fetch/http-client.js'
import {
  queryPageMetrics,
  queryPagesMetrics,
  queryPagesMetricsBatch,
  queryPagesTopQueries,
  queryPagesTopQueriesBatch,
  queryPageTopQuery,
} from '../../gsc/client.js'
import { crawlOne, crawlStatusOnly } from '../monitoring/crawl-page.js'
import { fetchSitemapUrls } from '../monitoring/sitemaps.js'
import {
  fetchLandingPageValues,
  landingValueForUrl,
} from '../workflows/analytics-value.js'
import { collectAgentDiscovery } from './agent-discovery.js'

export type ResolvedCrawlSiteDependencies = {
  fetchPage: typeof crawlOne
  fetchStatusPage: typeof crawlStatusOnly
  fetchSitemapUrls: typeof fetchSitemapUrls
  fetch: typeof publicHttpFetch
  queryPageMetrics: typeof queryPageMetrics
  queryPageTopQuery: typeof queryPageTopQuery
  queryPagesMetrics?: typeof queryPagesMetrics
  queryPagesTopQueries?: typeof queryPagesTopQueries
  queryPagesMetricsBatch?: typeof queryPagesMetricsBatch
  queryPagesTopQueriesBatch?: typeof queryPagesTopQueriesBatch
  fetchLandingPageValues: typeof fetchLandingPageValues
  landingValueForUrl: typeof landingValueForUrl
  collectAgentDiscovery: typeof collectAgentDiscovery
  now: () => Date
  memoryUsage: () => Pick<NodeJS.MemoryUsage, 'rss'>
  totalMemory: () => number
}

export type CrawlSiteDependencies = Partial<ResolvedCrawlSiteDependencies>

export function resolveCrawlSiteDependencies(
  dependencies: CrawlSiteDependencies = {},
): ResolvedCrawlSiteDependencies {
  const hasInjectedPerPageSearchProvider = Boolean(
    dependencies.queryPageMetrics || dependencies.queryPageTopQuery,
  )
  const hasInjectedLegacyBulkSearchProvider = Boolean(
    dependencies.queryPagesMetrics || dependencies.queryPagesTopQueries,
  )
  const hasInjectedBatchSearchProvider = Boolean(
    dependencies.queryPagesMetricsBatch ||
      dependencies.queryPagesTopQueriesBatch,
  )
  const injectedMode = hasInjectedBatchSearchProvider
    ? 'batch'
    : hasInjectedLegacyBulkSearchProvider
      ? 'legacy-bulk'
      : hasInjectedPerPageSearchProvider
        ? 'per-page'
        : undefined
  const emptyPageMetrics: typeof queryPageMetrics = async () => undefined
  const emptyPageTopQuery: typeof queryPageTopQuery = async () => undefined
  return {
    fetchPage: dependencies.fetchPage ?? crawlOne,
    fetchStatusPage: dependencies.fetchStatusPage ?? crawlStatusOnly,
    fetchSitemapUrls: dependencies.fetchSitemapUrls ?? fetchSitemapUrls,
    fetch: dependencies.fetch ?? publicHttpFetch,
    queryPageMetrics:
      (injectedMode === 'per-page'
        ? dependencies.queryPageMetrics
        : undefined) ?? (injectedMode ? emptyPageMetrics : queryPageMetrics),
    queryPageTopQuery:
      (injectedMode === 'per-page'
        ? dependencies.queryPageTopQuery
        : undefined) ?? (injectedMode ? emptyPageTopQuery : queryPageTopQuery),
    queryPagesMetrics:
      injectedMode === 'legacy-bulk'
        ? dependencies.queryPagesMetrics
        : injectedMode
          ? undefined
          : queryPagesMetrics,
    queryPagesTopQueries:
      injectedMode === 'legacy-bulk'
        ? dependencies.queryPagesTopQueries
        : injectedMode
          ? undefined
          : queryPagesTopQueries,
    queryPagesMetricsBatch:
      injectedMode === 'batch'
        ? dependencies.queryPagesMetricsBatch
        : injectedMode
          ? undefined
          : queryPagesMetricsBatch,
    queryPagesTopQueriesBatch:
      injectedMode === 'batch'
        ? dependencies.queryPagesTopQueriesBatch
        : injectedMode
          ? undefined
          : queryPagesTopQueriesBatch,
    fetchLandingPageValues:
      dependencies.fetchLandingPageValues ?? fetchLandingPageValues,
    landingValueForUrl: dependencies.landingValueForUrl ?? landingValueForUrl,
    collectAgentDiscovery:
      dependencies.collectAgentDiscovery ?? collectAgentDiscovery,
    now: dependencies.now ?? (() => new Date()),
    memoryUsage: dependencies.memoryUsage ?? (() => process.memoryUsage()),
    totalMemory: dependencies.totalMemory ?? totalmem,
  }
}
