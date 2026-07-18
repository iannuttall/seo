import { SEO_CRAWLER_USER_AGENT } from '../../fetch/crawler-identity.js'
import { createRobotsSession } from '../../fetch/page-fetcher/robots.js'
import { createPageRenderer } from '../../fetch/page-fetcher.js'
import type { CrawlOneResult } from '../monitoring/crawl-page.js'
import { crawlCaveats } from './crawl-caveats.js'
import { CRAWL_CANCELLED, cancellationRace } from './crawl-control.js'
import type { CrawlSkipReason } from './crawl-skip-reasons.js'
import { CrawlUrlQueue, type CrawlUrlQueueItem } from './crawl-url-queue.js'
import { verifyExternalLinks } from './external-link-checks.js'
import { resolveLinkCountAliases } from './link-graph.js'
import type {
  CrawlConfigInput,
  CrawlReport,
  CrawlSitemapDiscovery,
  CrawlStatusEvent,
  CrawlStatusPhase,
} from './report.js'
import {
  assertCrawlConfigLimits,
  createCrawlReport,
  normalizeCrawlConfig,
} from './report.js'
import { observationFromPage } from './request-evidence.js'
import { collectCrawlAiSignals } from './site-crawl-ai-signals.js'
import {
  crawlDataSources,
  crawlProviderLimits,
} from './site-crawl-data-sources.js'
import {
  type CrawlSiteDependencies,
  resolveCrawlSiteDependencies,
} from './site-crawl-dependencies.js'
import { sitemapSeeds } from './sitemap-discovery.js'

type CrawlTask = CrawlUrlQueueItem & {
  promise: Promise<{
    task: CrawlTask
    result: CrawlOneResult
  }>
}

export type { CrawlSiteDependencies } from './site-crawl-dependencies.js'

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
  return (
    (!include.length || include.some((pattern) => globMatch(pattern, url))) &&
    !exclude.some((pattern) => globMatch(pattern, url))
  )
}

export async function crawlSite(
  input: CrawlConfigInput,
  dependencies?: CrawlSiteDependencies,
): Promise<CrawlReport> {
  const deps = resolveCrawlSiteDependencies(dependencies)
  const config = assertCrawlConfigLimits(normalizeCrawlConfig(input))
  const { searchMetricsLimit, analyticsLimit } = crawlProviderLimits(input)
  const signal = input.signal
  let cancelled = Boolean(signal?.aborted)
  const isCancelled = (): boolean => cancelled || Boolean(signal?.aborted)
  const site = input.site
  const origin = new URL(config.url).origin
  const warnings: string[] = []
  const queue = new CrawlUrlQueue()
  const visited = new Set<string>()
  const discovered = new Set<string>()
  const incomingLinkCounts = new Map<string, number>()
  const fetchedAliases = new Map<string, string>()
  const pages: CrawlReport['pages'] = []
  const requests: CrawlReport['requests'] = []
  const documentIndexes = new Map<
    string,
    {
      index: number
      directlyRequested: boolean
      sourceRequest: string
      pendingAliasLinks?: Set<string>
      minDepth: number
    }
  >()
  const inFlight = new Set<CrawlTask>()
  const followLinks = config.mode === 'site'
  const healthStrategy = config.strategy === 'health'
  let activeConcurrency = healthStrategy ? 1 : config.concurrency
  let healthyProbeStreak = 0
  let queuedUrls = 0
  let skippedUrls = 0
  const skipReasonCounts: Partial<Record<CrawlSkipReason, number>> = {}
  const recordSkip = (reason: CrawlSkipReason): void => {
    skippedUrls += 1
    skipReasonCounts[reason] = (skipReasonCounts[reason] ?? 0) + 1
  }
  let robotsDeferredUrls = 0
  let originBackpressureSkippedUrls = 0
  let queueSafetySkippedUrls = 0
  let failedUrls = 0
  let observedInternalLinks = 0
  let sitemapDiscovery: CrawlSitemapDiscovery | undefined
  let externalLinkVerification:
    | CrawlReport['externalLinkVerification']
    | undefined
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
      pendingUrls: queue.size,
      inFlightUrls: inFlight.size,
      crawledUrls: pages.length,
      skippedUrls,
      failedUrls,
      observedInternalLinks,
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
  const renderer =
    config.js === 'off' || healthStrategy
      ? undefined
      : createPageRenderer({ concurrency: config.concurrency })
  const robotsSession = healthStrategy
    ? createRobotsSession({
        refresh: true,
        writeCache: false,
        timeoutMs: config.timeoutMs,
        signal,
      })
    : undefined
  const robotsResolver = robotsSession?.resolve

  try {
    emitStatus('started', {
      url: config.url,
      message: `Started crawl for ${config.url}.`,
    })

    const aiSignals =
      isCancelled() || healthStrategy
        ? undefined
        : await collectCrawlAiSignals({
            url: config.url,
            timeoutMs: config.timeoutMs,
            fetch: deps.fetch,
            signal,
          })
    const llmsTxt = aiSignals?.[0]
    const healthSitemapUrls =
      healthStrategy && !config.sitemapUrl && !isCancelled()
        ? await robotsSession?.sitemapUrls(origin)
        : undefined
    const robotsTxt = aiSignals?.[1]
    const agentResources = aiSignals?.[2]
    cancelled = isCancelled()

    const enqueue = (value: string, depth: number): void => {
      const normalized = normalizeUrl(value, config.url)
      if (!normalized) {
        recordSkip('invalid-url')
        emitStatus('url_skipped', {
          url: value,
          depth,
          reason: 'invalid_url',
        })
        return
      }
      if (visited.has(normalized)) return
      if (queue.has(normalized)) {
        queue.decreaseDepth(normalized, depth)
        return
      }
      if (!sameOrigin(normalized, origin)) {
        recordSkip('off-origin')
        emitStatus('url_skipped', {
          url: normalized,
          depth,
          reason: 'off_origin',
        })
        return
      }
      if (isLikelyAsset(normalized)) {
        recordSkip('asset-url')
        emitStatus('url_skipped', {
          url: normalized,
          depth,
          reason: 'asset_url',
        })
        return
      }
      if (!passesFilters(normalized, config.include, config.exclude)) {
        recordSkip('configured-exclusion')
        emitStatus('url_skipped', {
          url: normalized,
          depth,
          reason: 'filtered_url',
        })
        return
      }
      if (queue.size + visited.size + inFlight.size >= config.maxPages * 5) {
        recordSkip('queue-safety-limit')
        queueSafetySkippedUrls += 1
        emitStatus('url_skipped', {
          url: normalized,
          depth,
          reason: 'queue_safety_limit',
        })
        return
      }
      discovered.add(normalized)
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
      const sitemap = await sitemapSeeds({
        url: config.url,
        sitemapUrl: config.sitemapUrl,
        maxPages: config.maxPages,
        declaredSitemapUrls: robotsTxt?.sitemapUrls ?? healthSitemapUrls ?? [],
        warnings,
        fetchSitemapUrls: deps.fetchSitemapUrls,
      })
      for (const url of sitemap.urls) {
        enqueue(url, 0)
      }
      sitemapDiscovery = sitemap.discovery
    }

    const nextQueueItem = (): CrawlUrlQueueItem | undefined => {
      while (queue.size) {
        const item = queue.take()
        if (!item) continue
        const normalized = normalizeUrl(item.url, config.url)
        if (!normalized) continue
        if (visited.has(normalized)) continue
        visited.add(normalized)
        return { url: normalized, depth: item.depth }
      }
      return undefined
    }

    const startTask = (item: CrawlUrlQueueItem): void => {
      let task: CrawlTask
      const fetcher = healthStrategy ? deps.fetchStatusPage : deps.fetchPage
      task = {
        ...item,
        promise: fetcher(item.url, {
          js: config.js,
          refresh: config.refresh,
          timeoutMs: config.timeoutMs,
          rate: config.fetchRate,
          signal,
          respectRobots: config.respectRobots,
          robotsResolver,
          renderer,
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
      (queue.size || inFlight.size) &&
      pages.length < config.maxPages
    ) {
      while (
        !isCancelled() &&
        inFlight.size < activeConcurrency &&
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

      if (healthStrategy) {
        const healthy =
          request.outcome === 'response' &&
          request.status < 400 &&
          !request.accessBlock
        if (healthy) {
          healthyProbeStreak += 1
          activeConcurrency = Math.min(
            config.concurrency,
            1 + Math.floor(healthyProbeStreak / 20),
          )
        } else {
          healthyProbeStreak = 0
          activeConcurrency = 1
        }
      }

      if (request.outcome === 'skipped') {
        recordSkip(
          request.reason === 'robots-disallowed'
            ? 'robots-disallowed'
            : request.reason === 'robots-deferred'
              ? 'robots-uncertain'
              : 'origin-backpressure',
        )
        if (request.reason === 'robots-deferred') {
          robotsDeferredUrls += 1
          warnings.push(
            `${task.url}: crawl deferred because robots.txt availability is unknown.`,
          )
        }
        if (request.reason === 'origin-backpressure') {
          originBackpressureSkippedUrls += 1
        }
        emitStatus('page_skipped', {
          url: task.url,
          depth: task.depth,
          reason: request.reason,
        })
        continue
      }

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
      const requestedUrl = normalizeUrl(task.url, config.url)
      if (requestedUrl && requestedUrl !== finalUrl) {
        fetchedAliases.set(requestedUrl, finalUrl)
      }
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
          const minDepth = Math.min(existing.minDepth, task.depth)
          const replace =
            (!existing.directlyRequested && directlyRequested) ||
            (existing.directlyRequested === directlyRequested &&
              sourceRequest < existing.sourceRequest)
          if (replace) {
            const existingPage = pages[existing.index]
            const previousLinks =
              existing.pendingAliasLinks ??
              (existingPage &&
              existingPage.outgoingInternalCount ===
                existingPage.sampleInternalLinks?.length
                ? new Set(existingPage.sampleInternalLinks)
                : undefined)
            const links = new Set(normalizedLinks)
            if (previousLinks) {
              for (const target of previousLinks) {
                const nextCount = (incomingLinkCounts.get(target) ?? 0) - 1
                if (nextCount > 0) incomingLinkCounts.set(target, nextCount)
                else incomingLinkCounts.delete(target)
              }
              observedInternalLinks -= previousLinks.size
            }
            for (const target of links) {
              incomingLinkCounts.set(
                target,
                (incomingLinkCounts.get(target) ?? 0) + 1,
              )
            }
            observedInternalLinks += links.size
            syncLinkEvidence(page, links)
            page.crawlDepth = minDepth
            pages[existing.index] = page
          } else {
            const existingPage = pages[existing.index]
            if (existingPage) existingPage.crawlDepth = minDepth
          }
          documentIndexes.set(finalUrl, {
            ...existing,
            directlyRequested: existing.directlyRequested || directlyRequested,
            sourceRequest: replace ? sourceRequest : existing.sourceRequest,
            pendingAliasLinks: undefined,
            minDepth,
          })
        } else {
          const links = new Set(normalizedLinks)
          syncLinkEvidence(page, links)
          pages.push(page)
          observedInternalLinks += links.size
          for (const target of links) {
            incomingLinkCounts.set(
              target,
              (incomingLinkCounts.get(target) ?? 0) + 1,
            )
          }
          documentIndexes.set(finalUrl, {
            index: pages.length - 1,
            directlyRequested,
            sourceRequest,
            pendingAliasLinks: !directlyRequested ? links : undefined,
            minDepth: task.depth,
          })
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
        recordSkip('robots-disallowed')
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

    const resolvedInlinkCounts = resolveLinkCountAliases(
      incomingLinkCounts,
      fetchedAliases,
    )
    let maxInlinks = 0
    for (const page of pages) {
      maxInlinks = Math.max(
        maxInlinks,
        resolvedInlinkCounts.get(page.finalUrl) ?? 0,
      )
    }
    for (const page of pages) {
      const internalInlinkCount = resolvedInlinkCounts.get(page.finalUrl) ?? 0
      page.internalInlinkCount = internalInlinkCount
      page.internalLinkAuthorityScore = maxInlinks
        ? Math.round((internalInlinkCount / maxInlinks) * 100)
        : 0
    }

    cancelled = isCancelled()
    const robotsDisallowed = skipReasonCounts['robots-disallowed'] ?? 0
    if (robotsDisallowed > 0) {
      warnings.push(
        `${robotsDisallowed} URL${robotsDisallowed === 1 ? '' : 's'} disallowed ${SEO_CRAWLER_USER_AGENT} in robots.txt. If the audit should reach them, allow the SEO-Skill token on only those public paths.`,
      )
    }
    if (cancelled) {
      warnings.push('Crawl cancelled; returning a partial report.')
      emitStatus('cancelled', {
        url: config.url,
        message: 'Crawl cancelled; returning a partial report.',
      })
    }

    const pageLimitReached =
      pages.length >= config.maxPages && (queue.size > 0 || inFlight.size > 0)
    const sitemapEvidencePartial = sitemapDiscovery?.dataStatus === 'partial'
    const accessEvidencePartial = requests.some(
      (request) => request.outcome === 'response' && request.accessBlock,
    )
    const requiredSitemapUnavailable =
      config.mode === 'sitemap' &&
      sitemapDiscovery?.dataStatus === 'unavailable'
    const partial =
      cancelled ||
      failedUrls > 0 ||
      pageLimitReached ||
      robotsDeferredUrls > 0 ||
      originBackpressureSkippedUrls > 0 ||
      queueSafetySkippedUrls > 0 ||
      queue.size > 0 ||
      inFlight.size > 0 ||
      sitemapEvidencePartial ||
      accessEvidencePartial ||
      requiredSitemapUnavailable
    const failed =
      !cancelled &&
      pages.length === 0 &&
      (requiredSitemapUnavailable ||
        (requests.length > 0 &&
          requests.every((request) => request.outcome === 'failure')))
    const requestEvidenceStatus =
      cancelled && inFlight.size > 0 ? 'partial' : 'available'

    const dataSources = await crawlDataSources({
      cancelled,
      site: healthStrategy ? undefined : site,
      googleAnalyticsPropertyId: healthStrategy
        ? undefined
        : input.googleAnalyticsPropertyId,
      pages,
      warnings,
      searchMetricsLimit,
      analyticsLimit,
      now: deps.now,
      queryPageMetrics: deps.queryPageMetrics,
      queryPageTopQuery: deps.queryPageTopQuery,
      queryPagesMetrics: deps.queryPagesMetrics,
      queryPagesTopQueries: deps.queryPagesTopQueries,
      queryPagesMetricsBatch: deps.queryPagesMetricsBatch,
      queryPagesTopQueriesBatch: deps.queryPagesTopQueriesBatch,
      fetchLandingPageValues: deps.fetchLandingPageValues,
      landingValueForUrl: deps.landingValueForUrl,
    })
    const sourceEvidencePartial = [
      dataSources.searchConsole.status,
      dataSources.analytics.status,
    ].some((status) => status === 'partial' || status === 'unavailable')
    const reportStatus = failed
      ? 'failed'
      : partial || sourceEvidencePartial
        ? 'partial'
        : 'completed'
    if (!cancelled && config.checkExternal) {
      emitStatus('external_links_started', {
        url: config.url,
        message: 'Started external link checks.',
      })
      externalLinkVerification = await verifyExternalLinks({
        pages,
        timeoutMs: config.timeoutMs,
        fetch: deps.fetch,
        signal,
      })
      warnings.push(...externalLinkVerification.warnings)
      emitStatus('external_links_completed', {
        url: config.url,
        message: 'Finished external link checks.',
      })
    }

    const agentDiscovery =
      !cancelled && config.checkAgentDiscovery
        ? await deps.collectAgentDiscovery({
            startUrl: config.url,
            pages,
            timeoutMs: config.timeoutMs,
            fetch: deps.fetch,
            signal,
            concurrency: Math.min(config.concurrency, 4),
          })
        : undefined

    for (const page of pages) {
      if (!page.geo || !llmsTxt) continue
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
      googleAnalyticsPropertyId: input.googleAnalyticsPropertyId,
      dataSources,
      pages,
      requests,
      requestEvidenceStatus,
      ...(!healthStrategy
        ? {
            ai: {
              ...(llmsTxt ? { llmsTxt } : {}),
              ...(robotsTxt ? { robotsTxt } : {}),
              ...(agentResources ? { agentResources } : {}),
            },
          }
        : {}),
      ...(sitemapDiscovery ? { sitemapDiscovery } : {}),
      ...(externalLinkVerification ? { externalLinkVerification } : {}),
      ...(agentDiscovery ? { agentDiscovery } : {}),
      status: reportStatus,
      warnings,
      caveats: crawlCaveats({
        cancelled,
        pageLimitReached,
        maxPages: config.maxPages,
        queueSafetySkippedUrls,
        originBackpressureSkippedUrls,
      }),
      stats: {
        discoveredUrls: discovered.size,
        queuedUrls,
        crawledUrls: pages.length,
        skippedUrls,
        skipReasonCounts,
        failedUrls,
        observedInternalLinks,
        pageLimitReached,
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
  } finally {
    await renderer?.close()
  }
}
