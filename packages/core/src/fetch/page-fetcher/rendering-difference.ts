import { createHash } from 'node:crypto'
import { type CheerioAPI, load } from 'cheerio'
import { extractCanonicalEvidence } from '../../extract/canonical.js'
import { extractStructuredData } from '../../extract/structured-data.js'
import type {
  PageFetchResult,
  RenderingDocumentDifference,
  RenderingDocumentSnapshot,
} from '../../types.js'

const MAX_HEADINGS = 50
const MAX_TEXT_VALUE_LENGTH = 500

function safeText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, MAX_TEXT_VALUE_LENGTH) : undefined
}

function headerValue(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const expected = name.toLowerCase()
  return Object.entries(headers).find(
    ([key]) => key.toLowerCase() === expected,
  )?.[1]
}

function normalizedDirectiveValue(
  values: Array<string | undefined>,
): string | undefined {
  const directives = values
    .flatMap((value) => value?.split(',') ?? [])
    .map((value) => value.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
    .sort()
  return directives.length ? directives.join(', ') : undefined
}

function metaValue($: CheerioAPI, name: string): string | undefined {
  const expected = name.toLowerCase()
  const element = $('meta')
    .toArray()
    .find((candidate) => $(candidate).attr('name')?.toLowerCase() === expected)
  return safeText(element ? $(element).attr('content') : undefined)
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function textObservation($: CheerioAPI): RenderingDocumentSnapshot['content'] {
  const text = $('body')
    .clone()
    .find('script, style, noscript, template')
    .remove()
    .end()
    .text()
    .replace(/\s+/g, ' ')
    .trim()
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’_-]*/gu) ?? []
  return {
    characters: text.length,
    wordCount: words.length,
    fingerprint: fingerprint(text),
  }
}

function linksObservation(
  $: CheerioAPI,
  finalUrl: string,
): RenderingDocumentSnapshot['links'] {
  const host = new URL(finalUrl).host
  const urls = new Set<string>()
  let internal = 0
  let external = 0

  for (const element of $('a[href]').toArray()) {
    const href = $(element).attr('href') ?? ''
    try {
      const url = new URL(href, finalUrl)
      if (!['http:', 'https:'].includes(url.protocol)) continue
      urls.add(url.toString())
      if (url.host === host) internal += 1
      else external += 1
    } catch {
      // Invalid hrefs are excluded from the comparison just as crawl links are.
    }
  }

  return {
    total: internal + external,
    internal,
    external,
    fingerprint: fingerprint([...urls].sort().join('\n')),
  }
}

export function renderingDocumentSnapshot(
  result: PageFetchResult,
): RenderingDocumentSnapshot {
  const $ = load(result.html)
  const canonical = extractCanonicalEvidence($, result.headers, result.finalUrl)
  const structuredData = extractStructuredData($, result.finalUrl)
  const metaRobots = normalizedDirectiveValue([metaValue($, 'robots')])
  const googlebotRobots = normalizedDirectiveValue([metaValue($, 'googlebot')])
  const httpRobots = normalizedDirectiveValue([
    headerValue(result.headers, 'x-robots-tag'),
  ])
  const headings = $('h1, h2, h3, h4, h5, h6')
    .toArray()
    .map((element) => ({
      level: Number.parseInt(element.tagName.slice(1), 10),
      text: safeText($(element).text()),
    }))
    .filter(
      (heading): heading is { level: number; text: string } =>
        Number.isFinite(heading.level) && Boolean(heading.text),
    )
    .slice(0, MAX_HEADINGS)

  return {
    title: safeText($('title').first().text()),
    metaDescription: metaValue($, 'description'),
    canonical: {
      status: canonical.status,
      ...(canonical.selectedUrl ? { url: canonical.selectedUrl } : {}),
    },
    robots: {
      ...(metaRobots ? { meta: metaRobots } : {}),
      ...(googlebotRobots ? { googlebot: googlebotRobots } : {}),
      ...(httpRobots ? { http: httpRobots } : {}),
    },
    headings,
    links: linksObservation($, result.finalUrl),
    content: textObservation($),
    structuredData: {
      blocks: $('script[type="application/ld+json"]').length,
      formats: [...structuredData.formats].sort(),
      schemaTypes: [...structuredData.schemaTypes].sort(),
    },
  }
}

export function renderingDocumentDifference(
  raw: PageFetchResult,
  rendered: PageFetchResult,
): RenderingDocumentDifference {
  const rawDocument = renderingDocumentSnapshot(raw)
  const renderedDocument = renderingDocumentSnapshot(rendered)
  const fields = [
    'title',
    'metaDescription',
    'canonical',
    'robots',
    'headings',
    'links',
    'content',
    'structuredData',
  ] as const
  const changed = fields.filter(
    (field) =>
      JSON.stringify(rawDocument[field]) !==
      JSON.stringify(renderedDocument[field]),
  )
  return { raw: rawDocument, rendered: renderedDocument, changed }
}
