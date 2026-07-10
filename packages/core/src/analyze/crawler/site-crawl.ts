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
import {
  abortController,
  CRAWL_CANCELLED,
  cancellationRace,
} from './crawl-control.js'
import type {
  CrawlConfigInput,
  CrawlReport,
  CrawlStatusEvent,
  CrawlStatusPhase,
} from './report.js'
import { createCrawlReport, normalizeCrawlConfig } from './report.js'
import { observationFromPage } from './request-evidence.js'
import { joinAnalytics, joinSearchMetrics } from './site-crawl-providers.js'

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
  const requests: CrawlReport['requests'] = []
  const documentIndexes = new Map<
    string,
    {
      index: number
      directlyRequested: boolean
      sourceRequest: string
      links: Set<string>
      minDepth: number
    }
  >()
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
    if (visited.has(normalized)) return
    if (queued.has(normalized)) {
      const existing = queue.find((item) => item.url === normalized)
      if (existing && depth < existing.depth) existing.depth = depth
      queue.sort(
        (left, right) =>
          left.depth - right.depth ||
          (left.url < right.url ? -1 : left.url > right.url ? 1 : 0),
      )
      return
    }
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
    queue.sort(
      (left, right) =>
        left.depth - right.depth ||
        (left.url < right.url ? -1 : left.url > right.url ? 1 : 0),
    )
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
            request: {
              requestedUrl: item.url,
              outcome: 'failure' as const,
              failureKind: 'unknown' as const,
              error: error instanceof Error ? error.message : String(error),
              extraction: 'not-applicable' as const,
            },
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

    const request =
      result.request ??
      (result.page
        ? observationFromPage(task.url, result.page)
        : {
            requestedUrl: task.url,
            outcome: 'failure' as const,
            failureKind: 'unknown' as const,
            error: result.warning ?? 'Crawler returned no page snapshot.',
            extraction: 'not-applicable' as const,
          })
    requests.push(request)

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
    const page = result.page
    const finalUrl = normalizeUrl(page.finalUrl, config.url)
    if (!finalUrl) {
      failedUrls += 1
      warnings.push(`${task.url}: invalid final URL ${page.finalUrl}`)
      emitStatus('page_failed', {
        url: task.url,
        depth: task.depth,
        reason: 'invalid_final_url',
      })
      continue
    }
    page.url = finalUrl
    page.finalUrl = finalUrl
    page.crawlDepth = task.depth
    page.contentAuditAllowed =
      !config.respectRobots || page.robotsTxt?.allowed !== false

    const storeDocument = (urls: string[]): void => {
      const sourceRequest = normalizeUrl(task.url, config.url) ?? task.url
      const directlyRequested = sourceRequest === finalUrl
      const normalizedLinks = urls
        .map((url) => normalizeUrl(url, finalUrl))
        .filter((url): url is string => Boolean(url))
      const syncLinkEvidence = (
        target: CrawlReport['pages'][number],
        links: Set<string>,
      ): void => {
        const sortedLinks = [...links].sort((left, right) =>
          left < right ? -1 : left > right ? 1 : 0,
        )
        target.outgoingInternalCount = sortedLinks.length
        target.sampleInternalLinks = sortedLinks.slice(0, 25)
      }
      const existing = documentIndexes.get(finalUrl)
      if (existing) {
        const links = new Set([...existing.links, ...normalizedLinks])
        const minDepth = Math.min(existing.minDepth, task.depth)
        const replace =
          (!existing.directlyRequested && directlyRequested) ||
          (existing.directlyRequested === directlyRequested &&
            sourceRequest < existing.sourceRequest)
        if (replace) {
          page.crawlDepth = minDepth
          pages[existing.index] = page
        } else {
          const existingPage = pages[existing.index]
          if (existingPage) existingPage.crawlDepth = minDepth
        }
        const retainedPage = pages[existing.index]
        if (retainedPage) syncLinkEvidence(retainedPage, links)
        verifiedLinks += links.size - existing.links.size
        documentIndexes.set(finalUrl, {
          ...existing,
          directlyRequested: existing.directlyRequested || directlyRequested,
          sourceRequest: replace ? sourceRequest : existing.sourceRequest,
          links,
          minDepth,
        })
        linkGraph[finalUrl] = [...links].sort((left, right) =>
          left < right ? -1 : left > right ? 1 : 0,
        )
      } else {
        const links = new Set(normalizedLinks)
        syncLinkEvidence(page, links)
        pages.push(page)
        verifiedLinks += links.size
        documentIndexes.set(finalUrl, {
          index: pages.length - 1,
          directlyRequested,
          sourceRequest,
          links,
          minDepth: task.depth,
        })
        linkGraph[finalUrl] = [...links].sort((left, right) =>
          left < right ? -1 : left > right ? 1 : 0,
        )
      }
    }

    if (config.respectRobots && page.robotsTxt?.allowed === false) {
      page.blocked = true
      page.contentAuditAllowed = false
      page.indexable = false
      page.indexability = 'Robots.txt disallowed'
      page.declaredIndexability = 'robots-blocked'
      storeDocument([])
      warnings.push(`${page.url}: skipped because robots.txt disallows it`)
      skippedUrls += 1
      emitStatus('page_skipped', {
        url: page.url,
        depth: task.depth,
        statusCode: page.status,
        reason: 'robots_txt_disallowed',
      })
      continue
    }

    storeDocument(result.urls)
    emitStatus('page_completed', {
      url: task.url,
      depth: task.depth,
      statusCode: page.status,
    })

    if (followLinks && task.depth < config.maxDepth) {
      for (const url of result.urls) {
        enqueue(url, task.depth + 1)
      }
    }
  }

  const pageIndexes = new Map(
    pages.map((page, index) => [page.url, index] as const),
  )
  const depths = pages.map((page) => page.crawlDepth ?? 0)
  for (let pass = 0; pass < pages.length; pass += 1) {
    let changed = false
    for (const [sourceUrl, targets] of Object.entries(linkGraph)) {
      const sourceIndex = pageIndexes.get(sourceUrl)
      if (sourceIndex === undefined) continue
      for (const target of targets) {
        const targetIndex = pageIndexes.get(target)
        if (targetIndex === undefined) continue
        const nextDepth = (depths[sourceIndex] ?? 0) + 1
        if (nextDepth >= (depths[targetIndex] ?? Number.POSITIVE_INFINITY)) {
          continue
        }
        depths[targetIndex] = nextDepth
        changed = true
      }
    }
    if (!changed) break
  }
  for (const [index, page] of pages.entries()) {
    page.crawlDepth = depths[index]
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
    failedUrls > 0 ||
    pages.length >= config.maxPages ||
    queue.length > 0 ||
    inFlight.size > 0 ||
    warnings.length > 0
  const failed = !cancelled && pages.length === 0 && requests.length > 0
  const requestEvidenceStatus =
    cancelled && inFlight.size > 0 ? 'partial' : 'available'

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
    requests,
    requestEvidenceStatus,
    linkGraph,
    ai: {
      llmsTxt,
      ...(robotsTxt ? { robotsTxt } : {}),
      ...(agentResources ? { agentResources } : {}),
    },
    status: failed ? 'failed' : partial ? 'partial' : 'completed',
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
