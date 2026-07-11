import type { fetchSitemapUrls } from '../monitoring/sitemaps.js'
import type { CrawlSitemapDiscovery } from './report.js'

const MAX_SITEMAP_ROOTS = 20

function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

function sitemapRootUrls(input: {
  url: string
  declaredSitemapUrls: string[]
  warnings: string[]
}): Array<{ url: string; source: 'robots-txt' | 'default-path' }> {
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

export async function sitemapSeeds(input: {
  url: string
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
