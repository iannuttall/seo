import { queryPageMetrics } from '../../gsc/client.js'
import { crawlOne } from '../monitoring/crawl-page.js'
import { fetchSitemapUrls } from '../monitoring/sitemaps.js'
import {
  fetchLandingPageValues,
  landingValueForUrl,
} from '../workflows/analytics-value.js'
import { auditCrawlPages } from './audit.js'
import type { CrawlConfigInput, CrawlReport } from './report.js'
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
}): Promise<string[]> {
  const sitemapUrl = new URL('/sitemap.xml', input.url).toString()
  const sitemap = await fetchSitemapUrls({
    sitemapUrl,
    limit: input.maxPages,
  })
  input.warnings.push(...sitemap.warnings)
  return sitemap.urls
}

export async function crawlSite(input: CrawlConfigInput): Promise<CrawlReport> {
  const config = normalizeCrawlConfig(input)
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

  const enqueue = (value: string, depth: number): void => {
    const normalized = normalizeUrl(value, config.url)
    if (!normalized) {
      skippedUrls += 1
      return
    }
    discovered.add(normalized)
    if (queued.has(normalized) || visited.has(normalized)) return
    if (!sameOrigin(normalized, origin)) {
      skippedUrls += 1
      return
    }
    if (isLikelyAsset(normalized)) {
      skippedUrls += 1
      return
    }
    if (!passesFilters(normalized, config.include, config.exclude)) {
      skippedUrls += 1
      return
    }
    if (queue.length + visited.size + inFlight.size >= config.maxPages * 5) {
      skippedUrls += 1
      return
    }
    queued.add(normalized)
    queuedUrls += 1
    queue.push({ url: normalized, depth })
  }

  if (config.mode !== 'sitemap') {
    const seeds = config.mode === 'list' ? config.urls : [config.url]
    for (const seed of seeds) {
      enqueue(seed, 0)
    }
  }

  if (
    config.useSitemap &&
    (config.mode === 'site' || config.mode === 'sitemap')
  ) {
    for (const url of await sitemapSeeds({
      url: config.url,
      maxPages: config.maxPages,
      warnings,
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
      promise: crawlOne(item.url, {
        js: config.js,
        timeoutMs: config.timeoutMs,
        rate: { concurrency: config.concurrency },
      }).then((result) => ({
        task,
        result,
      })),
    }
    inFlight.add(task)
  }

  while ((queue.length || inFlight.size) && pages.length < config.maxPages) {
    while (
      inFlight.size < config.concurrency &&
      pages.length + inFlight.size < config.maxPages
    ) {
      const item = nextQueueItem()
      if (!item) break
      startTask(item)
    }

    if (!inFlight.size) break

    const { task, result } = await Promise.race(
      [...inFlight].map((item) => item.promise),
    )
    inFlight.delete(task)

    if (result.warning) {
      warnings.push(result.warning)
      failedUrls += 1
      continue
    }
    if (!result.page) {
      failedUrls += 1
      continue
    }
    if (config.respectRobots && result.page.robotsTxt?.allowed === false) {
      warnings.push(
        `${result.page.url}: skipped because robots.txt disallows it`,
      )
      skippedUrls += 1
      continue
    }

    result.page.crawlDepth = task.depth
    pages.push(result.page)
    linkGraph[result.page.url] = result.urls
    linkGraph[result.page.finalUrl] = result.urls
    verifiedLinks += result.urls.length

    if (followLinks && task.depth < config.maxDepth) {
      for (const url of result.urls) {
        enqueue(url, task.depth + 1)
      }
    }
  }

  const partial =
    pages.length >= config.maxPages ||
    queue.length > 0 ||
    inFlight.size > 0 ||
    warnings.length > 0

  if (site) {
    await joinSearchMetrics({
      site,
      pages,
      warnings,
      limit: input.searchMetricsLimit ?? 25,
    })
  }
  if (input.ga4PropertyId) {
    await joinAnalytics({
      propertyId: input.ga4PropertyId,
      pages,
      warnings,
      limit: input.analyticsLimit ?? 5000,
    })
  }

  return createCrawlReport({
    config,
    projectId: input.projectId,
    site,
    ga4PropertyId: input.ga4PropertyId,
    pages,
    issues: auditCrawlPages(pages),
    linkGraph,
    status: partial ? 'partial' : 'completed',
    warnings,
    caveats:
      pages.length >= config.maxPages
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
}

async function joinAnalytics(input: {
  propertyId: string
  pages: CrawlReport['pages']
  warnings: string[]
  limit: number
}): Promise<void> {
  const endDate = new Date()
  endDate.setUTCDate(endDate.getUTCDate() - 4)
  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - 27)

  const analytics = await fetchLandingPageValues({
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
    const value = landingValueForUrl(analytics.values, page.finalUrl)
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
}): Promise<void> {
  const pages = input.pages.slice(0, input.limit)
  for (const page of pages) {
    try {
      const metrics = await queryPageMetrics(input.site, page.finalUrl)
      if (metrics) page.searchMetrics = metrics
    } catch (error) {
      input.warnings.push(
        `GSC metrics skipped: ${error instanceof Error ? error.message : String(error)}`,
      )
      return
    }
  }
  if (input.pages.length > pages.length) {
    input.warnings.push(
      `GSC metrics joined for ${pages.length} of ${input.pages.length} pages.`,
    )
  }
}
