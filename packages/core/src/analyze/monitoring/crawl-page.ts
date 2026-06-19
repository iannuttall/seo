import { createHash } from 'node:crypto'
import { extractPage } from '../../extract/page-extractor.js'
import { type FetchPageOptions, fetchPage } from '../../fetch/page-fetcher.js'
import type { CrawlPageSnapshot } from './types.js'

function sameOriginUrl(href: string, base: URL): string | undefined {
  try {
    const url = new URL(href, base)
    url.hash = ''
    if (url.origin !== base.origin) return undefined
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function headerValue(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase()
  return (
    headers[name] ??
    headers[lower] ??
    Object.entries(headers).find(([key]) => key.toLowerCase() === lower)?.[1]
  )
}

function safeResponseHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const blocked = new Set([
    'authorization',
    'cookie',
    'proxy-authorization',
    'set-cookie',
    'www-authenticate',
  ])
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !blocked.has(key.toLowerCase())),
  )
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max).trimEnd() : value
}

function hasNoIndex(value?: string): boolean {
  return /\bnoindex\b/i.test(value ?? '')
}

function indexabilityReason(page: CrawlPageSnapshot): string | undefined {
  if (page.status < 200 || page.status >= 300) return `Status ${page.status}`
  if (hasNoIndex(page.metaRobots)) return 'Meta robots noindex'
  if (hasNoIndex(page.xRobotsTag)) return 'X-Robots-Tag noindex'
  return undefined
}

export async function crawlOne(
  url: string,
  opts: FetchPageOptions = {},
): Promise<{ page?: CrawlPageSnapshot; urls: string[]; warning?: string }> {
  try {
    const fetched = await fetchPage(url, opts)
    const extracted = await extractPage(fetched)
    const base = new URL(extracted.finalUrl)
    const internalLinks = extracted.links
      .map((link) => sameOriginUrl(link.href, base))
      .filter((value): value is string => Boolean(value))
    const externalLinks = extracted.links
      .filter((link) => !link.internal)
      .map((link) => link.href)
      .filter((href) => /^https?:\/\//.test(href))
    const h1 = extracted.headings.find((heading) => heading.level === 1)?.text
    const uniqueInternalLinks = [...new Set(internalLinks)]
    const uniqueExternalLinks = [...new Set(externalLinks)]
    const page: CrawlPageSnapshot = {
      url,
      finalUrl: extracted.finalUrl,
      status: fetched.status,
      contentType: headerValue(fetched.headers, 'content-type'),
      responseHeaders: safeResponseHeaders(fetched.headers),
      responseTimeMs: fetched.diagnostics.durationMs,
      sizeBytes: Buffer.byteLength(fetched.html),
      usedJs: fetched.usedJs,
      fetchSource: fetched.diagnostics.source,
      cacheState: fetched.diagnostics.cache,
      fetchDiagnostics: fetched.diagnostics,
      blocked: fetched.diagnostics.blocked,
      robotsTxt: fetched.robotsTxt,
      title: extracted.title,
      metaDescription: extracted.metaDescription,
      canonical: extracted.canonical
        ? new URL(extracted.canonical, extracted.finalUrl).toString()
        : undefined,
      metaRobots: extracted.metaRobots,
      xRobotsTag: extracted.xRobotsTag,
      h1,
      h1Count: extracted.headings.filter((heading) => heading.level === 1)
        .length,
      h2Count: extracted.headings.filter((heading) => heading.level === 2)
        .length,
      h3Count: extracted.headings.filter((heading) => heading.level === 3)
        .length,
      indexable: false,
      wordCount: extracted.wordCount,
      contentHash: hashText(
        [
          extracted.title,
          extracted.metaDescription,
          h1,
          extracted.canonical,
          extracted.contentText,
        ].join('\n'),
      ),
      contentSample: truncate(extracted.contentText, 300),
      lang: extracted.lang,
      hasViewport: extracted.hasViewport,
      imagesTotal: extracted.imagesTotal,
      imagesMissingAlt: extracted.imagesMissingAlt,
      outgoingInternalCount: uniqueInternalLinks.length,
      outgoingExternalCount: uniqueExternalLinks.length,
      sampleInternalLinks: uniqueInternalLinks.slice(0, 25),
      sampleExternalLinks: uniqueExternalLinks.slice(0, 25),
      schemaTypes: extracted.schemaTypes,
      openGraphTitle: extracted.openGraph['og:title'],
      openGraphImage: extracted.openGraph['og:image'],
      twitterCard: extracted.twitter['twitter:card'],
      author: extracted.author,
      hasDate: extracted.hasDate,
      geo: {
        semanticHtml: extracted.semanticHtml,
        structuredData: extracted.schemaTypes.length > 0,
        hasAuthor: extracted.hasAuthor,
        hasDate: extracted.hasDate,
        questionHeadings: extracted.questionHeadings,
        structuredBlocks: extracted.structuredBlocks,
        answerable: extracted.answerable,
      },
    }
    page.indexability = indexabilityReason(page)
    page.indexable = !page.indexability
    return { page, urls: uniqueInternalLinks }
  } catch (error) {
    return {
      urls: [],
      warning: `${url}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
