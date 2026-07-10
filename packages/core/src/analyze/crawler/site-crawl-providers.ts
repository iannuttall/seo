import type {
  queryPageMetrics,
  queryPagesMetrics,
  queryPagesTopQueries,
  queryPageTopQuery,
} from '../../gsc/client.js'
import type {
  fetchLandingPageValues,
  landingValueForUrl,
} from '../workflows/analytics-value.js'
import type { CrawlReport } from './report.js'

export async function joinAnalytics(input: {
  propertyId: string
  pages: CrawlReport['pages']
  warnings: string[]
  limit: number
  fetchLandingPageValues: typeof fetchLandingPageValues
  landingValueForUrl: typeof landingValueForUrl
  now: () => Date
}): Promise<void> {
  const endDate = input.now()
  endDate.setUTCDate(endDate.getUTCDate() - 4)
  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - 27)

  const analytics = await input.fetchLandingPageValues({
    propertyId: input.propertyId,
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    limit: input.limit,
  })
  if (analytics.warning) {
    input.warnings.push(`GA4 metrics skipped: ${analytics.warning}`)
    return
  }

  let joined = 0
  for (const page of input.pages) {
    const value = input.landingValueForUrl(analytics.values, page.finalUrl)
    if (!value) continue
    page.analytics = value
    joined += 1
  }
  if (input.pages.length && joined === 0) {
    input.warnings.push('GA4 metrics joined for 0 crawled pages.')
  }
}

export async function joinSearchMetrics(input: {
  site: string
  pages: CrawlReport['pages']
  warnings: string[]
  limit: number
  queryPageMetrics: typeof queryPageMetrics
  queryPageTopQuery: typeof queryPageTopQuery
  queryPagesMetrics?: typeof queryPagesMetrics
  queryPagesTopQueries?: typeof queryPagesTopQueries
}): Promise<void> {
  const pages = input.pages.slice(0, input.limit)
  let joined = 0

  if (input.queryPagesMetrics || input.queryPagesTopQueries) {
    try {
      const pageUrls = pages.map((page) => page.finalUrl)
      const metricsByUrl = input.queryPagesMetrics
        ? await input.queryPagesMetrics(input.site, pageUrls)
        : new Map()
      const topQueriesByUrl = input.queryPagesTopQueries
        ? await input.queryPagesTopQueries(input.site, pageUrls)
        : new Map()
      for (const page of pages) {
        const metrics = metricsByUrl.get(page.finalUrl)
        if (metrics) page.searchMetrics = metrics
        const topQuery = topQueriesByUrl.get(page.finalUrl)
        if (topQuery) page.topQuery = topQuery
        if (metrics || topQuery) joined += 1
      }
    } catch (error) {
      input.warnings.push(
        `GSC metrics skipped: ${error instanceof Error ? error.message : String(error)}`,
      )
      return
    }
    addSearchJoinWarning(input.pages.length, joined, input.warnings)
    return
  }

  for (const page of pages) {
    try {
      const metrics = await input.queryPageMetrics(input.site, page.finalUrl)
      if (metrics) page.searchMetrics = metrics
      const topQuery = await input.queryPageTopQuery(input.site, page.finalUrl)
      if (topQuery) page.topQuery = topQuery
      if (metrics || topQuery) joined += 1
    } catch (error) {
      input.warnings.push(
        `GSC metrics skipped: ${error instanceof Error ? error.message : String(error)}`,
      )
      return
    }
  }
  addSearchJoinWarning(input.pages.length, joined, input.warnings)
}

function addSearchJoinWarning(
  pageCount: number,
  joined: number,
  warnings: string[],
): void {
  if (pageCount && joined === 0) {
    warnings.push('GSC metrics joined for 0 crawled pages.')
  } else if (joined < pageCount) {
    warnings.push(`GSC metrics joined for ${joined} of ${pageCount} pages.`)
  }
}
