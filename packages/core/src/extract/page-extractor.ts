import { load } from 'cheerio'
import { combineRobotsValues } from '../robots-directives.js'
import type {
  ContentExtractor,
  ExtractedPage,
  PageFetchResult,
} from '../types.js'
import {
  extractMainContent,
  type MainContentDependencies,
} from './main-content.js'
import {
  extractStructuredData,
  isValidStructuredDate,
} from './structured-data.js'

function safeText(value?: string | null): string | undefined {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed : undefined
}

function headerValue(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const target = name.toLowerCase()
  return Object.entries(headers).find(
    ([key]) => key.toLowerCase() === target,
  )?.[1]
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

function httpUrl(value: string | undefined, base: string): string | undefined {
  const resolved = absoluteUrl(value, base)
  if (!resolved) return undefined
  const protocol = new URL(resolved).protocol
  return protocol === 'http:' || protocol === 'https:' ? resolved : undefined
}

function sanitizedContentHtml(html: string, base: string): string {
  const $ = load(html)
  let changed = false
  for (const element of $('[href], [src]').toArray()) {
    for (const attribute of ['href', 'src'] as const) {
      const value = $(element).attr(attribute)
      if (value && !absoluteUrl(value, base)) {
        $(element).removeAttr(attribute)
        changed = true
      }
    }
  }
  return changed ? $.html() : html
}

function numericAttribute(value: string | undefined): number | undefined {
  if (!value) return undefined
  const match = value.trim().match(/^\d+/)
  if (!match) return undefined
  const number = Number(match[0])
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function largestSrcsetWidth(value: string | undefined): number | undefined {
  if (!value) return undefined
  const widths = value
    .split(',')
    .map((candidate) => candidate.trim().match(/\s(\d+)w(?:\s|$)/)?.[1])
    .filter((width): width is string => Boolean(width))
    .map(Number)
    .filter((width) => Number.isFinite(width) && width > 0)
  return widths.length ? Math.max(...widths) : undefined
}

function imageDimensionsFromUrl(
  src: string,
): { width: number; height: number } | undefined {
  const match = src.match(/(?:^|[^\d])(\d{3,5})[xX](\d{3,5})(?:[^\d]|$)/)
  if (!match) return undefined
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined
  return { width, height }
}

export async function extractPage(
  fetchResult: PageFetchResult,
  extractor: ContentExtractor = 'defuddle',
  dependencies: MainContentDependencies = {},
): Promise<ExtractedPage> {
  const $ = load(fetchResult.html)
  const content = extractMainContent(
    {
      ...fetchResult,
      html: sanitizedContentHtml(fetchResult.html, fetchResult.finalUrl),
    },
    extractor,
    dependencies,
  )
  const { text, excerpt } = content
  const url = new URL(fetchResult.finalUrl)

  const headings = $('h1, h2, h3, h4, h5, h6')
    .toArray()
    .map((element) => ({
      level: Number.parseInt(element.tagName.slice(1), 10),
      text: $(element).text().replace(/\s+/g, ' ').trim(),
    }))
    .filter((heading) => heading.text.length > 0)

  const links: ExtractedPage['links'] = []
  let invalidLinkCount = 0
  let unsupportedLinkCount = 0
  for (const element of $('a[href]').toArray()) {
    const href = $(element).attr('href') ?? ''
    try {
      const absolute = new URL(href, fetchResult.finalUrl)
      if (!['http:', 'https:'].includes(absolute.protocol)) {
        unsupportedLinkCount += 1
        continue
      }
      links.push({
        href: absolute.toString(),
        text: $(element).text().replace(/\s+/g, ' ').trim(),
        rel: ($(element).attr('rel') ?? '').split(/\s+/).filter(Boolean),
        internal: absolute.host === url.host,
        location: $(element).closest('nav, header').length
          ? ('navigation' as const)
          : $(element).closest('footer').length
            ? ('footer' as const)
            : $(element).closest('main, article').length
              ? ('main-content' as const)
              : ('other' as const),
      })
    } catch {
      invalidLinkCount += 1
    }
  }

  const hreflang: ExtractedPage['hreflang'] = []
  let invalidHreflangCount = 0
  for (const element of $('link[rel~="alternate"][hreflang][href]').toArray()) {
    const language = $(element).attr('hreflang') ?? ''
    const href = httpUrl($(element).attr('href'), fetchResult.finalUrl)
    if (language && href) {
      hreflang.push({ hreflang: language, href })
    } else {
      invalidHreflangCount += 1
    }
  }

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

  const structuredData = extractStructuredData($, fetchResult.finalUrl)
  const hasDate =
    structuredData.hasDate ||
    isValidStructuredDate(
      $('meta[property="article:published_time"]').attr('content'),
    ) ||
    isValidStructuredDate(
      $('meta[property="article:modified_time"]').attr('content'),
    ) ||
    $('article time[datetime], main time[datetime]')
      .toArray()
      .some((element) => isValidStructuredDate($(element).attr('datetime')))
  const author = safeText($('meta[name="author"]').attr('content'))
  const hasAuthor =
    Boolean(author) ||
    structuredData.hasAuthor ||
    $('[rel~=author], .author, .byline')
      .toArray()
      .some((element) => Boolean(safeText($(element).text())))
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
  const oversizedImageCandidates = imageElements
    .map((element) => {
      const src = absoluteUrl($(element).attr('src'), fetchResult.finalUrl)
      if (!src) return undefined
      const width = numericAttribute($(element).attr('width'))
      const height = numericAttribute($(element).attr('height'))
      const srcsetWidth = largestSrcsetWidth($(element).attr('srcset'))
      const filenameDimensions = imageDimensionsFromUrl(src)
      const maxDetected = Math.max(
        width ?? 0,
        height ?? 0,
        srcsetWidth ?? 0,
        filenameDimensions?.width ?? 0,
        filenameDimensions?.height ?? 0,
      )
      if (maxDetected < 2000) return undefined
      const detectedFrom = [
        width && width >= 2000 ? 'width' : undefined,
        height && height >= 2000 ? 'height' : undefined,
        srcsetWidth && srcsetWidth >= 2000 ? 'srcset' : undefined,
        filenameDimensions &&
        (filenameDimensions.width >= 2000 || filenameDimensions.height >= 2000)
          ? 'filename'
          : undefined,
      ]
        .filter(Boolean)
        .join(',')
      const candidateWidth = Math.max(
        width ?? 0,
        srcsetWidth ?? 0,
        filenameDimensions?.width ?? 0,
      )
      const candidateHeight = Math.max(
        height ?? 0,
        filenameDimensions?.height ?? 0,
      )
      return {
        src,
        detectedFrom,
        ...(candidateWidth > 0 ? { width: candidateWidth } : {}),
        ...(candidateHeight > 0 ? { height: candidateHeight } : {}),
      }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    )
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
  const metaRobots = combineRobotsValues(
    $('meta[name]')
      .toArray()
      .filter((element) => {
        const name = $(element).attr('name')?.trim().toLowerCase()
        return name === 'robots' || name === 'googlebot'
      })
      .map((element) => $(element).attr('content')),
  )

  return {
    url: fetchResult.url,
    finalUrl: fetchResult.finalUrl,
    title: safeText($('title').first().text()),
    metaDescription: safeText($('meta[name="description"]').attr('content')),
    metaRobots,
    xRobotsTag: safeText(headerValue(fetchResult.headers, 'x-robots-tag')),
    canonical: safeText($('link[rel="canonical"]').attr('href')),
    lang: safeText($('html').attr('lang')),
    hasViewport: Boolean($('meta[name="viewport"]').attr('content')),
    headings,
    links,
    hreflang,
    jsonLd: structuredData.jsonLd,
    invalidJsonLdCount: structuredData.invalidJsonLdSamples.length,
    invalidJsonLdSamples: structuredData.invalidJsonLdSamples.slice(0, 10),
    unrecognizedJsonLdTypes: structuredData.unrecognizedJsonLdTypes.slice(
      0,
      25,
    ),
    structuredDataFormats: structuredData.formats,
    schemaSameAsEvidence: structuredData.sameAs,
    invalidSchemaSameAs: structuredData.invalidSameAs,
    schemaTypes: structuredData.schemaTypes,
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
    oversizedImageCandidates: oversizedImageCandidates.slice(0, 25),
    mixedContentUrls,
    semanticHtml,
    questionHeadings,
    listCount,
    tableCount,
    structuredBlocks,
    answerable,
    contentText: text.replace(/\s+/g, ' ').trim(),
    excerpt,
    wordCount: content.wordCount,
    contentExtraction: content.diagnostics,
    warnings: [
      ...fetchResult.warnings,
      ...content.warnings,
      ...(structuredData.unrecognizedJsonLdTypes.length
        ? [
            `Ignored ${structuredData.unrecognizedJsonLdTypes.length} JSON-LD @type value${structuredData.unrecognizedJsonLdTypes.length === 1 ? '' : 's'} that did not resolve to Schema.org.`,
          ]
        : []),
      ...(structuredData.invalidSameAs.length
        ? [
            `Found ${structuredData.invalidSameAs.length} invalid or non-HTTP Schema.org sameAs value${structuredData.invalidSameAs.length === 1 ? '' : 's'}.`,
          ]
        : []),
      ...(invalidLinkCount
        ? [
            `Skipped ${invalidLinkCount} malformed link URL${invalidLinkCount === 1 ? '' : 's'}.`,
          ]
        : []),
      ...(unsupportedLinkCount
        ? [
            `Excluded ${unsupportedLinkCount} non-HTTP link URL${unsupportedLinkCount === 1 ? '' : 's'} from page link evidence.`,
          ]
        : []),
      ...(invalidHreflangCount
        ? [
            `Skipped ${invalidHreflangCount} invalid or non-HTTP hreflang URL${invalidHreflangCount === 1 ? '' : 's'}.`,
          ]
        : []),
    ],
  }
}
