import { createHash } from 'node:crypto'
import { extractPage } from '../../extract/page-extractor.js'
import { fetchPage } from '../../fetch/page-fetcher.js'
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

function hasNoIndex(value?: string): boolean {
  return /\bnoindex\b/i.test(value ?? '')
}

function pageIndexable(page: CrawlPageSnapshot): boolean {
  return (
    page.status >= 200 &&
    page.status < 300 &&
    !hasNoIndex(page.metaRobots) &&
    !hasNoIndex(page.xRobotsTag)
  )
}

export async function crawlOne(
  url: string,
  opts: { refresh?: boolean; js?: boolean | 'auto' },
): Promise<{ page?: CrawlPageSnapshot; urls: string[]; warning?: string }> {
  try {
    const fetched = await fetchPage(url, { refresh: opts.refresh, js: opts.js })
    const extracted = await extractPage(fetched)
    const base = new URL(extracted.finalUrl)
    const internalLinks = extracted.links
      .map((link) => sameOriginUrl(link.href, base))
      .filter((value): value is string => Boolean(value))
    const h1 = extracted.headings.find((heading) => heading.level === 1)?.text
    const page: CrawlPageSnapshot = {
      url,
      finalUrl: extracted.finalUrl,
      status: fetched.status,
      title: extracted.title,
      metaDescription: extracted.metaDescription,
      canonical: extracted.canonical
        ? new URL(extracted.canonical, extracted.finalUrl).toString()
        : undefined,
      metaRobots: extracted.metaRobots,
      xRobotsTag: extracted.xRobotsTag,
      h1,
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
      outgoingInternalCount: new Set(internalLinks).size,
    }
    page.indexable = pageIndexable(page)
    return { page, urls: [...new Set(internalLinks)] }
  } catch (error) {
    return {
      urls: [],
      warning: `${url}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
