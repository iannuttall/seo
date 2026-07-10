import { load } from 'cheerio'
import { publicHttpFetch } from '../../fetch/http-client.js'

export type SitemapInvalidLoc = {
  sitemapUrl: string
  kind: 'url' | 'sitemap'
  value: string
}

export type SitemapFetchResult = {
  sitemapUrl: string
  dataStatus: 'complete' | 'partial'
  urls: string[]
  nestedSitemaps: string[]
  source: {
    sitemapsFetched: number
    urlLocs: number
    sitemapLocs: number
    duplicateUrlLocs: number
    duplicateSitemapLocs: number
    invalidLocs: {
      count: number
      samples: SitemapInvalidLoc[]
    }
  }
  truncation: {
    possiblyTruncated: boolean
    urlLimitExceeded: boolean
    nestedSitemapLimitExceeded: boolean
    omittedUrlsAtLeast: number
    unprocessedSitemaps: number
    limits: {
      urls: number
      sitemaps: number
    }
  }
  warnings: string[]
}

export type BoundedSitemapInventory = {
  urls: string[]
  truncation: {
    possiblyTruncated: boolean
    sourceTruncated: boolean
    inventoryLimitExceeded: boolean
    omittedUrlsAtLeast: number
    limit: number
  }
}

const INVALID_LOC_SAMPLE_LIMIT = 10

function normalizeUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value.trim())
    return ['http:', 'https:'].includes(parsed.protocol)
      ? parsed.toString()
      : undefined
  } catch {
    return undefined
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return value
}

async function fetchSitemapXml(sitemapUrl: string): Promise<string> {
  const response = await publicHttpFetch(sitemapUrl, { profile: 'browser' })
  if (!response.ok) {
    throw new Error(
      `Sitemap fetch failed for ${sitemapUrl}: ${response.status}`,
    )
  }
  return response.text()
}

export function boundedSitemapInventory(
  results: Array<Pick<SitemapFetchResult, 'urls' | 'truncation'>>,
  limit: number,
): BoundedSitemapInventory {
  const inventoryLimit = positiveInteger(limit, 'limit')
  const uniqueUrls = [...new Set(results.flatMap((result) => result.urls))]
  const sourceTruncated = results.some(
    (result) => result.truncation.possiblyTruncated,
  )
  const inventoryLimitExceeded = uniqueUrls.length > inventoryLimit
  return {
    urls: uniqueUrls.slice(0, inventoryLimit),
    truncation: {
      possiblyTruncated: sourceTruncated || inventoryLimitExceeded,
      sourceTruncated,
      inventoryLimitExceeded,
      omittedUrlsAtLeast: Math.max(0, uniqueUrls.length - inventoryLimit),
      limit: inventoryLimit,
    },
  }
}

export async function fetchSitemapUrls(input: {
  sitemapUrl: string
  limit?: number
  maxNested?: number
}): Promise<SitemapFetchResult> {
  const warnings: string[] = []
  const urls: string[] = []
  const seenUrls = new Set<string>()
  const nestedSitemaps: string[] = []
  const discoveredSitemaps = new Set<string>()
  const scheduledSitemaps = new Set<string>()
  const invalidLocSamples: SitemapInvalidLoc[] = []
  const queue: string[] = []
  const limit = positiveInteger(input.limit ?? 50_000, 'limit')
  const maxNested = positiveInteger(input.maxNested ?? 50, 'maxNested')
  const rootSitemap = normalizeUrl(input.sitemapUrl)
  if (!rootSitemap) {
    throw new Error('sitemapUrl must be an absolute HTTP or HTTPS URL.')
  }
  scheduledSitemaps.add(rootSitemap)
  queue.push(rootSitemap)

  let sitemapsFetched = 0
  let urlLocs = 0
  let sitemapLocs = 0
  let duplicateUrlLocs = 0
  let duplicateSitemapLocs = 0
  let invalidLocCount = 0
  let omittedUrlsAtLeast = 0
  let urlLimitExceeded = false
  let nestedSitemapLimitExceeded = false

  function recordInvalidLoc(input: SitemapInvalidLoc) {
    invalidLocCount += 1
    if (invalidLocSamples.length < INVALID_LOC_SAMPLE_LIMIT) {
      invalidLocSamples.push(input)
    }
  }

  while (queue.length) {
    const sitemapUrl = queue.shift()
    if (!sitemapUrl) continue

    let xml = ''
    try {
      xml = await fetchSitemapXml(sitemapUrl)
      sitemapsFetched += 1
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
      continue
    }

    const $ = load(xml, { xmlMode: true })
    $('url > loc').each((_, element) => {
      urlLocs += 1
      const value = $(element).text().trim()
      const url = normalizeUrl(value)
      if (!url) {
        recordInvalidLoc({ sitemapUrl, kind: 'url', value })
        return
      }
      if (seenUrls.has(url)) {
        duplicateUrlLocs += 1
        return
      }
      seenUrls.add(url)
      if (urls.length < limit) {
        urls.push(url)
        return
      }
      urlLimitExceeded = true
      omittedUrlsAtLeast += 1
    })

    $('sitemap > loc').each((_, element) => {
      sitemapLocs += 1
      const value = $(element).text().trim()
      const child = normalizeUrl(value)
      if (!child) {
        recordInvalidLoc({ sitemapUrl, kind: 'sitemap', value })
        return
      }
      if (discoveredSitemaps.has(child) || scheduledSitemaps.has(child)) {
        duplicateSitemapLocs += 1
        return
      }
      discoveredSitemaps.add(child)
      nestedSitemaps.push(child)
      if (scheduledSitemaps.size < maxNested) {
        scheduledSitemaps.add(child)
        queue.push(child)
      } else {
        nestedSitemapLimitExceeded = true
      }
    })
  }

  const unprocessedSitemaps = nestedSitemaps.filter(
    (sitemap) => !scheduledSitemaps.has(sitemap),
  ).length
  const possiblyTruncated =
    urlLimitExceeded || nestedSitemapLimitExceeded || unprocessedSitemaps > 0
  if (invalidLocCount) {
    warnings.push(
      `Ignored ${invalidLocCount} invalid sitemap <loc> ${invalidLocCount === 1 ? 'entry' : 'entries'}.`,
    )
  }
  if (possiblyTruncated) {
    warnings.push(
      'Sitemap discovery exceeded a configured URL or sitemap boundary; the returned inventory is incomplete.',
    )
  }

  return {
    sitemapUrl: rootSitemap,
    dataStatus:
      warnings.length || invalidLocCount || possiblyTruncated
        ? 'partial'
        : 'complete',
    urls,
    nestedSitemaps,
    source: {
      sitemapsFetched,
      urlLocs,
      sitemapLocs,
      duplicateUrlLocs,
      duplicateSitemapLocs,
      invalidLocs: {
        count: invalidLocCount,
        samples: invalidLocSamples,
      },
    },
    truncation: {
      possiblyTruncated,
      urlLimitExceeded,
      nestedSitemapLimitExceeded,
      omittedUrlsAtLeast,
      unprocessedSitemaps,
      limits: {
        urls: limit,
        sitemaps: maxNested,
      },
    },
    warnings,
  }
}
