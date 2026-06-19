import { crawlOne } from '../monitoring/crawl-page.js'
import { fetchSitemapUrls } from '../monitoring/sitemaps.js'
import { auditCrawlPages } from './audit.js'
import { createCrawlReport, normalizeCrawlConfig } from './report.js'
import type { CrawlConfigInput, CrawlReport } from './report.js'

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
  const origin = new URL(config.url).origin
  const warnings: string[] = []
  const queue: QueueItem[] = []
  const visited = new Set<string>()
  const pages: CrawlReport['pages'] = []
  const inFlight = new Set<CrawlTask>()
  const followLinks = config.mode === 'site'

  if (config.mode !== 'sitemap') {
    const seeds = config.mode === 'list' ? config.urls : [config.url]
    for (const seed of seeds) {
      const normalized = normalizeUrl(seed, config.url)
      if (normalized) queue.push({ url: normalized, depth: 0 })
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
      queue.push({ url, depth: 0 })
    }
  }

  const nextQueueItem = (): QueueItem | undefined => {
    while (queue.length) {
      const item = queue.shift()
      if (!item) continue
      const normalized = normalizeUrl(item.url, config.url)
      if (!normalized) continue
      if (visited.has(normalized)) continue
      if (!sameOrigin(normalized, origin)) continue
      if (isLikelyAsset(normalized)) continue
      if (!passesFilters(normalized, config.include, config.exclude)) continue
      visited.add(normalized)
      return { url: normalized, depth: item.depth }
    }
    return undefined
  }

  const startTask = (item: QueueItem): void => {
    let task: CrawlTask
    task = {
      ...item,
      promise: crawlOne(item.url, { js: config.js }).then((result) => ({
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
      continue
    }
    if (!result.page) continue
    if (config.respectRobots && result.page.robotsTxt?.allowed === false) {
      warnings.push(
        `${result.page.url}: skipped because robots.txt disallows it`,
      )
      continue
    }

    pages.push(result.page)

    if (followLinks && task.depth < config.maxDepth) {
      for (const url of result.urls) {
        if (queue.length + visited.size >= config.maxPages * 5) break
        queue.push({ url, depth: task.depth + 1 })
      }
    }
  }

  const partial =
    pages.length >= config.maxPages ||
    queue.length > 0 ||
    inFlight.size > 0 ||
    warnings.length > 0

  return createCrawlReport({
    config,
    pages,
    issues: auditCrawlPages(pages),
    status: partial ? 'partial' : 'completed',
    warnings,
    caveats:
      pages.length >= config.maxPages
        ? [`Stopped after reaching maxPages (${config.maxPages}).`]
        : [],
  })
}
