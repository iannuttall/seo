import type { ProgressReporter } from '../progress.js'
import type { SiteIndex } from './internal-links-index.js'
import type { LinkSentence } from './internal-links-placement.js'

// What a crawl for internal links hands to the analysis, shared by the crawl
// on the person's machine (internal-links-crawl.ts) and the hosted one. Pure
// code with no Node builtins, so it runs in Node and in Workers.

export const DEFAULT_MAX_PAGES = 500
export const MAX_MAX_PAGES = 5_000

const EXCERPT_CHARS = 500
const TRACKING = /^(utm_[a-z]+|gclid|fbclid|msclkid|mc_cid|mc_eid|ref)$/i

export type CrawlSkipReason =
  | 'robots'
  | 'not-html'
  | 'http-error'
  | 'fetch-failed'
  | 'canonicalised'
  | 'duplicate'
  | 'off-site'

export interface CrawledPage {
  url: string
  title: string
  h1: string
  description: string
  headings: string[]
  excerpt: string
  words: number
  lang: string | null
  noindex: boolean
  // Internal links found in the main content, and anywhere else, as URL ids.
  contextual: number[]
  other: number[]
  // Where the page's linkable sentences are kept, for `sentences.read`.
  text: { offset: number; length: number }
}

// Each page's linkable sentences, kept outside memory and read back a few
// pages at a time.
export interface SentenceSource {
  read(ref: { offset: number; length: number }): Promise<LinkSentence[]>
  close(): Promise<void>
}

export interface SiteCrawl {
  origin: string
  method: 'sitemap' | 'links'
  pages: CrawledPage[]
  // URL id to URL, and URL id to the page it ends on (after redirects and
  // canonicals), when that page was crawled.
  urls: string[]
  pageOfUrl: Map<number, number>
  index: SiteIndex
  sentences: SentenceSource
  genericAnchors: Array<{ source: number; href: string; text: string }>
  stats: {
    maxPages: number
    pageLimit: number
    urlsFound: number
    pagesCrawled: number
    capReached: boolean
    skipped: Partial<Record<CrawlSkipReason, number>>
    crawlDelaySeconds: number | null
    blockedByRobots: boolean
    redirectsChecked: number
  }
  warnings: string[]
}

export interface CrawlInput {
  // The page to start from, which sets the site.
  startUrl: string
  maxPages: number
  // Crawled first, so a target page is always included.
  firstUrl?: string
  refresh?: boolean
  progress?: ProgressReporter
}

// One form per page URL: no fragment, no tracking parameters.
export function crawlUrl(value: string, base?: string): string | undefined {
  try {
    const url = base ? new URL(value, base) : new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING.test(key)) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return undefined
  }
}

// The page's opening, for the judge: whole sentences up to 500 characters.
export function excerptOf(sentences: LinkSentence[]): string {
  let out = ''
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence.text}` : sentence.text
    if (next.length > EXCERPT_CHARS) break
    out = next
  }
  return out || (sentences[0]?.text.slice(0, EXCERPT_CHARS) ?? '')
}

// Adds to pageOfUrl every URL id that leads to a crawled page through any
// chain of aliases (a redirect or a canonical, URL id to URL id).
export function resolveAliases(
  urlCount: number,
  pageOfUrl: Map<number, number>,
  aliases: Map<number, number>,
): void {
  for (let id = 0; id < urlCount; id += 1) {
    if (pageOfUrl.has(id)) continue
    const seen = new Set<number>()
    let current: number | undefined = id
    while (current !== undefined && !seen.has(current)) {
      seen.add(current)
      const page = pageOfUrl.get(current)
      if (page !== undefined) {
        pageOfUrl.set(id, page)
        break
      }
      current = aliases.get(current)
    }
  }
}
