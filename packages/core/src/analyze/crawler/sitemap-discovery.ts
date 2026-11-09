import { explainRule } from '../../rules.js'
import type { fetchSitemapUrls } from '../monitoring/sitemaps.js'
import type { CrawlIssue, CrawlSitemapDiscovery } from './report.js'

const MAX_SITEMAP_ROOTS = 20
const OFF_HOST_SAMPLES = 5

type SitemapRoot = CrawlSitemapDiscovery['roots'][number]

const siteHost = (hostname: string) => hostname.replace(/^www\./, '')

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    /^127\.\d+\.\d+\.\d+$/.test(hostname)
  )
}

// Sitemap URLs on a host other than the site's, such as localhost left by a
// build. www and the bare domain count as the same site.
function offHostUrls(
  urls: string[],
  siteUrl: string,
): SitemapRoot['offHost'] | undefined {
  const site = siteHost(new URL(siteUrl).hostname)
  const off = urls.filter((url) => {
    try {
      return siteHost(new URL(url).hostname) !== site
    } catch {
      return false
    }
  })
  if (!off.length) return undefined
  const hosts = [...new Set(off.map((url) => new URL(url).host))].sort()
  return {
    count: off.length,
    localhost: off.filter((url) => isLocalHost(new URL(url).hostname)).length,
    hosts: hosts.slice(0, OFF_HOST_SAMPLES),
    samples: off.slice(0, OFF_HOST_SAMPLES),
  }
}

function withOffHost(urls: string[], siteUrl: string) {
  const offHost = offHostUrls(urls, siteUrl)
  return offHost ? { offHost } : {}
}

export function sitemapHostIssues(
  discovery: CrawlSitemapDiscovery,
  siteUrl: string,
): CrawlIssue[] {
  const rule = explainRule('sitemap_url_off_host')
  if (!rule) throw new Error('Missing rule guidance for sitemap_url_off_host')
  const host = new URL(siteUrl).host
  return discovery.roots.flatMap((root) => {
    const off = root.offHost
    if (!off) return []
    const where = off.localhost
      ? `${off.localhost === off.count ? '' : `${off.localhost} of them `}on localhost (${off.hosts.join(', ')})`
      : `on ${off.hosts.join(', ')}`
    return [
      {
        ruleId: rule.id,
        title: rule.title,
        category: rule.category,
        severity: rule.defaultSeverity,
        url: root.url,
        detail: `${off.count} of ${root.urlsReturned} URLs read from this sitemap are ${where}, not ${host}.`,
        evidence: off,
      },
    ]
  })
}

function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

function sitemapRootUrls(input: {
  url: string
  sitemapUrl?: string
  declaredSitemapUrls: string[]
  warnings: string[]
}): Array<{
  url: string
  source: 'explicit' | 'robots-txt' | 'default-path'
}> {
  if (input.sitemapUrl) {
    return [{ url: new URL(input.sitemapUrl).toString(), source: 'explicit' }]
  }
  const origin = new URL(input.url).origin
  const declared = input.declaredSitemapUrls.filter((url) =>
    isSameOrigin(url, origin),
  )
  const ignored = input.declaredSitemapUrls.length - declared.length
  if (ignored > 0) {
    input.warnings.push(
      `Ignored ${ignored} robots.txt sitemap declaration${ignored === 1 ? '' : 's'} outside the crawl origin.`,
    )
  }

  const unique = [...new Set(declared)].map((url) => ({
    url,
    source: 'robots-txt' as const,
  }))
  if (unique.length > MAX_SITEMAP_ROOTS) {
    input.warnings.push(
      `Used the first ${MAX_SITEMAP_ROOTS} robots.txt sitemap declarations to keep discovery bounded.`,
    )
  }
  if (unique.length > 0) return unique.slice(0, MAX_SITEMAP_ROOTS)

  return [
    {
      url: new URL('/sitemap.xml', input.url).toString(),
      source: 'default-path',
    },
  ]
}

function sitemapDiscoveryStatus(
  roots: CrawlSitemapDiscovery['roots'],
): CrawlSitemapDiscovery['dataStatus'] {
  if (!roots.some((root) => root.dataStatus !== 'unavailable')) {
    return 'unavailable'
  }
  return roots.every((root) => root.dataStatus === 'complete')
    ? 'complete'
    : 'partial'
}

/** How many sitemap URLs a crawl reads to pick its sample from. */
export function sitemapReadLimit(maxPages: number): number {
  return Math.min(50_000, Math.max(10_000, maxPages * 10))
}

function sectionOf(url: string): string {
  try {
    return new URL(url).pathname.split('/')[1]?.toLowerCase() ?? ''
  } catch {
    return ''
  }
}

function pathDepth(url: string): number {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).length
  } catch {
    return 0
  }
}

/**
 * Picks up to `limit` URLs round-robin across sections (the first path
 * segment), so one large section such as a forum cannot fill a capped crawl.
 * Within a section, shallower paths come first, then URL order.
 */
export function spreadSitemapSample(
  urls: string[],
  limit: number,
): { urls: string[]; sections: number } {
  const groups = new Map<string, string[]>()
  for (const url of urls) {
    const key = sectionOf(url)
    const group = groups.get(key)
    if (group) group.push(url)
    else groups.set(key, [url])
  }
  const ordered = [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, group]) =>
      group
        .map((url) => ({ url, depth: pathDepth(url) }))
        .sort(
          (left, right) =>
            left.depth - right.depth ||
            (left.url < right.url ? -1 : left.url > right.url ? 1 : 0),
        )
        .map((entry) => entry.url),
    )
  const picked: string[] = []
  for (let index = 0; picked.length < limit; index += 1) {
    let added = false
    for (const group of ordered) {
      const url = group[index]
      if (url === undefined) continue
      added = true
      picked.push(url)
      if (picked.length >= limit) break
    }
    if (!added) break
  }
  return { urls: picked, sections: groups.size }
}

export type SitemapSampleCaveat = {
  checked: number
  read: number
  sections: number
}

/**
 * The sitemap URLs a capped crawl checks, leaving room for the seed URLs, and
 * how they were picked when the sitemaps listed more.
 */
export function sitemapCrawlSample(
  urls: string[],
  maxPages: number,
  seedUrls: Set<string>,
  normalize: (url: string) => string | undefined,
): { urls: string[]; caveat?: SitemapSampleCaveat } {
  const candidates = urls.filter((url) => !seedUrls.has(normalize(url) ?? url))
  const sample = spreadSitemapSample(
    candidates,
    Math.max(0, maxPages - seedUrls.size),
  )
  return candidates.length > sample.urls.length
    ? {
        urls: sample.urls,
        caveat: {
          checked: sample.urls.length,
          read: candidates.length,
          sections: sample.sections,
        },
      }
    : { urls: sample.urls }
}

export async function sitemapSeeds(input: {
  url: string
  sitemapUrl?: string
  maxPages: number
  declaredSitemapUrls: string[]
  warnings: string[]
  fetchSitemapUrls: typeof fetchSitemapUrls
}): Promise<{ urls: string[]; discovery: CrawlSitemapDiscovery }> {
  const roots: CrawlSitemapDiscovery['roots'] = []
  const urls = new Set<string>()
  const rootUrls = sitemapRootUrls(input)

  for (const root of rootUrls) {
    const sitemap = await input.fetchSitemapUrls({
      sitemapUrl: root.url,
      limit: input.maxPages,
    })
    input.warnings.push(...sitemap.warnings)
    for (const url of sitemap.urls) urls.add(url)
    roots.push({
      url: sitemap.sitemapUrl,
      source: root.source,
      dataStatus:
        sitemap.source.sitemapsFetched > 0 ? sitemap.dataStatus : 'unavailable',
      urlsReturned: sitemap.urls.length,
      sitemapsFetched: sitemap.source.sitemapsFetched,
      lastmods: sitemap.source.lastmods,
      documents: sitemap.source.documents,
      possiblyTruncated: sitemap.truncation.possiblyTruncated,
      warnings: sitemap.warnings,
      ...withOffHost(sitemap.urls, input.url),
    })
  }

  if (
    urls.size === 0 &&
    rootUrls.some((root) => root.source === 'robots-txt')
  ) {
    const fallbackUrl = new URL('/sitemap.xml', input.url).toString()
    if (!roots.some((root) => root.url === fallbackUrl)) {
      input.warnings.push(
        'No robots.txt sitemap declaration returned URLs, so the crawler also tried /sitemap.xml.',
      )
      const sitemap = await input.fetchSitemapUrls({
        sitemapUrl: fallbackUrl,
        limit: input.maxPages,
      })
      input.warnings.push(...sitemap.warnings)
      for (const url of sitemap.urls) urls.add(url)
      roots.push({
        url: sitemap.sitemapUrl,
        source: 'default-path',
        dataStatus:
          sitemap.source.sitemapsFetched > 0
            ? sitemap.dataStatus
            : 'unavailable',
        urlsReturned: sitemap.urls.length,
        sitemapsFetched: sitemap.source.sitemapsFetched,
        lastmods: sitemap.source.lastmods,
        documents: sitemap.source.documents,
        possiblyTruncated: sitemap.truncation.possiblyTruncated,
        warnings: sitemap.warnings,
        ...withOffHost(sitemap.urls, input.url),
      })
    }
  }

  return {
    urls: [...urls],
    discovery: {
      dataStatus: sitemapDiscoveryStatus(roots),
      urlsReturned: urls.size,
      roots,
    },
  }
}
