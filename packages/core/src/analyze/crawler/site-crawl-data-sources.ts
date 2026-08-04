import type {
  queryPageMetrics,
  queryPagesMetrics,
  queryPagesMetricsBatch,
  queryPagesTopQueries,
  queryPagesTopQueriesBatch,
  queryPageTopQuery,
} from '../../gsc/client.js'
import type { AnalyticsConnection } from '../../types.js'
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
  skipReason?: 'cancelled' | 'memory-pressure'
  site?: string
  googleAnalyticsPropertyId?: string
  analyticsConnection?: AnalyticsConnection
  pages: CrawlReport['pages']
  warnings: string[]
  searchMetricsLimit: number
  analyticsLimit: number
  refresh?: boolean
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
  const skippedForMemory = input.skipReason === 'memory-pressure'
  const analyticsConnection =
    input.analyticsConnection ??
    (input.googleAnalyticsPropertyId
      ? ({
          provider: 'google',
          propertyId: input.googleAnalyticsPropertyId,
        } as const)
      : undefined)
  const analyticsLabel =
    analyticsConnection?.provider === 'clicky'
      ? 'Clicky'
      : analyticsConnection?.provider === 'google'
        ? 'Google Analytics'
        : 'Analytics'
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
      warning: skippedForMemory
        ? 'Search Console join skipped after the local memory safety limit was reached.'
        : input.skipReason === 'cancelled'
          ? 'Search Console join skipped because the crawl was cancelled.'
          : 'Search Console join skipped because no property was selected.',
    },
    analytics: {
      status: 'skipped',
      provider: analyticsConnection?.provider,
      observedMetrics: [],
      totalPages: input.pages.length,
      queriedPages: 0,
      joinedPages: 0,
      retainedRowLimit: input.analyticsLimit,
      retainedRowLimitReached: false,
      warning: skippedForMemory
        ? `${analyticsLabel} join skipped after the local memory safety limit was reached.`
        : input.skipReason === 'cancelled'
          ? `${analyticsLabel} join skipped because the crawl was cancelled.`
          : 'Analytics join skipped because no connection was selected.',
    },
  }

  if (!input.skipReason && input.site) {
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
  if (!input.skipReason && analyticsConnection) {
    dataSources.analytics = await joinAnalytics({
      connection: analyticsConnection,
      legacyGooglePropertyInput:
        !input.analyticsConnection && Boolean(input.googleAnalyticsPropertyId),
      pages: input.pages,
      warnings: input.warnings,
      limit: input.analyticsLimit,
      refresh: input.refresh,
      window,
      fetchLandingPageValues: input.fetchLandingPageValues,
      landingValueForUrl: input.landingValueForUrl,
    })
  }
  return dataSources
}
