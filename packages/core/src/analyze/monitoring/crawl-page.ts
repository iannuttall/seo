import { createHash } from 'node:crypto'
import { extractPage } from '../../extract/page-extractor.js'
import { type FetchPageOptions, fetchPage } from '../../fetch/page-fetcher.js'
import {
  hasMetaRobotsDirective,
  hasXRobotsDirective,
} from '../../robots-directives.js'
import type { PageFetchResult } from '../../types.js'
import type {
  CrawlPageSnapshot,
  CrawlRequestObservation,
  CrawlResponseObservation,
} from './types.js'

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

function sameDocumentUrl(left?: string, right?: string): boolean {
  if (!left || !right) return false
  try {
    const a = new URL(left)
    const b = new URL(right)
    a.hash = ''
    b.hash = ''
    return a.toString() === b.toString()
  } catch {
    return left === right
  }
}

function isHtmlContentType(value?: string): boolean {
  return /^\s*(?:text\/html|application\/xhtml\+xml)\b/i.test(value ?? '')
}

function fetchFailureKind(
  error: unknown,
  signal?: AbortSignal,
): Extract<CrawlRequestObservation, { outcome: 'failure' }>['failureKind'] {
  const record = error as { code?: unknown; cause?: { code?: unknown } }
  const code = String(record?.code ?? record?.cause?.code ?? '').toUpperCase()
  const message = error instanceof Error ? error.message : String(error)
  if (signal?.aborted) return 'aborted'
  if (/TOO MANY REDIRECTS/i.test(message)) return 'redirect-limit'
  if (['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL'].includes(code)) return 'dns'
  if (
    code.includes('CERT') ||
    code.includes('TLS') ||
    code.includes('SSL') ||
    /CERTIFICATE|\bTLS\b|\bSSL\b/i.test(message)
  ) {
    return 'tls'
  }
  if (
    code === 'ETIMEDOUT' ||
    /TIMED?\s*OUT|TIMEOUT|ABORT(?:ED|ERROR)/i.test(message)
  ) {
    return 'timeout'
  }
  return 'unknown'
}

function responseObservation(
  requestedUrl: string,
  fetched: PageFetchResult,
  extraction: 'complete' | 'not-applicable' | 'unknown-media-type',
): CrawlResponseObservation
function responseObservation(
  requestedUrl: string,
  fetched: PageFetchResult,
  extraction: 'failed',
  extractionError: string,
): CrawlResponseObservation
function responseObservation(
  requestedUrl: string,
  fetched: PageFetchResult,
  extraction: CrawlResponseObservation['extraction'],
  extractionError?: string,
): CrawlResponseObservation {
  const observation = {
    requestedUrl,
    outcome: 'response' as const,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    contentType: headerValue(fetched.headers, 'content-type'),
    durationMs: fetched.diagnostics.durationMs,
    redirectChain: fetched.diagnostics.redirectChain,
  }
  if (extraction === 'failed') {
    if (!extractionError) {
      throw new Error('Failed extraction observations require an error.')
    }
    return { ...observation, extraction, extractionError }
  }
  return { ...observation, extraction }
}

function unextractedPage(
  fetched: PageFetchResult,
  contentType?: string,
): CrawlPageSnapshot {
  const xRobotsTag = headerValue(fetched.headers, 'x-robots-tag')
  const noindex = hasXRobotsDirective(xRobotsTag, 'noindex')
  const knownNonHtml = Boolean(contentType)
  return {
    url: fetched.finalUrl,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    contentType,
    responseHeaders: safeResponseHeaders(fetched.headers),
    responseTimeMs: fetched.diagnostics.durationMs,
    sizeBytes: Buffer.byteLength(fetched.html),
    usedJs: fetched.usedJs,
    fetchSource: fetched.diagnostics.source,
    cacheState: fetched.diagnostics.cache,
    fetchDiagnostics: fetched.diagnostics,
    blocked: fetched.diagnostics.blocked,
    robotsTxt: fetched.robotsTxt,
    xRobotsTag,
    indexable: fetched.status >= 200 && fetched.status < 300 && !noindex,
    indexability: noindex
      ? 'X-Robots-Tag noindex'
      : knownNonHtml
        ? 'Non-HTML response'
        : 'Unknown response media type',
    declaredIndexability: noindex
      ? 'noindex'
      : knownNonHtml
        ? 'not-html'
        : 'unknown',
    extractionStatus: knownNonHtml ? 'not-applicable' : 'unknown-media-type',
    wordCount: 0,
    contentHash: hashText(fetched.html),
    outgoingInternalCount: 0,
    outgoingExternalCount: 0,
    isHttps: new URL(fetched.finalUrl).protocol === 'https:',
    hasHsts: Boolean(headerValue(fetched.headers, 'strict-transport-security')),
    compression: headerValue(fetched.headers, 'content-encoding'),
  }
}

function indexabilityReason(page: CrawlPageSnapshot): string | undefined {
  if (page.status < 200 || page.status >= 300) return `Status ${page.status}`
  if (hasMetaRobotsDirective(page.metaRobots, 'noindex')) {
    return 'Meta robots noindex'
  }
  if (hasXRobotsDirective(page.xRobotsTag, 'noindex')) {
    return 'X-Robots-Tag noindex'
  }
  return undefined
}

export type CrawlOneResult = {
  request?: CrawlRequestObservation
  page?: CrawlPageSnapshot
  urls: string[]
  warning?: string
}

export async function crawlOne(
  url: string,
  opts: FetchPageOptions = {},
): Promise<CrawlOneResult> {
  const startedAt = Date.now()
  let fetched: PageFetchResult
  try {
    fetched = await fetchPage(url, opts)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      request: {
        requestedUrl: url,
        outcome: 'failure',
        durationMs: Date.now() - startedAt,
        failureKind: fetchFailureKind(error, opts.signal),
        error: message,
        extraction: 'not-applicable',
      },
      urls: [],
      warning: `${url}: ${message}`,
    }
  }

  const contentType = headerValue(fetched.headers, 'content-type')
  if (!isHtmlContentType(contentType)) {
    const extraction = contentType
      ? ('not-applicable' as const)
      : ('unknown-media-type' as const)
    return {
      request: responseObservation(url, fetched, extraction),
      page: unextractedPage(fetched, contentType),
      urls: [],
    }
  }

  try {
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
      url: extracted.finalUrl,
      finalUrl: extracted.finalUrl,
      status: fetched.status,
      contentType,
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
      extractionStatus: 'complete',
      wordCount: extracted.wordCount,
      contentExtraction: extracted.contentExtraction,
      warnings: extracted.warnings,
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
    page.declaredIndexability =
      hasMetaRobotsDirective(page.metaRobots, 'noindex') ||
      hasXRobotsDirective(page.xRobotsTag, 'noindex')
        ? 'noindex'
        : page.robotsTxt?.allowed === false
          ? 'robots-blocked'
          : page.canonical && !sameDocumentUrl(page.canonical, page.finalUrl)
            ? 'canonical-hint-other'
            : 'indexable-candidate'
    return {
      request: responseObservation(url, fetched, 'complete'),
      page,
      urls: uniqueInternalLinks,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      request: responseObservation(url, fetched, 'failed', message),
      urls: [],
      warning: `${url}: content extraction failed: ${message}`,
    }
  }
}
