import type {
  queryPageMetrics,
  queryPagesMetrics,
  queryPagesMetricsBatch,
  queryPagesTopQueries,
  queryPagesTopQueriesBatch,
  queryPageTopQuery,
} from '../../gsc/client.js'
import type {
  fetchLandingPageValues,
  landingValueForUrl,
} from '../workflows/analytics-value.js'
import type { CrawlReport, CrawlReportDataSources } from './report.js'
import {
  crawlMetricsWindow,
  joinAnalytics,
  joinSearchMetrics,
} from './site-crawl-providers.js'

export function crawlProviderLimits(input: {
  searchMetricsLimit?: number
  analyticsLimit?: number
}): { searchMetricsLimit: number; analyticsLimit: number } {
  const normalize = (
    value: number | undefined,
    fallback: number,
    label: string,
  ): number => {
    const limit = value ?? fallback
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`${label} must be a positive whole number.`)
    }
    return limit
  }
  return {
    searchMetricsLimit: normalize(
      input.searchMetricsLimit,
      5000,
      'searchMetricsLimit',
    ),
    analyticsLimit: normalize(input.analyticsLimit, 5000, 'analyticsLimit'),
  }
}

export async function crawlDataSources(input: {
  cancelled: boolean
  site?: string
  ga4PropertyId?: string
  pages: CrawlReport['pages']
  warnings: string[]
  searchMetricsLimit: number
  analyticsLimit: number
  now: () => Date
  queryPageMetrics: typeof queryPageMetrics
  queryPageTopQuery: typeof queryPageTopQuery
  queryPagesMetrics?: typeof queryPagesMetrics
  queryPagesTopQueries?: typeof queryPagesTopQueries
  queryPagesMetricsBatch?: typeof queryPagesMetricsBatch
  queryPagesTopQueriesBatch?: typeof queryPagesTopQueriesBatch
  fetchLandingPageValues: typeof fetchLandingPageValues
  landingValueForUrl: typeof landingValueForUrl
}): Promise<CrawlReportDataSources> {
  const window = crawlMetricsWindow(input.now())
  const dataSources: CrawlReportDataSources = {
    searchConsole: {
      status: 'skipped',
      totalPages: input.pages.length,
      queriedPages: 0,
      joinedMetricPages: 0,
      joinedQueryPages: 0,
      pageLimit: input.searchMetricsLimit,
      pageLimitReached: false,
      retainedRowLimitReached: false,
      warning: input.cancelled
        ? 'Search Console join skipped because the crawl was cancelled.'
        : 'Search Console join skipped because no property was selected.',
    },
    analytics: {
      status: 'skipped',
      totalPages: input.pages.length,
      queriedPages: 0,
      joinedPages: 0,
      retainedRowLimit: input.analyticsLimit,
      retainedRowLimitReached: false,
      warning: input.cancelled
        ? 'GA4 join skipped because the crawl was cancelled.'
        : 'GA4 join skipped because no property was selected.',
    },
  }

  if (!input.cancelled && input.site) {
    dataSources.searchConsole = await joinSearchMetrics({
      site: input.site,
      pages: input.pages,
      warnings: input.warnings,
      limit: input.searchMetricsLimit,
      window,
      queryPageMetrics: input.queryPageMetrics,
      queryPageTopQuery: input.queryPageTopQuery,
      queryPagesMetrics: input.queryPagesMetrics,
      queryPagesTopQueries: input.queryPagesTopQueries,
      queryPagesMetricsBatch: input.queryPagesMetricsBatch,
      queryPagesTopQueriesBatch: input.queryPagesTopQueriesBatch,
    })
  }
  if (!input.cancelled && input.ga4PropertyId) {
    dataSources.analytics = await joinAnalytics({
      propertyId: input.ga4PropertyId,
      pages: input.pages,
      warnings: input.warnings,
      limit: input.analyticsLimit,
      window,
      fetchLandingPageValues: input.fetchLandingPageValues,
      landingValueForUrl: input.landingValueForUrl,
    })
  }
  return dataSources
}
