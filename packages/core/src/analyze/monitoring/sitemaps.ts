import { load } from 'cheerio'
import { publicHttpFetch } from '../../fetch/http-client.js'

export type SitemapFetchResult = {
  sitemapUrl: string
  urls: string[]
  nestedSitemaps: string[]
  warnings: string[]
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function normalizeUrl(value: string): string | undefined {
  try {
    return new URL(value.trim()).toString()
  } catch {
    return undefined
  }
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

export async function fetchSitemapUrls(input: {
  sitemapUrl: string
  limit?: number
  maxNested?: number
}): Promise<SitemapFetchResult> {
  const warnings: string[] = []
  const seenSitemaps = new Set<string>()
  const urls: string[] = []
  const nestedSitemaps: string[] = []
  const queue = [input.sitemapUrl]
  const limit = input.limit ?? 50_000
  const maxNested = input.maxNested ?? 50

  while (queue.length && urls.length < limit) {
    const sitemapUrl = queue.shift()
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue
    seenSitemaps.add(sitemapUrl)

    let xml = ''
    try {
      xml = await fetchSitemapXml(sitemapUrl)
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
      continue
    }

    const $ = load(xml, { xmlMode: true })
    $('url > loc').each((_, element) => {
      const url = normalizeUrl($(element).text())
      if (url && urls.length < limit) urls.push(url)
    })
    $('sitemap > loc').each((_, element) => {
      const child = normalizeUrl($(element).text())
      if (!child) return
      nestedSitemaps.push(child)
      if (seenSitemaps.size + queue.length < maxNested) queue.push(child)
    })
  }

  return {
    sitemapUrl: input.sitemapUrl,
    urls: unique(urls).slice(0, limit),
    nestedSitemaps: unique(nestedSitemaps),
    warnings,
  }
}
