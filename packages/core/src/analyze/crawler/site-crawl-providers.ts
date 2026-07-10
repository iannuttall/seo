import type {
  PageSearchMetrics,
  PageTopQuery,
  queryPageMetrics,
  queryPagesMetrics,
  queryPagesTopQueries,
  queryPageTopQuery,
  SearchDateWindow,
  SearchPageBatch,
} from '../../gsc/client.js'
import { defaultDateRange } from '../site-diagnostics/quick-wins-report-input.js'
import type {
  fetchLandingPageValues,
  LandingPageValue,
  LandingPageValueSource,
  landingValueForUrl,
} from '../workflows/analytics-value.js'
import type {
  CrawlAnalyticsDataSource,
  CrawlDataSourceWindow,
  CrawlReport,
  CrawlSearchDataSource,
} from './report.js'

type LandingPageProvider = (
  input: Parameters<typeof fetchLandingPageValues>[0],
) => Promise<{
  values: Map<string, LandingPageValue>
  source?: LandingPageValueSource
  warning?: string
}>

type ObservedSearchBatch<T> = {
  values: Map<string, T>
  returnedRows?: number
  retainedRowLimit?: number
  retainedRowLimitReached?: boolean
}

export function crawlMetricsWindow(now: Date): CrawlDataSourceWindow {
  return { ...defaultDateRange(28, now), days: 28 }
}

export async function joinAnalytics(input: {
  propertyId: string
  pages: CrawlReport['pages']
  warnings: string[]
  limit: number
  window: CrawlDataSourceWindow
  fetchLandingPageValues: LandingPageProvider
  landingValueForUrl: typeof landingValueForUrl
}): Promise<CrawlAnalyticsDataSource> {
  let analytics: Awaited<ReturnType<LandingPageProvider>>
  try {
    analytics = await input.fetchLandingPageValues({
      propertyId: input.propertyId,
      startDate: input.window.startDate,
      endDate: input.window.endDate,
      limit: input.limit,
    })
  } catch (error) {
    const warning = `GA4 metrics unavailable: ${error instanceof Error ? error.message : String(error)}`
    input.warnings.push(warning)
    return {
      status: 'unavailable',
      window: input.window,
      totalPages: input.pages.length,
      queriedPages: input.pages.length,
      joinedPages: 0,
      retainedRowLimit: input.limit,
      warning,
    }
  }
  if (analytics.warning) {
    const warning = `GA4 metrics unavailable: ${analytics.warning}`
    input.warnings.push(warning)
    return {
      status: 'unavailable',
      window: input.window,
      totalPages: input.pages.length,
      queriedPages: input.pages.length,
      joinedPages: 0,
      returnedRows: analytics.source?.returnedRows,
      availableRows: analytics.source?.availableRows,
      retainedRowLimit: analytics.source?.retainedRowLimit ?? input.limit,
      ...(analytics.source
        ? {
            retainedRowLimitReached: analytics.source.retainedRowLimitReached,
          }
        : {}),
      warning,
    }
  }

  let joinedPages = 0
  for (const page of input.pages) {
    const value = input.landingValueForUrl(analytics.values, page.finalUrl)
    if (!value) continue
    page.analytics = value
    joinedPages += 1
  }
  const retentionKnown = Boolean(analytics.source)
  const retainedRowLimitReached = analytics.source?.retainedRowLimitReached
  const warning = !retentionKnown
    ? `GA4 metrics joined for ${joinedPages} of ${input.pages.length} crawled pages, but the provider did not expose row completeness; missing page metrics are not reliable zero-traffic evidence.`
    : retainedRowLimitReached
      ? `GA4 retained-row limit reached; missing page metrics are not reliable zero-traffic evidence.`
      : input.pages.length && joinedPages === 0
        ? 'GA4 metrics joined for 0 crawled pages.'
        : undefined
  if (warning) input.warnings.push(warning)
  return {
    status:
      !retentionKnown || retainedRowLimitReached
        ? 'partial'
        : joinedPages
          ? 'joined'
          : 'none',
    window: input.window,
    totalPages: input.pages.length,
    queriedPages: input.pages.length,
    joinedPages,
    returnedRows: analytics.source?.returnedRows,
    availableRows: analytics.source?.availableRows,
    retainedRowLimit: analytics.source?.retainedRowLimit ?? input.limit,
    ...(retainedRowLimitReached !== undefined
      ? { retainedRowLimitReached }
      : {}),
    ...(warning ? { warning } : {}),
  }
}

export async function joinSearchMetrics(input: {
  site: string
  pages: CrawlReport['pages']
  warnings: string[]
  limit: number
  window: CrawlDataSourceWindow
  queryPageMetrics: typeof queryPageMetrics
  queryPageTopQuery: typeof queryPageTopQuery
  queryPagesMetrics?: typeof queryPagesMetrics
  queryPagesTopQueries?: typeof queryPagesTopQueries
  queryPagesMetricsBatch?: (
    site: string,
    pages: string[],
    range: SearchDateWindow,
  ) => Promise<SearchPageBatch<PageSearchMetrics>>
  queryPagesTopQueriesBatch?: (
    site: string,
    pages: string[],
    range: SearchDateWindow,
  ) => Promise<SearchPageBatch<PageTopQuery>>
}): Promise<CrawlSearchDataSource> {
  const pages = [...input.pages]
    .sort((left, right) =>
      left.finalUrl < right.finalUrl
        ? -1
        : left.finalUrl > right.finalUrl
          ? 1
          : left.url < right.url
            ? -1
            : left.url > right.url
              ? 1
              : 0,
    )
    .slice(0, input.limit)
  const pageLimitReached = pages.length < input.pages.length
  const range = {
    startDate: input.window.startDate,
    endDate: input.window.endDate,
  }
  let joinedMetricPages = 0
  let joinedQueryPages = 0
  let metricBatch: ObservedSearchBatch<PageSearchMetrics> | undefined
  let queryBatch: ObservedSearchBatch<PageTopQuery> | undefined
  const retentionUnknown = Boolean(
    (input.queryPagesMetrics && !input.queryPagesMetricsBatch) ||
      (input.queryPagesTopQueries && !input.queryPagesTopQueriesBatch),
  )
  const explicitWindow = Boolean(
    input.queryPagesMetricsBatch || input.queryPagesTopQueriesBatch,
  )
  const hasBulkMetricsProvider = Boolean(
    input.queryPagesMetricsBatch || input.queryPagesMetrics,
  )
  const hasBulkQueryProvider = Boolean(
    input.queryPagesTopQueriesBatch || input.queryPagesTopQueries,
  )
  const bulkProviderIncomplete =
    (hasBulkMetricsProvider || hasBulkQueryProvider) &&
    hasBulkMetricsProvider !== hasBulkQueryProvider
  const bulkErrors: string[] = []

  try {
    if (
      input.queryPagesMetricsBatch ||
      input.queryPagesTopQueriesBatch ||
      input.queryPagesMetrics ||
      input.queryPagesTopQueries
    ) {
      const pageUrls = pages.map((page) => page.finalUrl)
      try {
        metricBatch = input.queryPagesMetricsBatch
          ? await input.queryPagesMetricsBatch(input.site, pageUrls, range)
          : input.queryPagesMetrics
            ? {
                values: await input.queryPagesMetrics(
                  input.site,
                  pageUrls,
                  input.window.days,
                ),
              }
            : undefined
      } catch (error) {
        bulkErrors.push(
          `page metrics failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      try {
        queryBatch = input.queryPagesTopQueriesBatch
          ? await input.queryPagesTopQueriesBatch(input.site, pageUrls, range)
          : input.queryPagesTopQueries
            ? {
                values: await input.queryPagesTopQueries(
                  input.site,
                  pageUrls,
                  input.window.days,
                ),
              }
            : undefined
      } catch (error) {
        bulkErrors.push(
          `top queries failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      for (const page of pages) {
        const metrics = metricBatch?.values.get(page.finalUrl)
        if (metrics) {
          page.searchMetrics = metrics
          joinedMetricPages += 1
        }
        const topQuery = queryBatch?.values.get(page.finalUrl)
        if (topQuery) {
          page.topQuery = topQuery
          joinedQueryPages += 1
        }
      }
    } else {
      for (const page of pages) {
        const metrics = await input.queryPageMetrics(
          input.site,
          page.finalUrl,
          input.window.days,
        )
        if (metrics) {
          page.searchMetrics = metrics
          joinedMetricPages += 1
        }
        const topQuery = await input.queryPageTopQuery(
          input.site,
          page.finalUrl,
          input.window.days,
        )
        if (topQuery) {
          page.topQuery = topQuery
          joinedQueryPages += 1
        }
      }
    }
  } catch (error) {
    const warning = `GSC metrics unavailable: ${error instanceof Error ? error.message : String(error)}`
    input.warnings.push(warning)
    return {
      status: joinedMetricPages || joinedQueryPages ? 'partial' : 'unavailable',
      ...(explicitWindow ? { window: input.window } : {}),
      totalPages: input.pages.length,
      queriedPages: pages.length,
      joinedMetricPages,
      joinedQueryPages,
      pageLimit: input.limit,
      pageLimitReached,
      metricRowsReturned: metricBatch?.returnedRows,
      queryRowsReturned: queryBatch?.returnedRows,
      retainedRowLimit:
        metricBatch?.retainedRowLimit ?? queryBatch?.retainedRowLimit,
      warning,
    }
  }

  if (bulkErrors.length > 0) {
    const warning = `GSC metrics partially unavailable: ${bulkErrors.join('; ')}`
    input.warnings.push(warning)
    return {
      status: joinedMetricPages || joinedQueryPages ? 'partial' : 'unavailable',
      ...(explicitWindow ? { window: input.window } : {}),
      totalPages: input.pages.length,
      queriedPages: pages.length,
      joinedMetricPages,
      joinedQueryPages,
      pageLimit: input.limit,
      pageLimitReached,
      metricRowsReturned: metricBatch?.returnedRows,
      queryRowsReturned: queryBatch?.returnedRows,
      retainedRowLimit:
        metricBatch?.retainedRowLimit ?? queryBatch?.retainedRowLimit,
      warning,
    }
  }

  const retainedRowLimitReached = Boolean(
    metricBatch?.retainedRowLimitReached || queryBatch?.retainedRowLimitReached,
  )
  const joinedPages = pages.filter(
    (page) => page.searchMetrics || page.topQuery,
  ).length
  const partial =
    pageLimitReached ||
    retainedRowLimitReached ||
    retentionUnknown ||
    bulkProviderIncomplete ||
    !explicitWindow
  const warning = bulkProviderIncomplete
    ? 'GSC provider did not supply both page metrics and top-query evidence; missing evidence is not a reliable zero.'
    : retentionUnknown && !explicitWindow
      ? 'GSC legacy provider did not expose retained-row completeness or an exact date window; missing evidence is not a reliable zero.'
      : retentionUnknown
        ? 'GSC provider did not expose retained-row completeness; missing page metrics and queries are not reliable zero-visibility evidence.'
        : !explicitWindow
          ? `GSC metrics joined for ${joinedPages} of ${pages.length} crawled pages through a legacy relative-day provider; exact queried dates are not verifiable.`
          : retainedRowLimitReached
            ? 'GSC retained-row limit reached; missing page metrics and queries are not reliable zero-visibility evidence.'
            : pageLimitReached
              ? `GSC metrics queried for ${pages.length} of ${input.pages.length} crawled pages because the page limit was reached.`
              : joinedPages < pages.length
                ? `GSC metrics joined for ${joinedPages} of ${pages.length} crawled pages.`
                : undefined
  if (warning) input.warnings.push(warning)
  return {
    status: partial
      ? 'partial'
      : joinedMetricPages || joinedQueryPages
        ? 'joined'
        : 'none',
    ...(explicitWindow ? { window: input.window } : {}),
    totalPages: input.pages.length,
    queriedPages: pages.length,
    joinedMetricPages,
    joinedQueryPages,
    pageLimit: input.limit,
    pageLimitReached,
    metricRowsReturned: metricBatch?.returnedRows,
    queryRowsReturned: queryBatch?.returnedRows,
    retainedRowLimit:
      metricBatch?.retainedRowLimit ?? queryBatch?.retainedRowLimit,
    ...(retentionUnknown ? {} : { retainedRowLimitReached }),
    ...(warning ? { warning } : {}),
  }
}
