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

function anchorSamples(
  links: Array<{ href: string; text: string; internal: boolean }>,
  internal: boolean,
): Array<{ href: string; text: string }> {
  const seen = new Set<string>()
  const samples: Array<{ href: string; text: string }> = []
  for (const link of links) {
    if (link.internal !== internal) continue
    const text = truncate(link.text.replace(/\s+/g, ' ').trim(), 120)
    if (!text) continue
    const key = `${link.href}\n${text}`
    if (seen.has(key)) continue
    seen.add(key)
    samples.push({ href: link.href, text })
    if (samples.length >= 25) break
  }
  return samples
}

function collectSchemaSameAs(value: unknown): string[] {
  const urls = new Set<string>()
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    const sameAs = record.sameAs
    const values = Array.isArray(sameAs) ? sameAs : [sameAs]
    for (const item of values) {
      if (typeof item !== 'string') continue
      try {
        const url = new URL(item)
        if (['http:', 'https:'].includes(url.protocol)) urls.add(url.toString())
      } catch {
        // Ignore malformed sameAs values; invalid JSON-LD is reported elsewhere.
      }
    }
    for (const item of Object.values(record)) visit(item)
  }
  visit(value)
  return [...urls].slice(0, 50)
}

function socialProfileLinks(
  links: Array<{ href: string; internal: boolean }>,
): string[] {
  const hosts = [
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'pinterest.com',
    'tiktok.com',
    'twitter.com',
    'x.com',
    'youtube.com',
  ]
  const profiles = new Set<string>()
  for (const link of links) {
    if (link.internal) continue
    try {
      const url = new URL(link.href)
      const host = url.hostname.replace(/^www\./, '').toLowerCase()
      if (hosts.some((value) => host === value || host.endsWith(`.${value}`))) {
        url.hash = ''
        profiles.add(url.toString())
      }
    } catch {
      // Ignore malformed outgoing links.
    }
  }
  return [...profiles].slice(0, 50)
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
      canonicalRaw: extracted.canonical,
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
      mainContentHash: hashText(extracted.contentText),
      textRatio: fetched.html.length
        ? Math.min(1, extracted.contentText.length / fetched.html.length)
        : undefined,
      contentSample: truncate(extracted.contentText, 300),
      lang: extracted.lang,
      hasViewport: extracted.hasViewport,
      isHttps: new URL(extracted.finalUrl).protocol === 'https:',
      hasHsts: Boolean(
        headerValue(fetched.headers, 'strict-transport-security'),
      ),
      compression: headerValue(fetched.headers, 'content-encoding'),
      hreflang: extracted.hreflang,
      mixedContentCount: extracted.mixedContentUrls.length,
      mixedContentSamples: extracted.mixedContentUrls.slice(0, 25),
      imagesTotal: extracted.imagesTotal,
      imagesMissingAlt: extracted.imagesMissingAlt,
      oversizedImageCandidates: extracted.oversizedImageCandidates,
      outgoingInternalCount: uniqueInternalLinks.length,
      outgoingExternalCount: uniqueExternalLinks.length,
      sampleInternalLinks: uniqueInternalLinks.slice(0, 25),
      sampleExternalLinks: uniqueExternalLinks.slice(0, 25),
      internalAnchorSamples: anchorSamples(extracted.links, true),
      externalAnchorSamples: anchorSamples(extracted.links, false),
      schemaTypes: extracted.schemaTypes,
      schemaSameAs: collectSchemaSameAs(extracted.jsonLd),
      socialProfileLinks: socialProfileLinks(extracted.links),
      invalidJsonLdCount: extracted.invalidJsonLdCount,
      invalidJsonLdSamples: extracted.invalidJsonLdSamples,
      openGraphTitle: extracted.openGraph['og:title'],
      openGraphDescription: extracted.openGraph['og:description'],
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
        listCount: extracted.listCount,
        tableCount: extracted.tableCount,
        structuredBlocks: extracted.structuredBlocks,
        answerable: extracted.answerable,
        hasFaqSchema: extracted.schemaTypes.includes('FAQPage'),
        hasQapageSchema: extracted.schemaTypes.includes('QAPage'),
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
