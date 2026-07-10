import { shouldExcludeBrandQuery } from '../../brand.js'
import { SeoError } from '../../errors.js'
import { extractPage } from '../../extract/page-extractor.js'
import { type FetchRateControls, fetchPage } from '../../fetch/page-fetcher.js'
import { inspectUrl } from '../../gsc/client/inspection.js'
import type { UrlInspectionResult } from '../../gsc/client/types.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { countLabel } from '../../phrasing.js'
import type { ProgressReporter } from '../../progress.js'
import { effectiveRobotsDirectives } from '../../robots-directives.js'
import type { PageFetchResult } from '../../types.js'
import { fetchSitemapUrls } from '../monitoring/sitemaps.js'
import { isLowActionabilityQuery } from '../query-quality.js'
import {
  defaultDateRange,
  integerOption,
} from '../site-diagnostics/quick-wins-report-input.js'
import {
  buildPseoAuditReportFromRows,
  pseoIndexStatus,
  pseoQueryCoverage,
  pseoSampleUrls,
} from './analysis.js'
import type {
  PseoAuditReport,
  PseoCrawlSample,
  PseoInspectionSample,
  PseoPageRow,
  PseoQueryPageRow,
} from './types.js'

export { buildPseoAuditReportFromRows, pseoIndexStatus } from './analysis.js'
export type * from './types.js'

const MAX_GSC_ROWS = 50_000
const DEFAULT_SITEMAP_URLS = 50_000

type SearchAnalytics = typeof querySearchAnalytics
type FetchPage = typeof fetchPage
type InspectUrl = typeof inspectUrl
type FetchSitemapUrls = typeof fetchSitemapUrls

export type PseoAuditInput = {
  site: string
  days?: number
  sitemaps?: string[]
  maxSitemapUrls?: number
  templateLimit?: number
  minimumTemplateUrls?: number
  minimumTemplateShare?: number
  minimumTemplateImpressions?: number
  crawlSamples?: number
  inspectSamples?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
  js?: boolean | 'auto'
  rate?: FetchRateControls
  progress?: ProgressReporter
}

export type PseoDependencies = {
  searchAnalytics: SearchAnalytics
  fetchPage: FetchPage
  inspectUrl: InspectUrl
  fetchSitemapUrls: FetchSitemapUrls
  now: () => Date
}

const defaultDependencies: PseoDependencies = {
  searchAnalytics: querySearchAnalytics,
  fetchPage,
  inspectUrl,
  fetchSitemapUrls,
  now: () => new Date(),
}

function numericOption(input: {
  value: number | undefined
  fallback: number
  minimum: number
  maximum: number
  label: string
}): number {
  const value = input.value ?? input.fallback
  if (
    !Number.isFinite(value) ||
    value < input.minimum ||
    value > input.maximum
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} must be between ${input.minimum} and ${input.maximum}.`,
    )
  }
  return value
}

export function pseoAuditOptions(input: Omit<PseoAuditInput, 'site'>) {
  const days = integerOption({
    value: input.days,
    fallback: 28,
    minimum: 1,
    maximum: 548,
    label: 'days',
  })
  const templateLimit = integerOption({
    value: input.templateLimit,
    fallback: 25,
    minimum: 1,
    maximum: 100,
    label: 'templateLimit',
  })
  const minimumTemplateUrls = integerOption({
    value: input.minimumTemplateUrls,
    fallback: 3,
    minimum: 2,
    maximum: 100,
    label: 'minimumTemplateUrls',
  })
  const crawlSamples = integerOption({
    value: input.crawlSamples,
    fallback: 0,
    minimum: 0,
    maximum: 10,
    label: 'crawlSamples',
  })
  const inspectSamples = integerOption({
    value: input.inspectSamples,
    fallback: 0,
    minimum: 0,
    maximum: 10,
    label: 'inspectSamples',
  })
  const maxSitemapUrls = integerOption({
    value: input.maxSitemapUrls,
    fallback: DEFAULT_SITEMAP_URLS,
    minimum: 1,
    maximum: 100_000,
    label: 'maxSitemapUrls',
  })
  const minimumTemplateImpressions = numericOption({
    value: input.minimumTemplateImpressions,
    fallback: 0,
    minimum: 0,
    maximum: 1_000_000_000,
    label: 'minimumTemplateImpressions',
  })
  const minimumTemplateShare = numericOption({
    value: input.minimumTemplateShare,
    fallback: 0,
    minimum: 0,
    maximum: 1,
    label: 'minimumTemplateShare',
  })
  if ((input.sitemaps?.length ?? 0) > 20) {
    throw new SeoError(
      'INVALID_INPUT',
      'sitemaps must contain at most 20 URLs.',
    )
  }
  for (const sitemap of input.sitemaps ?? []) {
    try {
      if (!['http:', 'https:'].includes(new URL(sitemap).protocol))
        throw new Error()
    } catch {
      throw new SeoError('INVALID_INPUT', `Invalid sitemap URL: ${sitemap}`)
    }
  }
  if (
    input.brandTerms &&
    (input.brandTerms.length > 20 ||
      input.brandTerms.some((term) => !term.trim() || term.length > 200))
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'brandTerms must contain at most 20 non-empty terms of 200 characters or fewer.',
    )
  }
  return {
    ...input,
    days,
    templateLimit,
    minimumTemplateUrls,
    minimumTemplateShare,
    minimumTemplateImpressions,
    crawlSamples,
    inspectSamples,
    maxSitemapUrls,
  }
}

function topQueryByUrl(
  rows: PseoQueryPageRow[],
  input: Pick<PseoAuditInput, 'site' | 'brandTerms' | 'includeBrand'>,
): Map<string, string> {
  const best = new Map<string, { query: string; score: number }>()
  for (const row of rows) {
    if (
      isLowActionabilityQuery(row.query) ||
      shouldExcludeBrandQuery({
        query: row.query,
        siteUrl: input.site,
        brandTerms: input.brandTerms,
        includeBrand: input.includeBrand,
      })
    ) {
      continue
    }
    const score = row.impressions + row.clicks * 10
    const previous = best.get(row.page)
    if (!previous || score > previous.score) {
      best.set(row.page, { query: row.query, score })
    }
  }
  return new Map([...best].map(([url, value]) => [url, value.query]))
}

function absoluteUrl(
  value: string | undefined,
  base: string,
): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, base)
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function crawlTechnicalStatus(input: {
  requestedUrl: string
  fetched: PageFetchResult
  canonical?: string
  metaRobots?: string
  xRobotsTag?: string
}): PseoCrawlSample['technicalStatus'] {
  if (
    input.fetched.diagnostics.blocked ||
    input.fetched.robotsTxt?.allowed === false
  ) {
    return 'blocked'
  }
  if (input.fetched.status < 200 || input.fetched.status >= 300) {
    return 'http-error'
  }
  if (effectiveRobotsDirectives(input).has('noindex')) {
    return 'noindex'
  }
  const canonical = absoluteUrl(input.canonical, input.fetched.finalUrl)
  const finalUrl = absoluteUrl(input.fetched.finalUrl, input.fetched.finalUrl)
  if (canonical && finalUrl && canonical !== finalUrl) {
    return 'canonical-mismatch'
  }
  if (
    input.requestedUrl !== input.fetched.finalUrl ||
    (input.fetched.diagnostics.redirectChain?.length ?? 0) > 0
  ) {
    return 'redirected'
  }
  return 'ok'
}

async function crawlSample(input: {
  url: string
  topQuery?: string
  refresh?: boolean
  js?: boolean | 'auto'
  rate?: FetchRateControls
  fetch: FetchPage
}): Promise<PseoCrawlSample> {
  try {
    const fetched = await input.fetch(input.url, {
      refresh: input.refresh,
      js: input.js ?? 'auto',
      rate: input.rate,
    })
    const page = await extractPage(fetched)
    const h1 = page.headings.find((heading) => heading.level === 1)?.text
    const technicalStatus = crawlTechnicalStatus({
      requestedUrl: input.url,
      fetched,
      canonical: page.canonical,
      metaRobots: page.metaRobots,
      xRobotsTag: page.xRobotsTag,
    })
    return {
      url: input.url,
      finalUrl: page.finalUrl,
      status: fetched.status,
      title: page.title,
      h1,
      metaDescription: page.metaDescription,
      metaRobots: page.metaRobots,
      xRobotsTag: page.xRobotsTag,
      canonical: absoluteUrl(page.canonical, page.finalUrl),
      wordCount: page.wordCount,
      technicalStatus,
      queryCoverage:
        input.topQuery && ['ok', 'redirected'].includes(technicalStatus)
          ? pseoQueryCoverage({
              query: input.topQuery,
              title: page.title,
              h1,
              body: page.contentText,
            })
          : undefined,
      fetchDiagnostics: fetched.diagnostics,
      warnings: [...fetched.warnings, ...page.warnings],
    }
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error)
    return {
      url: input.url,
      technicalStatus: 'fetch-error',
      warnings: [warning],
      warning,
    }
  }
}

function inspectionSample(
  url: string,
  result: UrlInspectionResult,
): PseoInspectionSample {
  const status = result.inspectionResult?.indexStatusResult
  return {
    url,
    indexStatus: pseoIndexStatus(status?.verdict),
    verdict: status?.verdict,
    coverageState: status?.coverageState,
    indexingState: status?.indexingState,
    robotsTxtState: status?.robotsTxtState,
    pageFetchState: status?.pageFetchState,
    lastCrawlTime: status?.lastCrawlTime,
    userCanonical: status?.userCanonical,
    googleCanonical: status?.googleCanonical,
  }
}

async function inspectSample(input: {
  site: string
  url: string
  inspect: InspectUrl
}): Promise<PseoInspectionSample> {
  try {
    return inspectionSample(
      input.url,
      await input.inspect({ siteUrl: input.site, inspectionUrl: input.url }),
    )
  } catch (error) {
    return {
      url: input.url,
      indexStatus: 'unknown',
      warning: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function pseoAuditReport(
  input: PseoAuditInput,
  dependencies: PseoDependencies = defaultDependencies,
): Promise<PseoAuditReport> {
  const options = pseoAuditOptions(input)
  const now = dependencies.now()
  const generatedAt = now.toISOString()
  const range = defaultDateRange(options.days, now)
  const warnings: string[] = []
  input.progress?.('Fetching sitemap URLs')
  const sitemapResults = await Promise.all(
    (input.sitemaps ?? []).map((sitemapUrl) =>
      dependencies.fetchSitemapUrls({
        sitemapUrl,
        limit: options.maxSitemapUrls,
      }),
    ),
  )
  const sitemapUrls = sitemapResults.flatMap((result) => {
    warnings.push(...result.warnings)
    return result.urls
  })

  const request = {
    ...range,
    type: 'web' as const,
    dataState: 'final' as const,
    aggregationType: 'auto' as const,
    maxRows: MAX_GSC_ROWS,
  }
  input.progress?.(
    `Fetching ${options.days} days of GSC page and query/page rows`,
  )
  const [pageResponse, queryPageResponse] = await Promise.all([
    dependencies.searchAnalytics(
      input.site,
      { ...request, dimensions: ['page'] },
      { refresh: input.refresh },
    ),
    dependencies.searchAnalytics(
      input.site,
      { ...request, dimensions: ['query', 'page'] },
      { refresh: input.refresh },
    ),
  ])
  const pageRows: PseoPageRow[] = pageResponse.rows.map((row) => ({
    page: row.keys[0] ?? '',
    clicks: row.clicks,
    impressions: row.impressions,
    position: row.position,
  }))
  const queryPageRows: PseoQueryPageRow[] = queryPageResponse.rows.map(
    (row) => ({
      query: row.keys[0] ?? '',
      page: row.keys[1] ?? '',
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    }),
  )
  const build = (evidence?: {
    crawl: PseoCrawlSample[]
    inspection: PseoInspectionSample[]
  }) =>
    buildPseoAuditReportFromRows({
      site: input.site,
      generatedAt,
      range,
      days: options.days,
      queryPageRows,
      pageRows,
      sitemapUrls,
      crawlSamples: evidence?.crawl,
      inspectionSamples: evidence?.inspection,
      templateLimit: options.templateLimit,
      minimumTemplateUrls: options.minimumTemplateUrls,
      minimumTemplateShare: options.minimumTemplateShare,
      minimumTemplateImpressions: options.minimumTemplateImpressions,
      crawlSamplesPerTemplate: options.crawlSamples,
      inspectionSamplesPerTemplate: options.inspectSamples,
      maxRowsPerRequest: MAX_GSC_ROWS,
      pageRowsFetched: pageResponse.rowsFetched,
      queryPageRowsFetched: queryPageResponse.rowsFetched,
      sitemapsRequested: input.sitemaps?.length ?? 0,
      maxUrlsPerSitemap: options.maxSitemapUrls,
      brandTerms: input.brandTerms,
      includeBrand: input.includeBrand,
      warnings,
      caveats: [
        `Data freshness: ${input.refresh ? 'fresh fetch requested; caches bypassed where supported' : 'local cache allowed; use --refresh to bypass cached provider and HTTP data'}.`,
        input.sitemaps?.length
          ? `Sitemaps: ${countLabel(input.sitemaps.length, 'sitemap URL')} requested.`
          : 'Sitemaps: none provided; template discovery used retained GSC page rows.',
      ],
    })
  const initial = build()
  const sampleUrls = pseoSampleUrls(initial)
  const topQueries = topQueryByUrl(queryPageRows, input)
  const crawl: PseoCrawlSample[] = []
  for (const [index, url] of sampleUrls.crawl.entries()) {
    input.progress?.(
      `Crawling pSEO sample ${index + 1}/${sampleUrls.crawl.length}`,
    )
    crawl.push(
      await crawlSample({
        url,
        topQuery: topQueries.get(url),
        refresh: input.refresh,
        js: input.js,
        rate: input.rate,
        fetch: dependencies.fetchPage,
      }),
    )
  }
  const inspection: PseoInspectionSample[] = []
  for (const [index, url] of sampleUrls.inspection.entries()) {
    input.progress?.(
      `Inspecting pSEO sample ${index + 1}/${sampleUrls.inspection.length}`,
    )
    inspection.push(
      await inspectSample({
        site: input.site,
        url,
        inspect: dependencies.inspectUrl,
      }),
    )
  }
  input.progress?.('Scoring pSEO template evidence')
  return build({ crawl, inspection })
}
