import { Readability } from '@mozilla/readability'
import { load } from 'cheerio'
import DefuddleDefault from 'defuddle'
import { parseHTML } from 'linkedom'
import type { ExtractedPage, PageFetchResult } from '../types.js'

function safeText(value?: string | null): string | undefined {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed : undefined
}

function normalizeJsonLdBlocks(blocks: string[]): unknown[] {
  const out: unknown[] = []

  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block)
      if (Array.isArray(parsed)) {
        out.push(...parsed)
      } else if (
        parsed &&
        typeof parsed === 'object' &&
        '@graph' in parsed &&
        Array.isArray(parsed['@graph'])
      ) {
        out.push(...parsed['@graph'])
      } else {
        out.push(parsed)
      }
    } catch {}
  }

  return out
}

function schemaTypesFrom(value: unknown): string[] {
  const types = new Set<string>()
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    const type = record['@type']
    if (typeof type === 'string') {
      types.add(type)
    } else if (Array.isArray(type)) {
      for (const item of type) {
        if (typeof item === 'string') types.add(item)
      }
    }
    for (const value of Object.values(record)) {
      visit(value)
    }
  }

  visit(value)
  return [...types]
}

function hasSchemaKey(value: unknown, keys: string[]): boolean {
  if (Array.isArray(value))
    return value.some((item) => hasSchemaKey(item, keys))
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return Object.entries(record).some(
    ([key, item]) =>
      keys.includes(key.toLowerCase()) || hasSchemaKey(item, keys),
  )
}

function absoluteUrl(
  value: string | undefined,
  base: string,
): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value, base).toString()
  } catch {
    return undefined
  }
}

async function extractMainContent(
  fetchResult: PageFetchResult,
  extractor: 'defuddle' | 'readability' = 'defuddle',
) {
  const { document } = parseHTML(fetchResult.html)

  const readWithReadability = () => {
    const reader = new Readability(document as never)
    const article = reader.parse()
    return {
      text: article?.textContent ?? document.body.textContent ?? '',
      excerpt: article?.excerpt ?? undefined,
    }
  }

  if (extractor === 'readability') {
    return readWithReadability()
  }

  const Defuddle = DefuddleDefault as unknown as new (
    doc: unknown,
  ) => {
    parse(): { content?: string; excerpt?: string }
  }
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  }

  try {
    console.log = () => undefined
    console.warn = () => undefined
    console.error = () => undefined
    const article = new Defuddle(document).parse()
    const textContent =
      typeof article?.content === 'string'
        ? load(article.content).text()
        : undefined
    return {
      text: textContent ?? document.body.textContent ?? '',
      excerpt: article?.excerpt ?? undefined,
    }
  } catch {
    return readWithReadability()
  } finally {
    console.log = original.log
    console.warn = original.warn
    console.error = original.error
  }
}

export async function extractPage(
  fetchResult: PageFetchResult,
  extractor: 'defuddle' | 'readability' = 'defuddle',
): Promise<ExtractedPage> {
  const $ = load(fetchResult.html)
  const { text, excerpt } = await extractMainContent(fetchResult, extractor)
  const url = new URL(fetchResult.finalUrl)

  const headings = $('h1, h2, h3, h4, h5, h6')
    .toArray()
    .map((element) => ({
      level: Number.parseInt(element.tagName.slice(1), 10),
      text: $(element).text().replace(/\s+/g, ' ').trim(),
    }))
    .filter((heading) => heading.text.length > 0)

  const links = $('a[href]')
    .toArray()
    .map((element) => {
      const href = $(element).attr('href') ?? ''
      const absolute = new URL(href, fetchResult.finalUrl)
      return {
        href: absolute.toString(),
        text: $(element).text().replace(/\s+/g, ' ').trim(),
        rel: ($(element).attr('rel') ?? '').split(/\s+/).filter(Boolean),
        internal: absolute.host === url.host,
      }
    })

  const hreflang = $('link[rel~="alternate"][hreflang][href]')
    .toArray()
    .map((element) => ({
      hreflang: $(element).attr('hreflang') ?? '',
      href: absoluteUrl($(element).attr('href'), fetchResult.finalUrl) ?? '',
    }))
    .filter((item) => item.hreflang && item.href)

  const openGraph = Object.fromEntries(
    $('meta[property^="og:"]')
      .toArray()
      .map((element) => [
        $(element).attr('property') ?? '',
        $(element).attr('content') ?? '',
      ])
      .filter(([key, value]) => key && value),
  )

  const twitter = Object.fromEntries(
    $('meta[name^="twitter:"]')
      .toArray()
      .map((element) => [
        $(element).attr('name') ?? '',
        $(element).attr('content') ?? '',
      ])
      .filter(([key, value]) => key && value),
  )

  const jsonLd = normalizeJsonLdBlocks(
    $('script[type="application/ld+json"]')
      .toArray()
      .map((element) => $(element).html() ?? ''),
  )
  const schemaTypes = schemaTypesFrom(jsonLd)
  const lowerSchemaKeys = ['datepublished', 'datemodified']
  const hasDate =
    hasSchemaKey(jsonLd, lowerSchemaKeys) ||
    Boolean($('meta[property="article:published_time"]').attr('content')) ||
    Boolean($('meta[property="article:modified_time"]').attr('content')) ||
    $('time[datetime]').length > 0
  const author = safeText($('meta[name="author"]').attr('content'))
  const hasAuthor =
    Boolean(author) ||
    hasSchemaKey(jsonLd, ['author']) ||
    $('[rel~=author], .author, .byline').length > 0
  const semanticHtml = $('main, article').length > 0
  const questionHeadings = headings.filter((heading) =>
    heading.text.trimEnd().endsWith('?'),
  ).length
  const listCount = $('ul, ol').length
  const tableCount = $('table').length
  const structuredBlocks = listCount + tableCount
  const answerable = $('main p, article p, p')
    .toArray()
    .slice(0, 3)
    .some(
      (element) =>
        $(element)
          .text()
          .replace(/\s+/g, ' ')
          .trim()
          .split(/\s+/)
          .filter(Boolean).length >= 25,
    )
  const imageElements = $('img').toArray()
  const mixedContentUrls =
    url.protocol === 'https:'
      ? [
          ...new Set(
            $(
              'img[src], script[src], iframe[src], source[src], video[src], audio[src], link[href]',
            )
              .toArray()
              .map((element) =>
                absoluteUrl(
                  $(element).attr('src') ?? $(element).attr('href'),
                  fetchResult.finalUrl,
                ),
              )
              .filter(
                (value): value is string =>
                  typeof value === 'string' &&
                  new URL(value).protocol === 'http:',
              ),
          ),
        ]
      : []

  return {
    url: fetchResult.url,
    finalUrl: fetchResult.finalUrl,
    title: safeText($('title').first().text()),
    metaDescription: safeText($('meta[name="description"]').attr('content')),
    metaRobots: safeText($('meta[name="robots"]').attr('content')),
    xRobotsTag: safeText(fetchResult.headers['x-robots-tag']),
    canonical: safeText($('link[rel="canonical"]').attr('href')),
    lang: safeText($('html').attr('lang')),
    hasViewport: Boolean($('meta[name="viewport"]').attr('content')),
    headings,
    links,
    hreflang,
    jsonLd,
    schemaTypes,
    openGraph,
    twitter,
    author,
    hasAuthor,
    hasDate,
    imagesTotal: imageElements.length,
    imagesMissingAlt: imageElements.filter((element) => {
      const alt = $(element).attr('alt')
      return alt === undefined || alt.trim() === ''
    }).length,
    mixedContentUrls,
    semanticHtml,
    questionHeadings,
    listCount,
    tableCount,
    structuredBlocks,
    answerable,
    contentText: text.replace(/\s+/g, ' ').trim(),
    excerpt,
    wordCount: text.trim().split(/\s+/).filter(Boolean).length,
    warnings: [...fetchResult.warnings],
  }
}
