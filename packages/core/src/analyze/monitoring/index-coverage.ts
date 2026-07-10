import type { GscRow } from '../../types.js'
import type { CrawlReport } from '../crawler/report.js'
import {
  clusterPseoTemplates,
  type PseoTemplateCluster,
} from '../pseo/templates.js'
import type { CrawlPageSnapshot } from './types.js'

export type IndexCoverageSourceCompleteness =
  | 'complete'
  | 'partial'
  | 'truncated'
  | 'unknown'
  | 'unavailable'

export type IndexCoverageSourceEvidence = {
  completeness: IndexCoverageSourceCompleteness
  rowsReceived: number
  validUrls: number
  uniqueUrls: number
  duplicateUrls: number
  invalidUrls: number
  rowLimit?: number
  rowLimitReached?: boolean
}

export type IndexCoverageCrawlInput =
  | { report: CrawlReport }
  | {
      pages: CrawlPageSnapshot[]
      completeness: Exclude<IndexCoverageSourceCompleteness, 'unavailable'>
      rowLimit?: number
      rowLimitReached?: boolean
    }

export type IndexCoverageSitemapInput = {
  urls: string[]
  completeness: Exclude<IndexCoverageSourceCompleteness, 'unavailable'>
  rowLimit?: number
  rowLimitReached?: boolean
}

export type IndexCoverageSearchConsoleInput = {
  rows: GscRow[]
  startDate: string
  endDate: string
  rowLimit: number
  completeness: Exclude<IndexCoverageSourceCompleteness, 'unavailable'>
  pageKeyIndex?: number
}

export type IndexCoverageInput = {
  generatedAt: string
  crawl: IndexCoverageCrawlInput
  sitemap?: IndexCoverageSitemapInput
  searchConsole?: IndexCoverageSearchConsoleInput
  limits?: {
    itemsPerSection?: number
    templateClusters?: number
    templateSamples?: number
  }
  templateThresholds?: {
    minUrls?: number
    minShare?: number
  }
}

export type IndexCoverageSourceMembership = {
  crawl: boolean
  sitemap: boolean
  searchConsole: boolean
}

export type IndexCoverageSearchVisibilityItem = {
  url: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  sourceRows: number
  sources: IndexCoverageSourceMembership
  crawlIndexable?: boolean
}

export type IndexCoverageCandidateItem = {
  url: string
  status: number
  declaredIndexability?: CrawlPageSnapshot['declaredIndexability']
  inSitemap: boolean
}

export type IndexCoverageControlReason =
  | 'canonical-conflict'
  | 'canonical-hint-other'
  | 'crawl-fetch-error'
  | 'crawler-marked-non-indexable'
  | 'http-status'
  | 'noindex'
  | 'not-html'
  | 'robots-blocked'
  | 'unknown'

export type IndexCoverageControlledItem = {
  url: string
  status: number
  declaredIndexability?: CrawlPageSnapshot['declaredIndexability']
  reasons: IndexCoverageControlReason[]
  inSitemap: boolean
  hasRetainedSearchVisibility: boolean
}

export type IndexCoverageInventoryItem = {
  url: string
  sources: IndexCoverageSourceMembership
}

export type IndexCoverageBoundedSection<T> = {
  count: number
  returned: number
  omitted: number
  items: T[]
}

export type IndexCoverageTemplateReview = {
  scope: 'crawlable-without-retained-search-visibility'
  eligibleUrlCount: number
  count: number
  returned: number
  omitted: number
  thresholds: {
    minUrls: number
    minShare: number
  }
  clusters: PseoTemplateCluster[]
}

export type IndexCoverageSignalsReport = {
  schemaVersion: 1
  generatedAt: string
  limits: {
    itemsPerSection: number
    templateClusters: number
    templateSamples: number
  }
  summary: {
    uniqueUrlsAcrossSources: number
    retainedSearchVisibleUrls: number
    crawlableCandidatesWithoutRetainedSearchVisibility: number
    blockedOrNonIndexableCrawlUrls: number
    sitemapOnlyUrls: number
    searchConsoleOnlyUrls: number
    repeatedTemplateClustersForReview: number
  }
  sources: {
    crawl: IndexCoverageSourceEvidence & {
      semantics: 'local-crawl-page-snapshots'
    }
    sitemap: IndexCoverageSourceEvidence & {
      semantics: 'submitted-discovery-hints'
    }
    searchConsole: IndexCoverageSourceEvidence & {
      semantics: 'retained-search-analytics-page-rows'
      startDate?: string
      endDate?: string
      pageKeyIndex?: number
      invalidMetricRows: number
      zeroImpressionRows: number
    }
  }
  retainedSearchVisibility: IndexCoverageBoundedSection<IndexCoverageSearchVisibilityItem>
  crawlableWithoutRetainedSearchVisibility: IndexCoverageBoundedSection<IndexCoverageCandidateItem>
  blockedOrNonIndexable: IndexCoverageBoundedSection<IndexCoverageControlledItem>
  sitemapOnly: IndexCoverageBoundedSection<IndexCoverageInventoryItem>
  searchConsoleOnly: IndexCoverageBoundedSection<IndexCoverageInventoryItem>
  templateReview: IndexCoverageTemplateReview
  caveats: string[]
}

type SearchMetrics = {
  clicks: number
  impressions: number
  weightedPosition: number
  sourceRows: number
}

const DEFAULT_ITEMS_PER_SECTION = 100
const MAX_ITEMS_PER_SECTION = 1_000
const DEFAULT_TEMPLATE_LIMIT = 50
const MAX_TEMPLATE_LIMIT = 200
const DEFAULT_TEMPLATE_SAMPLES = 5
const MAX_TEMPLATE_SAMPLES = 25
const DEFAULT_TEMPLATE_MIN_URLS = 3
const DEFAULT_TEMPLATE_MIN_SHARE = 0.01

function compareText(left: string, right: string): number {
  const leftPoints = [...left].map((value) => value.codePointAt(0) ?? 0)
  const rightPoints = [...right].map((value) => value.codePointAt(0) ?? 0)
  for (
    let index = 0;
    index < Math.min(leftPoints.length, rightPoints.length);
    index += 1
  ) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0)
    if (difference) return difference
  }
  return leftPoints.length - rightPoints.length
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(1, Math.trunc(value)))
}

function normalizedUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    if (url.username || url.password) return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function isString(value: string | undefined): value is string {
  return value !== undefined
}

function sourceEvidence(input: {
  completeness: IndexCoverageSourceCompleteness
  rowsReceived: number
  validUrls: number
  uniqueUrls: number
  rowLimit?: number
  rowLimitReached?: boolean
}): IndexCoverageSourceEvidence {
  return {
    ...input,
    duplicateUrls: input.validUrls - input.uniqueUrls,
    invalidUrls: input.rowsReceived - input.validUrls,
  }
}

function crawlInput(input: IndexCoverageCrawlInput): {
  pages: CrawlPageSnapshot[]
  evidence: IndexCoverageSourceEvidence
} {
  const report = 'report' in input ? input.report : undefined
  const pages = report?.pages ?? ('pages' in input ? input.pages : [])
  const urls = pages.map((page) => normalizedUrl(page.url)).filter(isString)
  const uniqueUrls = new Set(urls)
  const rowLimit =
    report?.config.maxPages ??
    ('rowLimit' in input ? input.rowLimit : undefined)
  const rowLimitReached =
    report?.summary.pageLimitReached ??
    ('rowLimitReached' in input ? input.rowLimitReached : undefined)
  const completeness: IndexCoverageSourceCompleteness = report
    ? report.summary.pageLimitReached
      ? 'truncated'
      : report.status === 'completed'
        ? 'complete'
        : report.status === 'partial'
          ? 'partial'
          : 'unknown'
    : 'completeness' in input
      ? input.completeness
      : 'unknown'

  return {
    pages,
    evidence: sourceEvidence({
      completeness,
      rowsReceived: pages.length,
      validUrls: urls.length,
      uniqueUrls: uniqueUrls.size,
      rowLimit,
      rowLimitReached,
    }),
  }
}

function normalizedInventory(input: IndexCoverageSitemapInput | undefined): {
  urls: Set<string>
  evidence: IndexCoverageSourceEvidence
} {
  if (!input) {
    return {
      urls: new Set(),
      evidence: sourceEvidence({
        completeness: 'unavailable',
        rowsReceived: 0,
        validUrls: 0,
        uniqueUrls: 0,
      }),
    }
  }
  const normalized = input.urls.map(normalizedUrl).filter(isString)
  const urls = new Set(normalized)
  return {
    urls,
    evidence: sourceEvidence({
      completeness: input.completeness,
      rowsReceived: input.urls.length,
      validUrls: normalized.length,
      uniqueUrls: urls.size,
      rowLimit: input.rowLimit,
      rowLimitReached: input.rowLimitReached,
    }),
  }
}

function validMetric(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function searchConsoleInput(
  input: IndexCoverageSearchConsoleInput | undefined,
): {
  metrics: Map<string, SearchMetrics>
  evidence: IndexCoverageSignalsReport['sources']['searchConsole']
} {
  if (!input) {
    return {
      metrics: new Map(),
      evidence: {
        ...sourceEvidence({
          completeness: 'unavailable',
          rowsReceived: 0,
          validUrls: 0,
          uniqueUrls: 0,
        }),
        semantics: 'retained-search-analytics-page-rows',
        invalidMetricRows: 0,
        zeroImpressionRows: 0,
      },
    }
  }

  const pageKeyIndex = input.pageKeyIndex ?? 0
  const metrics = new Map<string, SearchMetrics>()
  const retainedRows: Array<{ url: string; row: GscRow }> = []
  let invalidUrls = 0
  let invalidMetricRows = 0
  let zeroImpressionRows = 0

  for (const row of input.rows) {
    const url = normalizedUrl(row.keys[pageKeyIndex] ?? '')
    if (!url) {
      invalidUrls += 1
      continue
    }
    if (
      !validMetric(row.clicks) ||
      !validMetric(row.impressions) ||
      !validMetric(row.position) ||
      row.clicks > row.impressions
    ) {
      invalidMetricRows += 1
      continue
    }
    if (row.impressions === 0) {
      zeroImpressionRows += 1
      continue
    }
    retainedRows.push({ url, row })
  }

  retainedRows.sort(
    (left, right) =>
      compareText(left.url, right.url) ||
      left.row.clicks - right.row.clicks ||
      left.row.impressions - right.row.impressions ||
      left.row.position - right.row.position ||
      compareText(
        JSON.stringify(left.row.keys),
        JSON.stringify(right.row.keys),
      ),
  )
  for (const { url, row } of retainedRows) {
    const existing = metrics.get(url) ?? {
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      sourceRows: 0,
    }
    existing.clicks += row.clicks
    existing.impressions += row.impressions
    existing.weightedPosition += row.position * row.impressions
    existing.sourceRows += 1
    metrics.set(url, existing)
  }

  const retainedMetricRows =
    input.rows.length - invalidUrls - invalidMetricRows - zeroImpressionRows
  return {
    metrics,
    evidence: {
      semantics: 'retained-search-analytics-page-rows',
      completeness: input.completeness,
      rowsReceived: input.rows.length,
      validUrls: retainedMetricRows,
      uniqueUrls: metrics.size,
      duplicateUrls: retainedMetricRows - metrics.size,
      invalidUrls,
      rowLimit: input.rowLimit,
      rowLimitReached: input.completeness === 'truncated',
      startDate: input.startDate,
      endDate: input.endDate,
      pageKeyIndex,
      invalidMetricRows,
      zeroImpressionRows,
    },
  }
}

function controlReasons(page: CrawlPageSnapshot): IndexCoverageControlReason[] {
  const reasons = new Set<IndexCoverageControlReason>()
  if (page.error || page.blocked) reasons.add('crawl-fetch-error')
  if (page.status < 200 || page.status >= 300) reasons.add('http-status')
  if (
    page.robotsTxt?.allowed === false ||
    page.declaredIndexability === 'robots-blocked'
  ) {
    reasons.add('robots-blocked')
  }
  if (page.declaredIndexability === 'noindex') reasons.add('noindex')
  if (page.declaredIndexability === 'canonical-conflict')
    reasons.add('canonical-conflict')
  if (page.declaredIndexability === 'canonical-hint-other')
    reasons.add('canonical-hint-other')
  if (page.declaredIndexability === 'not-html') reasons.add('not-html')
  if (!page.indexable && reasons.size === 0)
    reasons.add('crawler-marked-non-indexable')
  if (reasons.size === 0) reasons.add('unknown')
  return [...reasons].sort(compareText)
}

function boundedSection<T>(
  items: T[],
  limit: number,
): IndexCoverageBoundedSection<T> {
  const retained = items.slice(0, limit)
  return {
    count: items.length,
    returned: retained.length,
    omitted: items.length - retained.length,
    items: retained,
  }
}

function sourceMembership(input: {
  url: string
  crawlUrls: Set<string>
  sitemapUrls: Set<string>
  searchUrls: Set<string>
}): IndexCoverageSourceMembership {
  return {
    crawl: input.crawlUrls.has(input.url),
    sitemap: input.sitemapUrls.has(input.url),
    searchConsole: input.searchUrls.has(input.url),
  }
}

function caveats(input: {
  crawl: IndexCoverageSourceEvidence
  sitemap: IndexCoverageSourceEvidence
  searchConsole: IndexCoverageSignalsReport['sources']['searchConsole']
  controlledWithVisibility: number
}): string[] {
  const items = [
    'Retained Search Console page rows show search visibility during the selected date range. They are not a complete index inventory and do not prove current indexing.',
    'A crawlable URL absent from the retained Search Console export is not proven unindexed. It may have had no retained impressions, may be outside the export limit, or may need URL Inspection.',
    "Use URL Inspection when you need Google's current indexed verdict for a specific URL. This report does not infer that verdict from crawl, sitemap, or Search Analytics data.",
    'Repeated URL templates are grouped for review only. A cluster does not diagnose content quality, duplication, or index coverage.',
  ]
  if (input.searchConsole.completeness === 'unavailable') {
    items.push(
      'Search Console data was unavailable, so absence-from-search comparisons are not available.',
    )
  } else if (input.searchConsole.completeness !== 'complete') {
    items.push(
      'The Search Console source is not complete. Missing URLs are especially unsafe to interpret as absent from search.',
    )
  }
  if (input.crawl.completeness !== 'complete') {
    items.push(
      'The crawl source is not complete. Crawl counts and cross-source comparisons cover only retained pages.',
    )
  }
  if (input.sitemap.completeness === 'unavailable') {
    items.push(
      'No sitemap inventory was supplied. Sitemap-only and sitemap membership findings are unavailable.',
    )
  } else if (input.sitemap.completeness !== 'complete') {
    items.push(
      'The sitemap source is not complete. Sitemap-only counts cover only retained URLs.',
    )
  }
  if (input.sitemap.completeness !== 'unavailable') {
    items.push(
      'Sitemap inclusion is a discovery hint. It does not prove that Google crawled or indexed a URL.',
    )
  }
  if (input.searchConsole.zeroImpressionRows > 0) {
    items.push(
      'Rows with zero impressions were excluded from retained search visibility instead of treating them as a separate indexing state.',
    )
  }
  if (input.controlledWithVisibility > 0) {
    items.push(
      'Some currently blocked or non-indexable crawl URLs also had retained search visibility. The crawl observation and historical date-range visibility describe different evidence and can coexist.',
    )
  }
  return items
}

export function analyzeIndexCoverageSignals(
  input: IndexCoverageInput,
): IndexCoverageSignalsReport {
  const itemLimit = boundedInteger(
    input.limits?.itemsPerSection,
    DEFAULT_ITEMS_PER_SECTION,
    MAX_ITEMS_PER_SECTION,
  )
  const clusterLimit = boundedInteger(
    input.limits?.templateClusters,
    DEFAULT_TEMPLATE_LIMIT,
    MAX_TEMPLATE_LIMIT,
  )
  const clusterSamples = boundedInteger(
    input.limits?.templateSamples,
    DEFAULT_TEMPLATE_SAMPLES,
    MAX_TEMPLATE_SAMPLES,
  )
  const minUrls = boundedInteger(
    input.templateThresholds?.minUrls,
    DEFAULT_TEMPLATE_MIN_URLS,
    Number.MAX_SAFE_INTEGER,
  )
  const requestedMinShare = input.templateThresholds?.minShare
  const minShare = Number.isFinite(requestedMinShare)
    ? Math.min(1, Math.max(0, requestedMinShare ?? DEFAULT_TEMPLATE_MIN_SHARE))
    : DEFAULT_TEMPLATE_MIN_SHARE

  const crawl = crawlInput(input.crawl)
  const sitemap = normalizedInventory(input.sitemap)
  const search = searchConsoleInput(input.searchConsole)
  const searchUrls = new Set(search.metrics.keys())
  const hasSearchConsole = search.evidence.completeness !== 'unavailable'

  const pageByUrl = new Map<string, CrawlPageSnapshot>()
  for (const page of crawl.pages) {
    const url = normalizedUrl(page.url)
    if (!url) continue
    const existing = pageByUrl.get(url)
    if (
      !existing ||
      compareText(JSON.stringify(page), JSON.stringify(existing)) < 0
    ) {
      pageByUrl.set(url, page)
    }
  }
  const crawlUrls = new Set(pageByUrl.keys())

  const retainedSearchVisibility = [...search.metrics.entries()]
    .map(
      ([url, metrics]): IndexCoverageSearchVisibilityItem => ({
        url,
        clicks: metrics.clicks,
        impressions: metrics.impressions,
        ctr: metrics.impressions ? metrics.clicks / metrics.impressions : 0,
        position: metrics.impressions
          ? metrics.weightedPosition / metrics.impressions
          : 0,
        sourceRows: metrics.sourceRows,
        sources: sourceMembership({
          url,
          crawlUrls,
          sitemapUrls: sitemap.urls,
          searchUrls,
        }),
        crawlIndexable: pageByUrl.get(url)?.indexable,
      }),
    )
    .sort(
      (left, right) =>
        right.clicks - left.clicks ||
        right.impressions - left.impressions ||
        compareText(left.url, right.url),
    )

  const crawlable = [...pageByUrl.entries()]
    .filter(
      ([url, page]) =>
        hasSearchConsole && page.indexable && !searchUrls.has(url),
    )
    .map(
      ([url, page]): IndexCoverageCandidateItem => ({
        url,
        status: page.status,
        declaredIndexability: page.declaredIndexability,
        inSitemap: sitemap.urls.has(url),
      }),
    )
    .sort((left, right) => compareText(left.url, right.url))

  const controlled = [...pageByUrl.entries()]
    .filter(([, page]) => !page.indexable)
    .map(
      ([url, page]): IndexCoverageControlledItem => ({
        url,
        status: page.status,
        declaredIndexability: page.declaredIndexability,
        reasons: controlReasons(page),
        inSitemap: sitemap.urls.has(url),
        hasRetainedSearchVisibility: searchUrls.has(url),
      }),
    )
    .sort((left, right) => compareText(left.url, right.url))

  const sitemapOnly = [...sitemap.urls]
    .filter((url) => !crawlUrls.has(url) && !searchUrls.has(url))
    .sort(compareText)
    .map(
      (url): IndexCoverageInventoryItem => ({
        url,
        sources: sourceMembership({
          url,
          crawlUrls,
          sitemapUrls: sitemap.urls,
          searchUrls,
        }),
      }),
    )

  const searchConsoleOnly = [...searchUrls]
    .filter((url) => !crawlUrls.has(url) && !sitemap.urls.has(url))
    .sort(compareText)
    .map(
      (url): IndexCoverageInventoryItem => ({
        url,
        sources: sourceMembership({
          url,
          crawlUrls,
          sitemapUrls: sitemap.urls,
          searchUrls,
        }),
      }),
    )

  const allUrls = new Set([...crawlUrls, ...sitemap.urls, ...searchUrls])
  const allClusters = clusterPseoTemplates(
    crawlable.map((item) => item.url),
    {
      minUrls,
      minShare,
      limit: Number.MAX_SAFE_INTEGER,
      sampleSize: clusterSamples,
    },
  )
  const clusters = allClusters.slice(0, clusterLimit)
  const controlledWithVisibility = controlled.filter(
    (item) => item.hasRetainedSearchVisibility,
  ).length

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    limits: {
      itemsPerSection: itemLimit,
      templateClusters: clusterLimit,
      templateSamples: clusterSamples,
    },
    summary: {
      uniqueUrlsAcrossSources: allUrls.size,
      retainedSearchVisibleUrls: retainedSearchVisibility.length,
      crawlableCandidatesWithoutRetainedSearchVisibility: crawlable.length,
      blockedOrNonIndexableCrawlUrls: controlled.length,
      sitemapOnlyUrls: sitemapOnly.length,
      searchConsoleOnlyUrls: searchConsoleOnly.length,
      repeatedTemplateClustersForReview: allClusters.length,
    },
    sources: {
      crawl: {
        ...crawl.evidence,
        semantics: 'local-crawl-page-snapshots',
      },
      sitemap: {
        ...sitemap.evidence,
        semantics: 'submitted-discovery-hints',
      },
      searchConsole: search.evidence,
    },
    retainedSearchVisibility: boundedSection(
      retainedSearchVisibility,
      itemLimit,
    ),
    crawlableWithoutRetainedSearchVisibility: boundedSection(
      crawlable,
      itemLimit,
    ),
    blockedOrNonIndexable: boundedSection(controlled, itemLimit),
    sitemapOnly: boundedSection(sitemapOnly, itemLimit),
    searchConsoleOnly: boundedSection(searchConsoleOnly, itemLimit),
    templateReview: {
      scope: 'crawlable-without-retained-search-visibility',
      eligibleUrlCount: crawlable.length,
      count: allClusters.length,
      returned: clusters.length,
      omitted: allClusters.length - clusters.length,
      thresholds: { minUrls, minShare },
      clusters,
    },
    caveats: caveats({
      crawl: crawl.evidence,
      sitemap: sitemap.evidence,
      searchConsole: search.evidence,
      controlledWithVisibility,
    }),
  }
}
