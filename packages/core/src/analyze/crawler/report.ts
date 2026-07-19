import { createHash, randomUUID } from 'node:crypto'
import { SEO_CRAWLER_IDENTITY } from '../../fetch/http-client.js'
import { MAX_FETCH_CONCURRENCY } from '../../fetch/page-fetcher/rate-controls.js'
import {
  type FetchRateControls,
  type JavaScriptRenderingInput,
  type JavaScriptRenderingMode,
  normalizeJavaScriptRenderingMode,
} from '../../fetch/page-fetcher.js'
import type { RuleCategory, RuleId, RuleSeverity } from '../../rules.js'
import type { AccessBlockEvidence, CrawlerIdentity } from '../../types.js'
import type {
  SitemapDocument,
  SitemapFetchResult,
} from '../monitoring/sitemaps.js'
import type {
  CrawlPageSnapshot,
  CrawlRequestObservation,
  ExternalLinkCheckState,
} from '../monitoring/types.js'
import type { CrawlAgentDiscovery } from './agent-discovery.js'
import { auditCrawlPages, auditCrawlRequests } from './audit.js'
import {
  type CrawlSkippedUrlsByImpact,
  type CrawlSkipReason,
  type CrawlSkipReasonCount,
  crawlSkipReasonCountsFromRecord,
  normalizeCrawlSkipReasonCounts,
} from './crawl-skip-reasons.js'
import type { CrawlSiteChecks } from './site-checks.js'

export type { CrawlSiteChecks } from './site-checks.js'

export type CrawlMode = 'site' | 'page' | 'list' | 'sitemap'
export type CrawlStrategy = 'full' | 'health'

export const MAX_CRAWL_PAGES = 10_000
export const MAX_CRAWL_DEPTH = 64
export const MAX_CRAWL_CONCURRENCY = MAX_FETCH_CONCURRENCY
export const MAX_CRAWL_TIMEOUT_MS = 120_000

export type CrawlFetchRateConfig = FetchRateControls

export type CrawlConfig = {
  url: string
  mode: CrawlMode
  strategy: CrawlStrategy
  sitemapUrl?: string
  urls: string[]
  maxPages: number
  maxDepth: number
  concurrency: number
  timeoutMs: number
  include: string[]
  exclude: string[]
  respectRobots: boolean
  useSitemap: boolean
  checkExternal: boolean
  checkAgentDiscovery: boolean
  js: JavaScriptRenderingMode
  refresh: boolean
  fetchRate: CrawlFetchRateConfig
}

export type CrawlConfigInput = Omit<Partial<CrawlConfig>, 'url' | 'js'> & {
  url: string
  js?: JavaScriptRenderingInput
  projectId?: string
  site?: string
  searchMetricsLimit?: number
  googleAnalyticsPropertyId?: string
  analyticsLimit?: number
  signal?: AbortSignal
  onStatus?: CrawlStatusHandler
}

export type CrawlStatusPhase =
  | 'started'
  | 'url_queued'
  | 'url_skipped'
  | 'page_started'
  | 'page_completed'
  | 'page_failed'
  | 'page_skipped'
  | 'external_links_started'
  | 'external_links_completed'
  | 'cancelled'
  | 'completed'

export type CrawlStatusEvent = {
  type: 'crawl_status'
  phase: CrawlStatusPhase
  generatedAt: string
  url?: string
  depth?: number
  statusCode?: number
  reportId?: string
  reportStatus?: CrawlReport['status']
  reason?: string
  message?: string
  discoveredUrls: number
  queuedUrls: number
  pendingUrls: number
  inFlightUrls: number
  crawledUrls: number
  skippedUrls: number
  failedUrls: number
  observedInternalLinks: number
  maxPages: number
}

export type CrawlStatusHandler = (
  event: CrawlStatusEvent,
) => void | Promise<void>

export type CrawlIssue = {
  ruleId: RuleId
  title: string
  category: RuleCategory
  severity: RuleSeverity
  url: string
  detail?: string
  evidence?: Record<string, unknown>
  searchMetrics?: CrawlPageSnapshot['searchMetrics']
}

export type CrawlIssueGroup = {
  ruleId: RuleId
  title: string
  category: RuleCategory
  severity: RuleSeverity
  count: number
  sampleUrls: string[]
}

export type CrawlRunStats = {
  discoveredUrls: number
  queuedUrls: number
  crawledUrls: number
  skippedUrls: number
  skipReasonCounts?: Partial<Record<CrawlSkipReason, number>>
  failedUrls: number
  observedInternalLinks: number
  pageLimitReached: boolean
}

export type CrawlLinkGraph = Record<string, string[]>

export type CrawlAiBotAccess = {
  userAgent: string
  allowed: boolean | null
  declared: boolean
  coveredByWildcard: boolean
}

export type CrawlAiResourceSignal = {
  url: string
  exists: boolean
  status?: number
  contentType?: string
  validJson?: boolean
}

export type CrawlAiSignals = {
  robotsTxt?: {
    url: string
    exists: boolean
    availability:
      | 'available'
      | 'absent'
      | 'access-blocked'
      | 'rate-limited'
      | 'unreachable'
    status?: number
    error?: string
    sitemapUrls: string[]
    // Distinct robots.txt Content-Signal directive values. undefined means the
    // directives were not collected; [] means robots.txt declared none.
    contentSignals?: string[]
    botAccess: CrawlAiBotAccess[]
  }
  llmsTxt?: {
    url: string
    exists: boolean
    status?: number
  }
  agentResources?: CrawlAiResourceSignal[]
}

export type CrawlSitemapDiscovery = {
  dataStatus: 'complete' | 'partial' | 'unavailable'
  urlsReturned: number
  roots: Array<{
    url: string
    source: 'explicit' | 'robots-txt' | 'default-path'
    dataStatus: 'complete' | 'partial' | 'unavailable'
    urlsReturned: number
    sitemapsFetched: number
    lastmods: SitemapFetchResult['source']['lastmods']
    documents: SitemapDocument[]
    possiblyTruncated: boolean
    warnings: string[]
  }>
}

export type CrawlExternalLinkVerification = {
  dataStatus: 'complete' | 'partial' | 'unavailable'
  discoveredLinkOccurrences: number
  retainedUrls: number
  selectedUrls: number
  fetchedUrls: number
  failedUrls: number
  deferredUrls: number
  limit: number
  outcomes?: Record<ExternalLinkCheckState, number>
  warnings: string[]
}

export type CrawlDataSourceStatus =
  | 'joined'
  | 'partial'
  | 'none'
  | 'skipped'
  | 'unavailable'

export type CrawlDataSourceWindow = {
  startDate: string
  endDate: string
  days: number
}

export type CrawlSearchDataSource = {
  status: CrawlDataSourceStatus
  window?: CrawlDataSourceWindow
  totalPages: number
  queriedPages: number
  joinedMetricPages: number
  joinedQueryPages: number
  pageLimit: number
  pageLimitReached: boolean
  metricRowsReturned?: number
  queryRowsReturned?: number
  retainedRowLimit?: number
  retainedRowLimitReached?: boolean
  warning?: string
}

export type CrawlAnalyticsDataSource = {
  status: CrawlDataSourceStatus
  window?: CrawlDataSourceWindow
  totalPages: number
  queriedPages: number
  joinedPages: number
  returnedRows?: number
  availableRows?: number
  retainedRowLimit?: number
  retainedRowLimitReached?: boolean
  warning?: string
}

export type CrawlReportDataSources = {
  searchConsole: CrawlSearchDataSource
  analytics: CrawlAnalyticsDataSource
}

export type CrawlReportSummary = {
  totalPages: number
  statusOnlyPages: number
  indexablePages: number
  nonIndexablePages: number
  statusErrors: number
  discoveredUrls: number
  queuedUrls: number
  crawledUrls: number
  skippedUrls: number
  skipReasons: CrawlSkipReasonCount[]
  skippedUrlsByImpact: CrawlSkippedUrlsByImpact
  failedUrls: number
  observedInternalLinks: number
  pageLimitReached: boolean
  attemptedRequests: number
  responseRequests: number
  failedRequests: number
  abortedRequests: number
  extractionFailures: number
  requestByStatus: Record<string, number>
  avgRequestMs?: number
  highIssues: number
  mediumIssues: number
  lowIssues: number
  avgResponseMs?: number
  byStatus: Record<string, number>
  byCategory: Record<string, number>
}

export type CrawlAccessSummary = {
  crawler: CrawlerIdentity
  blockedRequests: number
  providers: Partial<Record<AccessBlockEvidence['provider'], number>>
  samples: Array<{
    url: string
    evidence: AccessBlockEvidence
  }>
  sampleLimit: number
  truncated: boolean
}

export type CrawlReport = {
  id: string
  definitionId: string
  projectId?: string
  site?: string
  googleAnalyticsPropertyId?: string
  generatedAt: string
  status: 'completed' | 'partial' | 'failed'
  configHash: string
  config: CrawlConfig
  access: CrawlAccessSummary
  summary: CrawlReportSummary
  requestEvidenceStatus: 'available' | 'partial' | 'unavailable'
  requests: CrawlRequestObservation[]
  pages: CrawlPageSnapshot[]
  issues: CrawlIssue[]
  issueGroups: CrawlIssueGroup[]
  dataSources?: CrawlReportDataSources
  ai?: CrawlAiSignals
  sitemapDiscovery?: CrawlSitemapDiscovery
  externalLinkVerification?: CrawlExternalLinkVerification
  siteChecks?: CrawlSiteChecks
  agentDiscovery?: CrawlAgentDiscovery
  warnings: string[]
  caveats: string[]
}

const SENSITIVE_FIELD_NAMES = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'www-authenticate',
  'x-api-key',
  'api-key',
  'access-token',
  'refresh-token',
])

const SENSITIVE_PARAM_PATTERN =
  /^(access_?token|auth|api_?key|client_?secret|code|jwt|key|password|refresh_?token|secret|session|sig|signature|token)$/i

function uniqueSorted(values: string[] = []): string[] {
  return [...new Set(values.filter(Boolean))].sort()
}

function normalizeFetchRate(
  input: CrawlConfigInput,
  strategy: CrawlStrategy,
): CrawlFetchRateConfig {
  const defaultConcurrency = strategy === 'health' ? 4 : 8
  return {
    concurrency:
      input.fetchRate?.concurrency ?? input.concurrency ?? defaultConcurrency,
    ...(input.fetchRate?.intervalCap !== undefined
      ? { intervalCap: input.fetchRate.intervalCap }
      : {}),
    ...(input.fetchRate?.intervalMs !== undefined
      ? { intervalMs: input.fetchRate.intervalMs }
      : {}),
    ...(input.fetchRate?.backpressure
      ? { backpressure: input.fetchRate.backpressure }
      : {}),
  }
}

export function normalizeCrawlConfig(input: CrawlConfigInput): CrawlConfig {
  const strategy = input.strategy ?? 'full'
  const concurrency = input.concurrency ?? (strategy === 'health' ? 4 : 8)
  return {
    url: new URL(input.url).toString(),
    mode: input.mode ?? (strategy === 'health' ? 'sitemap' : 'site'),
    strategy,
    ...(input.sitemapUrl
      ? { sitemapUrl: new URL(input.sitemapUrl).toString() }
      : {}),
    urls: uniqueSorted(input.urls ?? []),
    maxPages: input.maxPages ?? 500,
    maxDepth: input.maxDepth ?? 16,
    concurrency,
    timeoutMs: input.timeoutMs ?? 20_000,
    include: uniqueSorted(input.include ?? []),
    exclude: uniqueSorted(input.exclude ?? []),
    respectRobots: input.respectRobots ?? true,
    useSitemap: input.useSitemap ?? true,
    checkExternal:
      strategy === 'health' ? false : (input.checkExternal ?? true),
    checkAgentDiscovery:
      strategy === 'health' ? false : (input.checkAgentDiscovery ?? false),
    js:
      strategy === 'health'
        ? 'off'
        : normalizeJavaScriptRenderingMode(input.js),
    refresh: strategy === 'health' ? true : (input.refresh ?? false),
    fetchRate: normalizeFetchRate(input, strategy),
  }
}

function assertIntegerRange(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be an integer from ${minimum} to ${maximum}.`,
    )
  }
}

export function assertCrawlConfigLimits(config: CrawlConfig): CrawlConfig {
  if (config.strategy === 'health' && config.mode !== 'sitemap') {
    throw new RangeError('The health strategy requires sitemap mode.')
  }
  if (config.strategy === 'health' && !config.useSitemap) {
    throw new RangeError('The health strategy requires sitemap discovery.')
  }
  assertIntegerRange(config.maxPages, 'maxPages', 1, MAX_CRAWL_PAGES)
  assertIntegerRange(config.maxDepth, 'maxDepth', 0, MAX_CRAWL_DEPTH)
  assertIntegerRange(
    config.concurrency,
    'concurrency',
    1,
    MAX_FETCH_CONCURRENCY,
  )
  assertIntegerRange(config.timeoutMs, 'timeoutMs', 1, MAX_CRAWL_TIMEOUT_MS)
  if (config.fetchRate.concurrency !== undefined) {
    assertIntegerRange(
      config.fetchRate.concurrency,
      'fetchRate.concurrency',
      1,
      MAX_FETCH_CONCURRENCY,
    )
  }
  if (config.strategy === 'health' && config.mode !== 'sitemap') {
    throw new RangeError('Health strategy requires sitemap mode.')
  }
  if (config.sitemapUrl && config.mode !== 'sitemap') {
    throw new RangeError('sitemapUrl requires sitemap mode.')
  }
  return config
}

export function crawlConfigHash(config: CrawlConfigInput): string {
  const normalized = normalizeCrawlConfig(config)
  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 16)
}

export function crawlDefinitionId(input: {
  config: CrawlConfigInput
  site?: string
  googleAnalyticsPropertyId?: string
}): string {
  const normalized = {
    config: normalizeCrawlConfig(input.config),
    site: input.site ?? null,
    googleAnalyticsPropertyId: input.googleAnalyticsPropertyId ?? null,
  }
  const hash = createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 20)
  return `crawl_def_${hash}`
}

export function crawlRunId(): string {
  return `crawl_${randomUUID().replaceAll('-', '')}`
}

export function groupCrawlIssues(issues: CrawlIssue[]): CrawlIssueGroup[] {
  const groups = new Map<string, CrawlIssueGroup>()
  for (const issue of issues) {
    const existing = groups.get(issue.ruleId) ?? {
      ruleId: issue.ruleId,
      title: issue.title,
      category: issue.category,
      severity: issue.severity,
      count: 0,
      sampleUrls: [],
    }
    existing.count += 1
    if (existing.sampleUrls.length < 10) {
      existing.sampleUrls.push(issue.url)
    }
    groups.set(issue.ruleId, existing)
  }
  const severityRank: Record<RuleSeverity, number> = {
    high: 3,
    medium: 2,
    low: 1,
  }
  return [...groups.values()].sort(
    (a, b) =>
      severityRank[b.severity] - severityRank[a.severity] || b.count - a.count,
  )
}

function isSensitiveFieldName(key: string): boolean {
  const lower = key.toLowerCase()
  return (
    SENSITIVE_FIELD_NAMES.has(lower) ||
    SENSITIVE_PARAM_PATTERN.test(lower.replace(/-/g, '_'))
  )
}

function sanitizeUrlString(value: string): string {
  try {
    const url = new URL(value)
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_PARAM_PATTERN.test(key)) {
        url.searchParams.set(key, '[redacted]')
      }
    }
    return url.toString()
  } catch {
    return value
  }
}

function sanitizeTenantString(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>`]+/g, (match) => sanitizeUrlString(match))
    .replace(
      /\b(access_?token|api_?key|auth|client_?secret|jwt|password|refresh_?token|secret|session|signature|token)(\s*[=:]\s*)[^\s,;&]+/gi,
      (_match, key: string, separator: string) =>
        `${key}${separator}[redacted]`,
    )
    .replace(/\b[A-Za-z]:\\[^\s"'<>`]+/g, '[local-path]')
    .replace(/\/(?:Users|home|tmp|var\/folders)\/[^\s"'<>`]+/g, '[local-path]')
}

function sanitizeTenantValue(value: unknown, key?: string): unknown {
  if (key && isSensitiveFieldName(key)) {
    return value === '[redacted]' ? value : '[redacted]'
  }
  if (typeof value === 'string') return sanitizeTenantString(value)
  if (Array.isArray(value)) {
    let sanitized: unknown[] | undefined
    for (let index = 0; index < value.length; index += 1) {
      const item = sanitizeTenantValue(value[index])
      if (sanitized) {
        sanitized.push(item)
      } else if (item !== value[index]) {
        sanitized = [...value.slice(0, index), item]
      }
    }
    return sanitized ?? value
  }
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  let sanitized: Record<string, unknown> | undefined
  for (const [entryKey, entry] of Object.entries(record)) {
    const safeEntry = sanitizeTenantValue(entry, entryKey)
    if (safeEntry === entry) continue
    sanitized ??= { ...record }
    sanitized[entryKey] = safeEntry
  }
  return sanitized ?? value
}

function sanitizeCrawlConfig(config: CrawlConfig): CrawlConfig {
  return sanitizeTenantValue(config) as CrawlConfig
}

function sanitizePages(pages: CrawlPageSnapshot[]): CrawlPageSnapshot[] {
  const safePages = sanitizeTenantValue(pages) as Array<
    CrawlPageSnapshot & { seoScore?: unknown; geoScore?: unknown }
  >
  let normalized: CrawlPageSnapshot[] | undefined
  for (let index = 0; index < safePages.length; index += 1) {
    const page = safePages[index]
    if (!page) continue
    if ('seoScore' in page || 'geoScore' in page) {
      normalized ??= safePages.slice(0, index)
      const { seoScore: _seoScore, geoScore: _geoScore, ...current } = page
      normalized.push(current)
    } else if (normalized) {
      normalized.push(page)
    }
  }
  return normalized ?? safePages
}

function sanitizeIssues(issues: CrawlIssue[]): CrawlIssue[] {
  return sanitizeTenantValue(issues) as CrawlIssue[]
}

function sanitizeMessages(values: string[] = []): string[] {
  return values.map((value) => sanitizeTenantString(value))
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sortPages(pages: CrawlPageSnapshot[]): CrawlPageSnapshot[] {
  return [...pages].sort((left, right) => compareText(left.url, right.url))
}

function sortRequests(
  requests: CrawlRequestObservation[],
): CrawlRequestObservation[] {
  return [...requests].sort((left, right) => {
    const byUrl = compareText(left.requestedUrl, right.requestedUrl)
    if (byUrl) return byUrl
    const byOutcome = compareText(left.outcome, right.outcome)
    if (byOutcome) return byOutcome
    const leftDetail =
      left.outcome === 'response'
        ? `${left.status}:${left.finalUrl}`
        : left.outcome === 'skipped'
          ? left.reason
          : `${left.failureKind}:${left.error}`
    const rightDetail =
      right.outcome === 'response'
        ? `${right.status}:${right.finalUrl}`
        : right.outcome === 'skipped'
          ? right.reason
          : `${right.failureKind}:${right.error}`
    return compareText(leftDetail, rightDetail)
  })
}

export function summarizeCrawlReport(input: {
  pages: CrawlPageSnapshot[]
  requests?: CrawlRequestObservation[]
  requestEvidenceStatus?: CrawlReport['requestEvidenceStatus']
  issues: CrawlIssue[]
  stats?: Partial<CrawlRunStats> & { skipReasons?: CrawlSkipReasonCount[] }
}): CrawlReportSummary {
  const byStatus: Record<string, number> = {}
  const requestByStatus: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  let responseMs = 0
  let responseCount = 0
  let statusOnlyPages = 0
  let indexablePages = 0
  let nonIndexablePages = 0
  let statusErrors = 0

  for (const page of input.pages) {
    byStatus[String(page.status)] = (byStatus[String(page.status)] ?? 0) + 1
    if (typeof page.responseTimeMs === 'number') {
      responseMs += page.responseTimeMs
      responseCount += 1
    }
    if (page.auditScope === 'status') {
      statusOnlyPages += 1
    } else if (page.indexable) {
      indexablePages += 1
    } else {
      nonIndexablePages += 1
    }
    if (page.status === 0 || page.status >= 400) statusErrors += 1
  }
  const requests = input.requests ?? []
  let requestMs = 0
  let requestMsCount = 0
  let responseRequests = 0
  let failedRequests = 0
  let abortedRequests = 0
  let extractionFailures = 0
  for (const request of requests) {
    const status =
      request.outcome === 'response'
        ? String(request.status)
        : request.outcome === 'skipped'
          ? request.reason
          : request.failureKind === 'aborted'
            ? 'aborted'
            : 'no-response'
    requestByStatus[status] = (requestByStatus[status] ?? 0) + 1
    if (typeof request.durationMs === 'number') {
      requestMs += request.durationMs
      requestMsCount += 1
    }
    if (request.outcome === 'response') {
      responseRequests += 1
      if (request.extraction === 'failed') extractionFailures += 1
    } else if (request.outcome === 'failure') {
      if (request.failureKind === 'aborted') abortedRequests += 1
      else failedRequests += 1
    }
  }
  let highIssues = 0
  let mediumIssues = 0
  let lowIssues = 0
  for (const issue of input.issues) {
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1
    if (issue.severity === 'high') highIssues += 1
    else if (issue.severity === 'medium') mediumIssues += 1
    else lowIssues += 1
  }

  const runStats = crawlRunStats(input.pages, input.stats)
  return {
    totalPages: input.pages.length,
    statusOnlyPages,
    indexablePages,
    nonIndexablePages,
    statusErrors,
    ...runStats,
    attemptedRequests:
      input.requestEvidenceStatus === 'unavailable' ? 0 : requests.length,
    responseRequests,
    failedRequests,
    abortedRequests,
    extractionFailures,
    requestByStatus,
    avgRequestMs: requestMsCount
      ? Math.round(requestMs / requestMsCount)
      : undefined,
    highIssues,
    mediumIssues,
    lowIssues,
    avgResponseMs: responseCount
      ? Math.round(responseMs / responseCount)
      : undefined,
    byStatus,
    byCategory,
  }
}

const ACCESS_BLOCK_SAMPLE_LIMIT = 10

function crawlAccessSummary(
  requests: CrawlRequestObservation[],
): CrawlAccessSummary {
  const providers: CrawlAccessSummary['providers'] = {}
  const samples: CrawlAccessSummary['samples'] = []
  let blockedRequests = 0
  for (const request of requests) {
    if (request.outcome !== 'response' || !request.accessBlock) continue
    blockedRequests += 1
    providers[request.accessBlock.provider] =
      (providers[request.accessBlock.provider] ?? 0) + 1
    if (samples.length < ACCESS_BLOCK_SAMPLE_LIMIT) {
      samples.push({
        url: request.requestedUrl,
        evidence: request.accessBlock,
      })
    }
  }
  return {
    crawler: SEO_CRAWLER_IDENTITY,
    blockedRequests,
    providers,
    samples,
    sampleLimit: ACCESS_BLOCK_SAMPLE_LIMIT,
    truncated: blockedRequests > ACCESS_BLOCK_SAMPLE_LIMIT,
  }
}

function crawlRunStats(
  pages: CrawlPageSnapshot[],
  stats: Partial<CrawlRunStats> & { skipReasons?: CrawlSkipReasonCount[] } = {},
): Omit<CrawlRunStats, 'skipReasonCounts'> & {
  skipReasons: CrawlSkipReasonCount[]
  skippedUrlsByImpact: CrawlSkippedUrlsByImpact
} {
  const needsDiscoveredUrls = stats.discoveredUrls === undefined
  const needsObservedInternalLinks = stats.observedInternalLinks === undefined
  const needsFailedUrls = stats.failedUrls === undefined
  const discovered = needsDiscoveredUrls ? new Set<string>() : undefined
  let observedInternalLinks = 0
  let failedUrls = 0
  if (needsDiscoveredUrls || needsObservedInternalLinks || needsFailedUrls) {
    for (const page of pages) {
      if (discovered) {
        discovered.add(page.url)
        for (const url of page.sampleInternalLinks ?? []) discovered.add(url)
        for (const url of page.sampleExternalLinks ?? []) discovered.add(url)
      }
      if (needsObservedInternalLinks) {
        observedInternalLinks += page.outgoingInternalCount
      }
      if (needsFailedUrls && (page.status === 0 || page.status >= 400)) {
        failedUrls += 1
      }
    }
  }
  const skips = normalizeCrawlSkipReasonCounts({
    skippedUrls: stats.skippedUrls,
    skipReasons:
      stats.skipReasons ??
      crawlSkipReasonCountsFromRecord(stats.skipReasonCounts),
  })
  return {
    discoveredUrls: stats.discoveredUrls ?? discovered?.size ?? 0,
    queuedUrls: stats.queuedUrls ?? pages.length,
    crawledUrls: stats.crawledUrls ?? pages.length,
    skippedUrls: skips.skippedUrls,
    skipReasons: skips.skipReasons,
    skippedUrlsByImpact: skips.skippedUrlsByImpact,
    failedUrls: stats.failedUrls ?? failedUrls,
    observedInternalLinks: stats.observedInternalLinks ?? observedInternalLinks,
    pageLimitReached: stats.pageLimitReached ?? false,
  }
}

function normalizeLinkUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function deriveInternalLinkAuthority(
  pages: CrawlPageSnapshot[],
  linkGraph?: CrawlLinkGraph,
): CrawlPageSnapshot[] {
  const hasLinkGraph = linkGraph && Object.keys(linkGraph).length > 0
  const hasStoredScores = pages.some(
    (page) =>
      page.internalInlinkCount !== undefined ||
      page.internalLinkAuthorityScore !== undefined,
  )
  if (!hasLinkGraph && hasStoredScores) {
    if (
      pages.every(
        (page) =>
          page.internalInlinkCount !== undefined &&
          page.internalLinkAuthorityScore !== undefined,
      )
    ) {
      return pages
    }
    return pages.map((page) =>
      page.internalInlinkCount !== undefined &&
      page.internalLinkAuthorityScore !== undefined
        ? page
        : {
            ...page,
            internalInlinkCount: page.internalInlinkCount ?? 0,
            internalLinkAuthorityScore: page.internalLinkAuthorityScore ?? 0,
          },
    )
  }

  const pageByUrl = new Map<string, string>()
  for (const page of pages) {
    for (const value of [page.url, page.finalUrl]) {
      const normalized = normalizeLinkUrl(value)
      if (normalized) pageByUrl.set(normalized, page.url)
    }
  }

  const inlinks = new Map<string, number>()
  for (const page of pages) inlinks.set(page.url, 0)

  for (const page of pages) {
    const targets = hasLinkGraph
      ? (linkGraph?.[page.url] ?? linkGraph?.[page.finalUrl] ?? [])
      : (page.sampleInternalLinks ?? [])
    const linkedPages = new Set<string>()
    for (const target of targets) {
      const normalized = normalizeLinkUrl(target)
      const linkedPage = normalized ? pageByUrl.get(normalized) : undefined
      if (!linkedPage || linkedPage === page.url) continue
      linkedPages.add(linkedPage)
    }
    for (const linkedPage of linkedPages) {
      inlinks.set(linkedPage, (inlinks.get(linkedPage) ?? 0) + 1)
    }
  }

  let maxInlinks = 0
  for (const count of inlinks.values()) maxInlinks = Math.max(maxInlinks, count)
  return pages.map((page) => {
    const internalInlinkCount = inlinks.get(page.url) ?? 0
    return {
      ...page,
      internalInlinkCount,
      internalLinkAuthorityScore: maxInlinks
        ? Math.round((internalInlinkCount / maxInlinks) * 100)
        : 0,
    }
  })
}

export function createCrawlReport(input: {
  id?: string
  config: CrawlConfigInput
  pages?: CrawlPageSnapshot[]
  requests?: CrawlRequestObservation[]
  requestEvidenceStatus?: CrawlReport['requestEvidenceStatus']
  issues?: CrawlIssue[]
  additionalIssues?: CrawlIssue[]
  linkGraph?: CrawlLinkGraph
  ai?: CrawlAiSignals
  projectId?: string
  site?: string
  googleAnalyticsPropertyId?: string
  dataSources?: CrawlReportDataSources
  sitemapDiscovery?: CrawlSitemapDiscovery
  externalLinkVerification?: CrawlExternalLinkVerification
  siteChecks?: CrawlSiteChecks
  agentDiscovery?: CrawlAgentDiscovery
  status?: CrawlReport['status']
  warnings?: string[]
  caveats?: string[]
  stats?: Partial<CrawlRunStats>
  generatedAt?: string
}): CrawlReport {
  const config = sanitizeCrawlConfig(normalizeCrawlConfig(input.config))
  const definitionId = crawlDefinitionId({
    config,
    site: input.site,
    googleAnalyticsPropertyId: input.googleAnalyticsPropertyId,
  })
  const pagesWithLinks = deriveInternalLinkAuthority(
    input.pages ?? [],
    input.linkGraph,
  )
  const safePagesWithLinks = sortPages(sanitizePages(pagesWithLinks))
  const requests = sortRequests(
    sanitizeTenantValue(input.requests ?? []) as CrawlRequestObservation[],
  )
  const requestEvidenceStatus =
    input.requestEvidenceStatus ??
    (input.requests ? 'available' : 'unavailable')
  if (requestEvidenceStatus === 'unavailable' && requests.length > 0) {
    throw new Error(
      'Unavailable request evidence cannot include request observations.',
    )
  }
  const issues = [
    ...(input.issues ?? [
      ...auditCrawlRequests(requests),
      ...auditCrawlPages(safePagesWithLinks, { startUrl: config.url }),
    ]),
    ...(input.additionalIssues ?? []),
  ]
  const safeIssues = sanitizeIssues(issues)
  const pages = safePagesWithLinks
  return {
    id: input.id ?? crawlRunId(),
    definitionId,
    projectId: input.projectId,
    site: input.site,
    googleAnalyticsPropertyId: input.googleAnalyticsPropertyId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: input.status ?? 'completed',
    configHash: crawlConfigHash(config),
    config,
    access: crawlAccessSummary(requests),
    summary: summarizeCrawlReport({
      pages,
      requests,
      requestEvidenceStatus,
      issues: safeIssues,
      stats: input.stats,
    }),
    requestEvidenceStatus,
    requests,
    pages,
    issues: safeIssues,
    issueGroups: groupCrawlIssues(safeIssues),
    ...(input.dataSources
      ? {
          dataSources: sanitizeTenantValue(
            input.dataSources,
          ) as CrawlReportDataSources,
        }
      : {}),
    ...(input.ai
      ? { ai: sanitizeTenantValue(input.ai) as CrawlAiSignals }
      : {}),
    ...(input.sitemapDiscovery
      ? {
          sitemapDiscovery: sanitizeTenantValue(
            input.sitemapDiscovery,
          ) as CrawlSitemapDiscovery,
        }
      : {}),
    ...(input.externalLinkVerification
      ? {
          externalLinkVerification: sanitizeTenantValue(
            input.externalLinkVerification,
          ) as CrawlExternalLinkVerification,
        }
      : {}),
    ...(input.siteChecks
      ? {
          siteChecks: sanitizeTenantValue(input.siteChecks) as CrawlSiteChecks,
        }
      : {}),
    ...(input.agentDiscovery
      ? {
          agentDiscovery: sanitizeTenantValue(
            input.agentDiscovery,
          ) as CrawlAgentDiscovery,
        }
      : {}),
    warnings: sanitizeMessages(input.warnings).sort(compareText),
    caveats: sanitizeMessages(input.caveats).sort(compareText),
  }
}

export function normalizeLoadedCrawlReport(report: CrawlReport): CrawlReport {
  const config = sanitizeCrawlConfig(normalizeCrawlConfig(report.config))
  const requestEvidenceStatus =
    report.requestEvidenceStatus ??
    (Object.hasOwn(report as object, 'requests') ? 'available' : 'unavailable')
  const issues = sanitizeIssues(report.issues ?? [])
  const requests = sortRequests(
    (sanitizeTenantValue(report.requests ?? []) ??
      []) as CrawlRequestObservation[],
  )
  const pages = sortPages(
    sanitizePages(deriveInternalLinkAuthority(report.pages ?? [])),
  )
  return {
    ...(sanitizeTenantValue(report) as CrawlReport),
    config,
    access: crawlAccessSummary(requests),
    requestEvidenceStatus,
    requests,
    definitionId:
      report.definitionId ??
      crawlDefinitionId({
        config,
        site: report.site,
        googleAnalyticsPropertyId: report.googleAnalyticsPropertyId,
      }),
    summary: summarizeCrawlReport({
      pages,
      requests,
      requestEvidenceStatus,
      issues,
      stats: report.summary,
    }),
    pages,
    issues,
    issueGroups: groupCrawlIssues(issues),
    warnings: sanitizeMessages(report.warnings).sort(compareText),
    caveats: sanitizeMessages(report.caveats).sort(compareText),
  }
}
