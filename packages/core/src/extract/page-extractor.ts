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

  return {
    url: fetchResult.url,
    finalUrl: fetchResult.finalUrl,
    title: safeText($('title').first().text()),
    metaDescription: safeText($('meta[name="description"]').attr('content')),
    metaRobots: safeText($('meta[name="robots"]').attr('content')),
    xRobotsTag: safeText(fetchResult.headers['x-robots-tag']),
    canonical: safeText($('link[rel="canonical"]').attr('href')),
    headings,
    links,
    jsonLd,
    openGraph,
    twitter,
    author: safeText($('meta[name="author"]').attr('content')),
    contentText: text.replace(/\s+/g, ' ').trim(),
    excerpt,
    wordCount: text.trim().split(/\s+/).filter(Boolean).length,
    warnings: [...fetchResult.warnings],
  }
}
