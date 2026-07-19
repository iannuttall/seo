import { type CheerioAPI, load } from 'cheerio'
import { combineRobotsValues } from '../robots-directives.js'
import type {
  ContentExtractor,
  ExtractedPage,
  PageFetchResult,
} from '../types.js'
import { extractCanonicalEvidence } from './canonical.js'
import { type ContentSketch, contentSketch } from './content-sketch.js'
import {
  countCjkAwareWords,
  extractMainContent,
  type MainContentDependencies,
} from './main-content.js'
import {
  extractStructuredData,
  isValidStructuredDate,
} from './structured-data.js'

type CrawlerExtractionEvidence = {
  h1?: string
  h1Count: number
  h2Count: number
  h3Count: number
  questionHeadings: number
  internalLinks: string[]
  externalLinks: string[]
  internalAnchorSamples: Array<{ href: string; text: string }>
  externalAnchorSamples: Array<{ href: string; text: string }>
  socialProfileLinks: string[]
  contentSketch: ContentSketch
  softAuthenticationGate?: {
    kind: 'login-form'
    indicators: string[]
    formActionPath?: string
  }
  tabbedContent?: {
    groups: number
    panels: number
    retainedPanels: number
    truncated: boolean
    panelSketches: Array<{
      label?: string
      sketch: ContentSketch
    }>
  }
}

type PageExtraction = ExtractedPage & {
  crawlerEvidence?: CrawlerExtractionEvidence
}

const SOCIAL_PROFILE_HOSTS = [
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'pinterest.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'youtube.com',
]

const LOGIN_PATH_PATTERN =
  /(?:^|\/)(?:auth|login|log-in|signin|sign-in|sso)(?:\/|$)/iu
const LOGIN_TITLE_PATTERN = /\b(?:authenticate|log[ -]?in|sign[ -]?in)\b/iu

function softAuthenticationGate(
  $: CheerioAPI,
  finalUrl: string,
  title?: string,
): CrawlerExtractionEvidence['softAuthenticationGate'] {
  const passwordForms = $('form')
    .toArray()
    .filter((form) => $(form).find('input[type="password" i]').length > 0)
  if (passwordForms.length === 0) return undefined

  const pagePath = new URL(finalUrl).pathname
  const action = $(passwordForms[0]).attr('action')
  const actionUrl = action ? httpUrl(action, finalUrl) : undefined
  const actionPath = actionUrl ? new URL(actionUrl).pathname : undefined
  const indicators = [
    ...(LOGIN_PATH_PATTERN.test(pagePath) ? ['login-path'] : []),
    ...(LOGIN_TITLE_PATTERN.test(title ?? '') ? ['login-title'] : []),
    ...(LOGIN_PATH_PATTERN.test(actionPath ?? '') ? ['login-form-action'] : []),
  ]
  if (indicators.length === 0) return undefined
  return {
    kind: 'login-form',
    indicators,
    ...(actionPath ? { formActionPath: actionPath } : {}),
  }
}

function tabbedContent(
  $: CheerioAPI,
): CrawlerExtractionEvidence['tabbedContent'] {
  const groups = $('[role="tablist" i]').length
  const panels = $('[role="tabpanel" i]').toArray()
  if (groups === 0 || panels.length === 0) return undefined
  const panelSketches = panels.slice(0, 12).map((panel) => {
    const labelledBy = $(panel).attr('aria-labelledby')
    const labelledElement = labelledBy
      ? $('[id]')
          .toArray()
          .find((element) => $(element).attr('id') === labelledBy)
      : undefined
    const label = safeText(
      $(panel).attr('aria-label') ??
        (labelledElement ? $(labelledElement).text() : undefined),
    )
    return {
      ...(label ? { label: label.slice(0, 80) } : {}),
      sketch: contentSketch($(panel).text()),
    }
  })
  return {
    groups,
    panels: panels.length,
    retainedPanels: panelSketches.length,
    truncated: panels.length > panelSketches.length,
    panelSketches,
  }
}

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

function sanitizedContentHtml(
  $: CheerioAPI,
  html: string,
  base: string,
): string {
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

function crawlerMainContent($: CheerioAPI, baseUrl: string) {
  const selected = $('main').first().length
    ? $('main').first()
    : $('article').first().length
      ? $('article').first()
      : $('body').first()
  const text = selected.text().replace(/\s+/g, ' ').trim()
  return {
    text,
    excerpt: safeText($('meta[name="description"]').attr('content')),
    wordCount: countCjkAwareWords(text),
    diagnostics: {
      requested: 'crawler' as const,
      used: 'crawler' as const,
      fallback: false,
      wordCountSource: 'local_cjk_aware' as const,
      baseUrl,
    },
    warnings: [],
  }
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

function addAnchorSample(
  samples: Array<{ href: string; text: string }>,
  seen: Set<string>,
  href: string,
  text: string,
): void {
  if (samples.length >= 25 || !text) return
  const sampleText = text.length > 120 ? text.slice(0, 120).trimEnd() : text
  const key = `${href}\n${sampleText}`
  if (seen.has(key)) return
  seen.add(key)
  samples.push({ href, text: sampleText })
}

function addSocialProfile(profiles: Set<string>, href: string): void {
  if (profiles.size >= 50) return
  try {
    const url = new URL(href)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    if (
      SOCIAL_PROFILE_HOSTS.some(
        (value) => host === value || host.endsWith(`.${value}`),
      )
    ) {
      url.hash = ''
      profiles.add(url.toString())
    }
  } catch {
    // Ignore malformed outgoing links.
  }
}

export async function extractPage(
  fetchResult: PageFetchResult,
  extractor: ContentExtractor = 'defuddle',
  dependencies: MainContentDependencies = {},
): Promise<PageExtraction> {
  const $ =
    extractor === 'crawler' && /<html(?:\s|>)/i.test(fetchResult.html)
      ? load(fetchResult.html, {
          xml: { xmlMode: false, decodeEntities: true },
        })
      : load(fetchResult.html)
  const url = new URL(fetchResult.finalUrl)
  const canonicalEvidence = extractCanonicalEvidence(
    $,
    fetchResult.headers,
    fetchResult.finalUrl,
  )

  const headings: ExtractedPage['headings'] = []
  let crawlerH1: string | undefined
  let crawlerH1Count = 0
  let crawlerH2Count = 0
  let crawlerH3Count = 0
  let questionHeadings = 0
  $('h1, h2, h3, h4, h5, h6').each((_index, element) => {
    const level = Number.parseInt(element.tagName.slice(1), 10)
    const text = $(element).text().replace(/\s+/g, ' ').trim()
    if (!text) return
    if (text.trimEnd().endsWith('?')) questionHeadings += 1
    if (level === 1) {
      crawlerH1 ??= text
      crawlerH1Count += 1
    } else if (level === 2) {
      crawlerH2Count += 1
    } else if (level === 3) {
      crawlerH3Count += 1
    }
    if (extractor !== 'crawler') headings.push({ level, text })
  })

  const links: ExtractedPage['links'] = []
  const crawlerInternalLinks = new Set<string>()
  const crawlerExternalLinks = new Set<string>()
  const internalAnchorSamples: Array<{ href: string; text: string }> = []
  const externalAnchorSamples: Array<{ href: string; text: string }> = []
  const internalAnchorKeys = new Set<string>()
  const externalAnchorKeys = new Set<string>()
  const socialProfileLinks = new Set<string>()
  let invalidLinkCount = 0
  let unsupportedLinkCount = 0
  $('a[href]').each((_index, element) => {
    const href = $(element).attr('href') ?? ''
    try {
      const absolute = new URL(href, fetchResult.finalUrl)
      if (!['http:', 'https:'].includes(absolute.protocol)) {
        unsupportedLinkCount += 1
        return
      }
      const absoluteHref = absolute.toString()
      const text = $(element).text().replace(/\s+/g, ' ').trim()
      const internal = absolute.host === url.host
      if (extractor === 'crawler') {
        if (absolute.origin === url.origin) {
          absolute.hash = ''
          crawlerInternalLinks.add(absolute.toString())
        }
        if (!internal) {
          crawlerExternalLinks.add(absoluteHref)
          addSocialProfile(socialProfileLinks, absoluteHref)
        }
        addAnchorSample(
          internal ? internalAnchorSamples : externalAnchorSamples,
          internal ? internalAnchorKeys : externalAnchorKeys,
          absoluteHref,
          text,
        )
      } else {
        links.push({
          href: absoluteHref,
          text,
          rel: ($(element).attr('rel') ?? '').split(/\s+/).filter(Boolean),
          internal,
          location: $(element).closest('nav, header').length
            ? ('navigation' as const)
            : $(element).closest('footer').length
              ? ('footer' as const)
              : $(element).closest('main, article').length
                ? ('main-content' as const)
                : ('other' as const),
        })
      }
    } catch {
      invalidLinkCount += 1
    }
  })

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

  const markdownAlternates = [
    ...new Set(
      $('head link[rel~="alternate"][type][href]')
        .toArray()
        .filter(
          (element) =>
            $(element).attr('type')?.trim().toLowerCase() === 'text/markdown',
        )
        .map((element) =>
          httpUrl($(element).attr('href'), fetchResult.finalUrl),
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort()

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

  const structuredData = extractStructuredData($, fetchResult.finalUrl, {
    retainJsonLd: extractor !== 'crawler',
  })
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
  let imagesTotal = 0
  let imagesMissingAlt = 0
  const oversizedImageCandidates: ExtractedPage['oversizedImageCandidates'] = []
  $('img').each((_index, element) => {
    imagesTotal += 1
    if ($(element).attr('alt') === undefined) imagesMissingAlt += 1
    if (oversizedImageCandidates.length >= 25) return
    const src = absoluteUrl($(element).attr('src'), fetchResult.finalUrl)
    if (!src) return
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
    if (maxDetected < 2000) return
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
    oversizedImageCandidates.push({
      src,
      detectedFrom,
      ...(candidateWidth > 0 ? { width: candidateWidth } : {}),
      ...(candidateHeight > 0 ? { height: candidateHeight } : {}),
    })
  })
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
  const content =
    extractor === 'crawler'
      ? crawlerMainContent($, fetchResult.finalUrl)
      : extractMainContent(
          {
            ...fetchResult,
            html: sanitizedContentHtml(
              $,
              fetchResult.html,
              fetchResult.finalUrl,
            ),
          },
          extractor,
          dependencies,
        )
  const { text, excerpt } = content
  const title = safeText($('title').first().text())

  return {
    url: fetchResult.url,
    finalUrl: fetchResult.finalUrl,
    title,
    metaDescription: safeText($('meta[name="description"]').attr('content')),
    metaRobots,
    xRobotsTag: safeText(headerValue(fetchResult.headers, 'x-robots-tag')),
    canonical: canonicalEvidence.selectedRaw,
    canonicalEvidence,
    lang: safeText($('html').attr('lang')),
    hasViewport: Boolean($('meta[name="viewport"]').attr('content')),
    headings,
    links,
    ...(extractor === 'crawler'
      ? {
          crawlerEvidence: {
            h1: crawlerH1,
            h1Count: crawlerH1Count,
            h2Count: crawlerH2Count,
            h3Count: crawlerH3Count,
            questionHeadings,
            internalLinks: [...crawlerInternalLinks],
            externalLinks: [...crawlerExternalLinks],
            internalAnchorSamples,
            externalAnchorSamples,
            socialProfileLinks: [...socialProfileLinks],
            contentSketch: contentSketch(text),
            softAuthenticationGate: softAuthenticationGate(
              $,
              fetchResult.finalUrl,
              title,
            ),
            tabbedContent: tabbedContent($),
          },
        }
      : {}),
    markdownAlternates,
    hreflang,
    jsonLd: structuredData.jsonLd,
    invalidJsonLdCount: structuredData.invalidJsonLdSamples.length,
    invalidJsonLdSamples: structuredData.invalidJsonLdSamples.slice(0, 10),
    unrecognizedJsonLdTypes: structuredData.unrecognizedJsonLdTypes.slice(
      0,
      25,
    ),
    structuredDataFormats: structuredData.formats,
    googleRichResults: structuredData.googleRichResults,
    schemaSameAsEvidence:
      extractor === 'crawler'
        ? structuredData.sameAs.slice(0, 50)
        : structuredData.sameAs,
    invalidSchemaSameAs:
      extractor === 'crawler'
        ? structuredData.invalidSameAs.slice(0, 25)
        : structuredData.invalidSameAs,
    schemaTypes: structuredData.schemaTypes,
    openGraph,
    twitter,
    author,
    hasAuthor,
    hasDate,
    imagesTotal,
    imagesMissingAlt,
    oversizedImageCandidates,
    mixedContentUrls,
    semanticHtml,
    questionHeadings,
    listCount,
    tableCount,
    structuredBlocks,
    answerable,
    contentText:
      extractor === 'crawler' ? text : text.replace(/\s+/g, ' ').trim(),
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
