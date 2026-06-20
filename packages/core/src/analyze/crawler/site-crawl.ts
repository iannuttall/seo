import robotsParserModule from 'robots-parser'
import { publicHttpFetch } from '../../fetch/http-client.js'
import {
  queryPageMetrics,
  queryPagesMetrics,
  queryPagesTopQueries,
  queryPageTopQuery,
} from '../../gsc/client.js'
import { crawlOne } from '../monitoring/crawl-page.js'
import { fetchSitemapUrls } from '../monitoring/sitemaps.js'
import {
  fetchLandingPageValues,
  landingValueForUrl,
} from '../workflows/analytics-value.js'
import type {
  CrawlConfigInput,
  CrawlReport,
  CrawlStatusEvent,
  CrawlStatusPhase,
} from './report.js'
import { createCrawlReport, normalizeCrawlConfig } from './report.js'

type QueueItem = {
  url: string
  depth: number
}

type CrawlTask = QueueItem & {
  promise: Promise<{
    task: CrawlTask
    result: Awaited<ReturnType<typeof crawlOne>>
  }>
}

const CRAWL_CANCELLED = Symbol('crawl-cancelled')
const DEFAULT_SEARCH_METRICS_LIMIT = 5000

type LlmsTxtSignal = {
  url: string
  exists: boolean
  status?: number
}

const AI_BOT_USER_AGENTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'Applebot',
  'Bingbot',
]

const AGENT_RESOURCE_PATHS = [
  '/.well-known/agent.json',
  '/agent.json',
  '/.well-known/mcp.json',
  '/.well-known/ai-plugin.json',
  '/.well-known/openapi.json',
  '/openapi.json',
]

type ExternalLinkCheck = {
  url: string
  status?: number
  error?: string
}

type ResolvedCrawlSiteDependencies = {
  fetchPage: typeof crawlOne
  fetchSitemapUrls: typeof fetchSitemapUrls
  fetch: typeof publicHttpFetch
  queryPageMetrics: typeof queryPageMetrics
  queryPageTopQuery: typeof queryPageTopQuery
  queryPagesMetrics?: typeof queryPagesMetrics
  queryPagesTopQueries?: typeof queryPagesTopQueries
  fetchLandingPageValues: typeof fetchLandingPageValues
  landingValueForUrl: typeof landingValueForUrl
  now: () => Date
}

export type CrawlSiteDependencies = Partial<ResolvedCrawlSiteDependencies>

function resolveCrawlSiteDependencies(
  dependencies: CrawlSiteDependencies = {},
): ResolvedCrawlSiteDependencies {
  const hasInjectedPerPageSearchProvider = Boolean(
    dependencies.queryPageMetrics || dependencies.queryPageTopQuery,
  )
  return {
    fetchPage: dependencies.fetchPage ?? crawlOne,
    fetchSitemapUrls: dependencies.fetchSitemapUrls ?? fetchSitemapUrls,
    fetch: dependencies.fetch ?? publicHttpFetch,
    queryPageMetrics: dependencies.queryPageMetrics ?? queryPageMetrics,
    queryPageTopQuery: dependencies.queryPageTopQuery ?? queryPageTopQuery,
    queryPagesMetrics:
      dependencies.queryPagesMetrics ??
      (hasInjectedPerPageSearchProvider ? undefined : queryPagesMetrics),
    queryPagesTopQueries:
      dependencies.queryPagesTopQueries ??
      (hasInjectedPerPageSearchProvider ? undefined : queryPagesTopQueries),
    fetchLandingPageValues:
      dependencies.fetchLandingPageValues ?? fetchLandingPageValues,
    landingValueForUrl: dependencies.landingValueForUrl ?? landingValueForUrl,
    now: dependencies.now ?? (() => new Date()),
  }
}

function abortController(input: { timeoutMs: number; signal?: AbortSignal }): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, Math.min(input.timeoutMs, 5_000))
  if (input.signal?.aborted) {
    controller.abort()
  } else {
    input.signal?.addEventListener('abort', abort, { once: true })
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      input.signal?.removeEventListener('abort', abort)
    },
  }
}

function cancellationRace(
  signal: AbortSignal,
): Promise<typeof CRAWL_CANCELLED> {
  if (signal.aborted) return Promise.resolve(CRAWL_CANCELLED)
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(CRAWL_CANCELLED), {
      once: true,
    })
  })
}

function normalizeUrl(value: string, base?: string): string | undefined {
  try {
    const url = base ? new URL(value, base) : new URL(value)
    url.hash = ''
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

function isLikelyAsset(url: string): boolean {
  const path = new URL(url).pathname.toLowerCase()
  return /\.(avif|bmp|css|csv|dmg|eot|gif|gz|ico|jpeg|jpg|js|json|map|mov|mp3|mp4|ogg|otf|pdf|png|svg|tar|ttf|wav|webm|webp|woff|woff2|zip)$/.test(
    path,
  )
}

function globMatch(pattern: string, value: string): boolean {
  if (!pattern.includes('*')) return value.includes(pattern)
  const parts = pattern.split('*')
  let position = 0
  for (const part of parts) {
    if (!part) continue
    const found = value.slice(position).indexOf(part)
    if (found === -1) return false
    position += found + part.length
  }
  return true
}

function passesFilters(
  url: string,
  include: string[],
  exclude: string[],
): boolean {
  if (include.length && !include.some((pattern) => globMatch(pattern, url))) {
    return false
  }
  if (exclude.some((pattern) => globMatch(pattern, url))) {
    return false
  }
  return true
}

async function sitemapSeeds(input: {
  url: string
  maxPages: number
  warnings: string[]
  fetchSitemapUrls: typeof fetchSitemapUrls
}): Promise<string[]> {
  const sitemapUrl = new URL('/sitemap.xml', input.url).toString()
  const sitemap = await input.fetchSitemapUrls({
    sitemapUrl,
    limit: input.maxPages,
  })
  input.warnings.push(...sitemap.warnings)
  return sitemap.urls
}

async function checkLlmsTxt(input: {
  url: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<LlmsTxtSignal> {
  const llmsUrl = new URL('/llms.txt', input.url).toString()
  const controller = abortController({
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  })

  try {
    const response = await input.fetch(llmsUrl, {
      profile: 'bot',
      redirect: 'follow',
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') ?? ''
    const exists =
      response.status >= 200 &&
      response.status < 300 &&
      !/\btext\/html\b/i.test(contentType)
    await response.body?.cancel().catch(() => undefined)
    return {
      url: response.url || llmsUrl,
      exists,
      status: response.status,
    }
  } catch {
    return { url: llmsUrl, exists: false }
  } finally {
    controller.cleanup()
  }
}

function parseRobots(robotsUrl: string, text: string) {
  return (
    robotsParserModule as unknown as (
      url: string,
      robotstxt: string,
    ) => {
      isAllowed(url: string, ua?: string): boolean | undefined
    }
  )(robotsUrl, text)
}

function declaredUserAgents(text: string): Set<string> {
  const declared = new Set<string>()
  for (const match of text.matchAll(/^\s*user-agent\s*:\s*(.+?)\s*$/gim)) {
    const value = match[1]?.trim().toLowerCase()
    if (value) declared.add(value)
  }
  return declared
}

function sitemapUrlsFromRobots(text: string): string[] {
  const urls = new Set<string>()
  for (const match of text.matchAll(/^\s*sitemap\s*:\s*(\S+)\s*$/gim)) {
    const value = match[1]?.trim()
    if (!value) continue
    try {
      urls.add(new URL(value).toString())
    } catch {
      // Ignore malformed sitemap declarations.
    }
  }
  return [...urls]
}

async function checkRobotsAiAccess(input: {
  url: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<NonNullable<CrawlReport['ai']>['robotsTxt']> {
  const robotsUrl = new URL('/robots.txt', input.url).toString()
  const controller = abortController({
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  })
  try {
    const response = await input.fetch(robotsUrl, {
      profile: 'bot',
      redirect: 'follow',
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()
    const exists =
      response.status >= 200 &&
      response.status < 300 &&
      !/\btext\/html\b/i.test(contentType)
    const declared = exists ? declaredUserAgents(text) : new Set<string>()
    const parsed = parseRobots(robotsUrl, exists ? text : '')
    return {
      url: response.url || robotsUrl,
      exists,
      status: response.status,
      sitemapUrls: exists ? sitemapUrlsFromRobots(text) : [],
      botAccess: AI_BOT_USER_AGENTS.map((userAgent) => {
        const lower = userAgent.toLowerCase()
        return {
          userAgent,
          allowed: parsed.isAllowed(input.url, userAgent) ?? true,
          declared: declared.has(lower),
          coveredByWildcard: declared.has('*'),
        }
      }),
    }
  } catch {
    return {
      url: robotsUrl,
      exists: false,
      sitemapUrls: [],
      botAccess: AI_BOT_USER_AGENTS.map((userAgent) => ({
        userAgent,
        allowed: true,
        declared: false,
        coveredByWildcard: false,
      })),
    }
  } finally {
    controller.cleanup()
  }
}

async function checkAgentResource(input: {
  baseUrl: string
  path: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<
  NonNullable<NonNullable<CrawlReport['ai']>['agentResources']>[number]
> {
  const url = new URL(input.path, input.baseUrl).toString()
  const controller = abortController({
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  })
  try {
    const response = await input.fetch(url, {
      profile: 'bot',
      redirect: 'follow',
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') ?? ''
    const text = await response.text()
    const exists = response.status >= 200 && response.status < 300
    let validJson: boolean | undefined
    if (exists && /\bjson\b/i.test(contentType)) {
      try {
        JSON.parse(text)
        validJson = true
      } catch {
        validJson = false
      }
    }
    return {
      url: response.url || url,
      exists,
      status: response.status,
      contentType,
      ...(validJson === undefined ? {} : { validJson }),
    }
  } catch {
    return { url, exists: false }
  } finally {
    controller.cleanup()
  }
}

async function checkAgentResources(input: {
  url: string
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<NonNullable<CrawlReport['ai']>['agentResources']> {
  const resources: NonNullable<CrawlReport['ai']>['agentResources'] = []
  for (const path of AGENT_RESOURCE_PATHS) {
    if (input.signal?.aborted) break
    resources.push(
      await checkAgentResource({
        baseUrl: input.url,
        path,
        timeoutMs: input.timeoutMs,
        fetch: input.fetch,
        signal: input.signal,
      }),
    )
  }
  return resources
}

async function checkExternalLink(
  url: string,
  timeoutMs: number,
  fetch: typeof publicHttpFetch,
  signal?: AbortSignal,
): Promise<ExternalLinkCheck> {
  const controller = abortController({ timeoutMs, signal })

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })
    await response.body?.cancel().catch(() => undefined)
    return { url, status: response.status }
  } catch (error) {
    return {
      url,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    controller.cleanup()
  }
}

async function verifyExternalLinks(input: {
  pages: CrawlReport['pages']
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<void> {
  if (input.signal?.aborted) return
  const urls = [
    ...new Set(
      input.pages
        .flatMap((page) => page.sampleExternalLinks ?? [])
        .slice(0, 200),
    ),
  ]
  if (!urls.length) return

  const checks = new Map<string, ExternalLinkCheck>()
  for (let index = 0; index < urls.length; index += 8) {
    if (input.signal?.aborted) break
    const batch = urls.slice(index, index + 8)
    const results = await Promise.all(
      batch.map((url) =>
        checkExternalLink(url, input.timeoutMs, input.fetch, input.signal),
      ),
    )
    for (const result of results) checks.set(result.url, result)
  }

  for (const page of input.pages) {
    const pageChecks = (page.sampleExternalLinks ?? [])
      .map((url) => checks.get(url))
      .filter((value): value is ExternalLinkCheck => Boolean(value))
    if (pageChecks.length) page.externalLinkChecks = pageChecks
  }
}

export async function crawlSite(
  input: CrawlConfigInput,
  dependencies?: CrawlSiteDependencies,
): Promise<CrawlReport> {
  const deps = resolveCrawlSiteDependencies(dependencies)
  const config = normalizeCrawlConfig(input)
  const signal = input.signal
  let cancelled = Boolean(signal?.aborted)
  const isCancelled = (): boolean => cancelled || Boolean(signal?.aborted)
  const site = input.site
  const origin = new URL(config.url).origin
  const warnings: string[] = []
  const queue: QueueItem[] = []
  const visited = new Set<string>()
  const queued = new Set<string>()
  const discovered = new Set<string>()
  const linkGraph: Record<string, string[]> = {}
  const pages: CrawlReport['pages'] = []
  const inFlight = new Set<CrawlTask>()
  const followLinks = config.mode === 'site'
  let queuedUrls = 0
  let skippedUrls = 0
  let failedUrls = 0
  let verifiedLinks = 0
  let statusEventChain = Promise.resolve()
  const emitStatus = (
    phase: CrawlStatusPhase,
    event: Partial<CrawlStatusEvent> = {},
  ): void => {
    if (!input.onStatus) return
    const statusEvent: CrawlStatusEvent = {
      type: 'crawl_status',
      phase,
      generatedAt: deps.now().toISOString(),
      discoveredUrls: discovered.size,
      queuedUrls,
      pendingUrls: queue.length,
      inFlightUrls: inFlight.size,
      crawledUrls: pages.length,
      skippedUrls,
      failedUrls,
      verifiedLinks,
      maxPages: config.maxPages,
      ...event,
    }
    statusEventChain = statusEventChain
      .then(() => input.onStatus?.(statusEvent))
      .catch(() => undefined)
  }
  const flushStatusEvents = async (): Promise<void> => {
    await statusEventChain
  }

  emitStatus('started', {
    url: config.url,
    message: `Started crawl for ${config.url}.`,
  })

  const aiSignals = isCancelled()
    ? undefined
    : await Promise.all([
        checkLlmsTxt({
          url: config.url,
          timeoutMs: config.timeoutMs,
          fetch: deps.fetch,
          signal,
        }),
        checkRobotsAiAccess({
          url: config.url,
          timeoutMs: config.timeoutMs,
          fetch: deps.fetch,
          signal,
        }),
        checkAgentResources({
          url: config.url,
          timeoutMs: config.timeoutMs,
          fetch: deps.fetch,
          signal,
        }),
      ])
  const llmsTxt =
    aiSignals?.[0] ??
    ({
      url: new URL('/llms.txt', config.url).toString(),
      exists: false,
    } satisfies LlmsTxtSignal)
  const robotsTxt = aiSignals?.[1]
  const agentResources = aiSignals?.[2]
  cancelled = isCancelled()

  const enqueue = (value: string, depth: number): void => {
    const normalized = normalizeUrl(value, config.url)
    if (!normalized) {
      skippedUrls += 1
      emitStatus('url_skipped', {
        url: value,
        depth,
        reason: 'invalid_url',
      })
      return
    }
    discovered.add(normalized)
    if (queued.has(normalized) || visited.has(normalized)) return
    if (!sameOrigin(normalized, origin)) {
      skippedUrls += 1
      emitStatus('url_skipped', {
        url: normalized,
        depth,
        reason: 'off_origin',
      })
      return
    }
    if (isLikelyAsset(normalized)) {
      skippedUrls += 1
      emitStatus('url_skipped', {
        url: normalized,
        depth,
        reason: 'asset_url',
      })
      return
    }
    if (!passesFilters(normalized, config.include, config.exclude)) {
      skippedUrls += 1
      emitStatus('url_skipped', {
        url: normalized,
        depth,
        reason: 'filtered_url',
      })
      return
    }
    if (queue.length + visited.size + inFlight.size >= config.maxPages * 5) {
      skippedUrls += 1
      emitStatus('url_skipped', {
        url: normalized,
        depth,
        reason: 'queue_safety_limit',
      })
      return
    }
    queued.add(normalized)
    queuedUrls += 1
    queue.push({ url: normalized, depth })
    emitStatus('url_queued', { url: normalized, depth })
  }

  if (config.mode !== 'sitemap') {
    const seeds = config.mode === 'list' ? config.urls : [config.url]
    for (const seed of seeds) {
      enqueue(seed, 0)
    }
  }

  if (
    !isCancelled() &&
    config.useSitemap &&
    (config.mode === 'site' || config.mode === 'sitemap')
  ) {
    for (const url of await sitemapSeeds({
      url: config.url,
      maxPages: config.maxPages,
      warnings,
      fetchSitemapUrls: deps.fetchSitemapUrls,
    })) {
      enqueue(url, 0)
    }
  }

  const nextQueueItem = (): QueueItem | undefined => {
    while (queue.length) {
      const item = queue.shift()
      if (!item) continue
      const normalized = normalizeUrl(item.url, config.url)
      if (!normalized) continue
      if (visited.has(normalized)) continue
      visited.add(normalized)
      return { url: normalized, depth: item.depth }
    }
    return undefined
  }

  const startTask = (item: QueueItem): void => {
    let task: CrawlTask
    task = {
      ...item,
      promise: deps
        .fetchPage(item.url, {
          js: config.js,
          refresh: config.refresh,
          timeoutMs: config.timeoutMs,
          rate: config.fetchRate,
          signal,
        })
        .then((result) => ({
          task,
          result,
        }))
        .catch((error) => ({
          task,
          result: {
            urls: [],
            warning: `${item.url}: ${error instanceof Error ? error.message : String(error)}`,
          },
        })),
    }
    inFlight.add(task)
    emitStatus('page_started', { url: item.url, depth: item.depth })
  }

  while (
    !isCancelled() &&
    (queue.length || inFlight.size) &&
    pages.length < config.maxPages
  ) {
    while (
      !isCancelled() &&
      inFlight.size < config.concurrency &&
      pages.length + inFlight.size < config.maxPages
    ) {
      const item = nextQueueItem()
      if (!item) break
      startTask(item)
    }

    if (!inFlight.size) break

    const next = await Promise.race([
      ...[...inFlight].map((item) => item.promise),
      ...(signal ? [cancellationRace(signal)] : []),
    ])
    if (next === CRAWL_CANCELLED) {
      cancelled = true
      break
    }

    const { task, result } = next
    inFlight.delete(task)

    if (result.warning) {
      warnings.push(result.warning)
      failedUrls += 1
      emitStatus('page_failed', {
        url: task.url,
        depth: task.depth,
        reason: result.warning,
      })
      continue
    }
    if (!result.page) {
      failedUrls += 1
      emitStatus('page_failed', {
        url: task.url,
        depth: task.depth,
        reason: 'missing_page_snapshot',
      })
      continue
    }
    if (config.respectRobots && result.page.robotsTxt?.allowed === false) {
      result.page.crawlDepth = task.depth
      result.page.blocked = true
      result.page.indexable = false
      result.page.indexability = 'Robots.txt disallowed'
      pages.push(result.page)
      linkGraph[result.page.url] = []
      linkGraph[result.page.finalUrl] = []
      warnings.push(
        `${result.page.url}: skipped because robots.txt disallows it`,
      )
      skippedUrls += 1
      emitStatus('page_skipped', {
        url: result.page.url,
        depth: task.depth,
        statusCode: result.page.status,
        reason: 'robots_txt_disallowed',
      })
      continue
    }

    result.page.crawlDepth = task.depth
    pages.push(result.page)
    linkGraph[result.page.url] = result.urls
    linkGraph[result.page.finalUrl] = result.urls
    verifiedLinks += result.urls.length
    emitStatus('page_completed', {
      url: result.page.url,
      depth: task.depth,
      statusCode: result.page.status,
    })

    if (followLinks && task.depth < config.maxDepth) {
      for (const url of result.urls) {
        enqueue(url, task.depth + 1)
      }
    }
  }

  cancelled = isCancelled()
  if (cancelled) {
    warnings.push('Crawl cancelled; returning a partial report.')
    emitStatus('cancelled', {
      url: config.url,
      message: 'Crawl cancelled; returning a partial report.',
    })
  }

  const partial =
    cancelled ||
    pages.length >= config.maxPages ||
    queue.length > 0 ||
    inFlight.size > 0 ||
    warnings.length > 0

  if (!cancelled && site) {
    await joinSearchMetrics({
      site,
      pages,
      warnings,
      limit: input.searchMetricsLimit ?? DEFAULT_SEARCH_METRICS_LIMIT,
      queryPageMetrics: deps.queryPageMetrics,
      queryPageTopQuery: deps.queryPageTopQuery,
      queryPagesMetrics: deps.queryPagesMetrics,
      queryPagesTopQueries: deps.queryPagesTopQueries,
    })
  }
  if (!cancelled && input.ga4PropertyId) {
    await joinAnalytics({
      propertyId: input.ga4PropertyId,
      pages,
      warnings,
      limit: input.analyticsLimit ?? 5000,
      fetchLandingPageValues: deps.fetchLandingPageValues,
      landingValueForUrl: deps.landingValueForUrl,
      now: deps.now,
    })
  }
  if (!cancelled && config.checkExternal) {
    emitStatus('external_links_started', {
      url: config.url,
      message: 'Started external link checks.',
    })
    await verifyExternalLinks({
      pages,
      timeoutMs: config.timeoutMs,
      fetch: deps.fetch,
      signal,
    })
    emitStatus('external_links_completed', {
      url: config.url,
      message: 'Finished external link checks.',
    })
  }

  for (const page of pages) {
    if (!page.geo) continue
    page.geo = {
      ...page.geo,
      hasLlmsTxt: llmsTxt.exists,
      llmsTxtUrl: llmsTxt.url,
      llmsTxtStatus: llmsTxt.status,
    }
  }

  const report = createCrawlReport({
    config,
    projectId: input.projectId,
    site,
    ga4PropertyId: input.ga4PropertyId,
    pages,
    linkGraph,
    ai: {
      llmsTxt,
      ...(robotsTxt ? { robotsTxt } : {}),
      ...(agentResources ? { agentResources } : {}),
    },
    status: partial ? 'partial' : 'completed',
    warnings,
    caveats: cancelled
      ? ['Crawl cancelled before all queued URLs finished.']
      : pages.length >= config.maxPages
        ? [`Stopped after reaching maxPages (${config.maxPages}).`]
        : [],
    stats: {
      discoveredUrls: discovered.size,
      queuedUrls,
      crawledUrls: pages.length,
      skippedUrls,
      failedUrls,
      verifiedLinks,
    },
  })
  emitStatus('completed', {
    url: config.url,
    reportId: report.id,
    reportStatus: report.status,
    message: `Crawl ${report.status} with ${report.summary.totalPages} crawled pages.`,
  })
  await flushStatusEvents()
  return report
}

async function joinAnalytics(input: {
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

async function joinSearchMetrics(input: {
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
    if (input.pages.length && joined === 0) {
      input.warnings.push('GSC metrics joined for 0 crawled pages.')
    } else if (joined < input.pages.length) {
      input.warnings.push(
        `GSC metrics joined for ${joined} of ${input.pages.length} pages.`,
      )
    }
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
  if (input.pages.length && joined === 0) {
    input.warnings.push('GSC metrics joined for 0 crawled pages.')
  } else if (joined < input.pages.length) {
    input.warnings.push(
      `GSC metrics joined for ${joined} of ${input.pages.length} pages.`,
    )
  }
}
