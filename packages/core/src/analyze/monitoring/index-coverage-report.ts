import { SeoError } from '../../errors.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { finalGscDateRange } from '../../gsc/dates.js'
import type { CrawlReport } from '../crawler/report.js'
import { latestCrawlReport, loadCrawlReport } from '../crawler/report-store.js'
import { integerOption } from '../site-diagnostics/quick-wins-report-input.js'
import {
  analyzeIndexCoverageSignals,
  type IndexCoverageSignalsReport,
  type IndexCoverageSourceCompleteness,
} from './index-coverage.js'
import {
  boundedSitemapInventory,
  fetchSitemapUrls,
  type SitemapFetchResult,
} from './sitemaps.js'

const MAX_SITEMAP_DOCUMENTS = 20
const MAX_SEARCH_ROWS = 250_000
const MAX_SITEMAP_URLS = 250_000

type SearchAnalytics = typeof querySearchAnalytics
type FetchSitemap = typeof fetchSitemapUrls

export type IndexCoverageReportInput = {
  site: string
  crawlReportId?: string
  sitemaps?: string[]
  days?: number
  rowLimit?: number
  maxSitemapUrls?: number
  itemsPerSection?: number
  templateClusters?: number
  templateSamples?: number
  refresh?: boolean
}

export type IndexCoverageReport = IndexCoverageSignalsReport & {
  site: string
  input: {
    crawlReport: {
      id: string
      generatedAt: string
      status: CrawlReport['status']
      mode: CrawlReport['config']['mode']
      startUrl: string
    }
    sitemapDocuments: {
      source: 'explicit' | 'crawl-robots' | 'unavailable'
      urls: string[]
      warnings: string[]
    }
    searchConsole: {
      days: number
      rowLimit: number
      calls: number
      rowsFetched: number
    }
  }
}

export type IndexCoverageReportDependencies = {
  loadCrawl: (id: string) => CrawlReport | undefined
  latestCrawl: (site: string) => CrawlReport | undefined
  searchAnalytics: SearchAnalytics
  fetchSitemap: FetchSitemap
  now: () => Date
}

const defaultDependencies: IndexCoverageReportDependencies = {
  loadCrawl: loadCrawlReport,
  latestCrawl: latestCrawlReport,
  searchAnalytics: querySearchAnalytics,
  fetchSitemap: fetchSitemapUrls,
  now: () => new Date(),
}

function selectedCrawl(
  input: IndexCoverageReportInput,
  dependencies: IndexCoverageReportDependencies,
): CrawlReport {
  const report = input.crawlReportId
    ? dependencies.loadCrawl(input.crawlReportId)
    : dependencies.latestCrawl(input.site)
  if (!report) {
    throw new SeoError(
      'INVALID_INPUT',
      input.crawlReportId
        ? `No saved crawl report found for ${input.crawlReportId}.`
        : `No saved crawl report found for ${input.site}. Run a site crawl first or pass crawlReportId.`,
    )
  }
  if (report.site && report.site !== input.site) {
    throw new SeoError(
      'INVALID_INPUT',
      `Crawl report ${report.id} belongs to ${report.site}, not ${input.site}.`,
    )
  }
  return report
}

function sitemapDocuments(input: {
  explicit?: string[]
  report: CrawlReport
}): {
  source: IndexCoverageReport['input']['sitemapDocuments']['source']
  urls: string[]
} {
  if (input.explicit?.length) {
    return { source: 'explicit', urls: [...new Set(input.explicit)] }
  }
  const robots = input.report.ai?.robotsTxt
  if (robots?.availability === 'available' && robots.sitemapUrls.length) {
    return {
      source: 'crawl-robots',
      urls: [...new Set(robots.sitemapUrls)],
    }
  }
  return { source: 'unavailable', urls: [] }
}

function sitemapCompleteness(input: {
  results: SitemapFetchResult[]
  inventoryTruncated: boolean
}): Exclude<IndexCoverageSourceCompleteness, 'unavailable'> {
  if (input.inventoryTruncated) return 'truncated'
  return input.results.every((result) => result.dataStatus === 'complete')
    ? 'complete'
    : 'partial'
}

export async function indexCoverageSignals(
  input: IndexCoverageReportInput,
  dependencies: IndexCoverageReportDependencies = defaultDependencies,
): Promise<IndexCoverageReport> {
  const days = integerOption({
    value: input.days,
    fallback: 90,
    minimum: 1,
    maximum: 548,
    label: 'days',
  })
  const rowLimit = integerOption({
    value: input.rowLimit,
    fallback: 100_000,
    minimum: 1,
    maximum: MAX_SEARCH_ROWS,
    label: 'rowLimit',
  })
  const maxSitemapUrls = integerOption({
    value: input.maxSitemapUrls,
    fallback: 100_000,
    minimum: 1,
    maximum: MAX_SITEMAP_URLS,
    label: 'maxSitemapUrls',
  })
  const report = selectedCrawl(input, dependencies)
  const documents = sitemapDocuments({
    explicit: input.sitemaps,
    report,
  })
  if (documents.urls.length > MAX_SITEMAP_DOCUMENTS) {
    throw new SeoError(
      'INVALID_INPUT',
      `Pass at most ${MAX_SITEMAP_DOCUMENTS} sitemap URLs.`,
    )
  }

  const now = dependencies.now()
  const range = finalGscDateRange(days, now)
  const [search, fetchedSitemaps] = await Promise.all([
    dependencies.searchAnalytics(
      input.site,
      {
        ...range,
        dimensions: ['page'],
        type: 'web',
        dataState: 'final',
        maxRows: rowLimit,
      },
      { refresh: input.refresh },
    ),
    Promise.all(
      documents.urls.map((sitemapUrl) =>
        dependencies.fetchSitemap({
          sitemapUrl,
          limit: maxSitemapUrls,
        }),
      ),
    ),
  ])
  const sitemapInventory = fetchedSitemaps.length
    ? boundedSitemapInventory(fetchedSitemaps, maxSitemapUrls)
    : undefined
  const searchTruncated = search.rows.length >= rowLimit
  const analysis = analyzeIndexCoverageSignals({
    generatedAt: now.toISOString(),
    crawl: { report },
    ...(sitemapInventory
      ? {
          sitemap: {
            urls: sitemapInventory.urls,
            completeness: sitemapCompleteness({
              results: fetchedSitemaps,
              inventoryTruncated: sitemapInventory.truncation.possiblyTruncated,
            }),
            rowLimit: maxSitemapUrls,
            rowLimitReached: sitemapInventory.truncation.inventoryLimitExceeded,
          },
        }
      : {}),
    searchConsole: {
      rows: search.rows,
      ...range,
      rowLimit,
      completeness: searchTruncated ? 'truncated' : 'complete',
      pageKeyIndex: 0,
    },
    limits: {
      itemsPerSection: input.itemsPerSection,
      templateClusters: input.templateClusters,
      templateSamples: input.templateSamples,
    },
  })

  return {
    ...analysis,
    site: input.site,
    input: {
      crawlReport: {
        id: report.id,
        generatedAt: report.generatedAt,
        status: report.status,
        mode: report.config.mode,
        startUrl: report.config.url,
      },
      sitemapDocuments: {
        ...documents,
        warnings: fetchedSitemaps.flatMap((result) => result.warnings),
      },
      searchConsole: {
        days,
        rowLimit,
        calls: search.calls,
        rowsFetched: search.rowsFetched,
      },
    },
  }
}
