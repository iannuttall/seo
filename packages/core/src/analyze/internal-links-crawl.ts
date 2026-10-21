import type { FileHandle } from 'node:fs/promises'
import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'cheerio'
import { createRobotsSession } from '../fetch/page-fetcher/robots.js'
import type { FetchRateControls } from '../fetch/page-fetcher/types.js'
import { createPageRenderer, fetchPage } from '../fetch/page-fetcher.js'
import type { ProgressReporter } from '../progress.js'
import {
  hasMetaRobotsDirective,
  hasXRobotsDirective,
} from '../robots-directives.js'
import type { PageFetchResult } from '../types.js'
import { sitemapSeeds } from './crawler/sitemap-discovery.js'
import { SiteIndex } from './internal-links-index.js'
import {
  GENERIC_ANCHORS,
  type LinkSentence,
  linkableSentences,
  placementPage,
  termCounts,
} from './internal-links-placement.js'
import { fetchSitemapUrls } from './monitoring/sitemaps.js'
import { normalizePageUrl } from './page-technical-signals.js'

// A bounded crawl for internal links, run on the person's machine. It keeps a
// small record per page (terms as numbers, links as numbers, a few facts)
// and writes each page's linkable sentences to a temporary file, so memory
// follows the pages being worked on, not the size of the site.

export const DEFAULT_MAX_PAGES = 500
export const MAX_MAX_PAGES = 5_000

const FETCH_CONCURRENCY = 6
// robots.txt crawl-delay is honoured up to this many seconds, and a site that
// asks for a delay is crawled for about this long at most.
const MAX_CRAWL_DELAY_SECONDS = 10
const CRAWL_DELAY_BUDGET_SECONDS = 900
// Linked URLs outside the crawl that are followed to see where they redirect.
const REDIRECT_CHECKS = 150
const GENERIC_ANCHOR_LIMIT = 100
const EXCERPT_CHARS = 500
const ASSET =
  /\.(avif|bmp|css|csv|dmg|docx?|eot|gif|gz|ico|jpe?g|js|json|map|mov|mp3|mp4|ogg|otf|pdf|png|pptx?|rss|svg|tar|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/i
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
  // Where the page's linkable sentences sit in the sentence file.
  text: { offset: number; length: number }
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
  sentences: SentenceStore
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

// Linkable sentences on disk: one JSON line per page, read back by position.
export class SentenceStore {
  private size = 0

  private constructor(
    private readonly dir: string,
    private readonly handle: FileHandle,
  ) {}

  static async open(): Promise<SentenceStore> {
    const dir = await mkdtemp(join(tmpdir(), 'seo-internal-links-'))
    return new SentenceStore(dir, await open(join(dir, 'sentences'), 'w+'))
  }

  async write(
    sentences: LinkSentence[],
  ): Promise<{ offset: number; length: number }> {
    const bytes = Buffer.from(
      JSON.stringify(sentences.map((s) => [s.text, s.section])),
    )
    const offset = this.size
    this.size += bytes.length
    await this.handle.write(bytes, 0, bytes.length, offset)
    return { offset, length: bytes.length }
  }

  async read(ref: { offset: number; length: number }): Promise<LinkSentence[]> {
    if (!ref.length) return []
    const bytes = Buffer.alloc(ref.length)
    await this.handle.read(bytes, 0, ref.length, ref.offset)
    return (JSON.parse(bytes.toString('utf8')) as [string, string][]).map(
      ([text, section]) => ({ text, section, hasLink: false }),
    )
  }

  async close(): Promise<void> {
    await this.handle.close().catch(() => undefined)
    await rm(this.dir, { recursive: true, force: true })
  }
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, '')

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

function excerptOf(sentences: LinkSentence[]): string {
  let out = ''
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence.text}` : sentence.text
    if (next.length > EXCERPT_CHARS) break
    out = next
  }
  return out || (sentences[0]?.text.slice(0, EXCERPT_CHARS) ?? '')
}

// What the crawl needs from a page's HTML, read in one light pass: the full
// page extractor also pulls main content, structured data and images, at ten
// times the cost.
function readPage(fetched: PageFetchResult, finalUrl: string) {
  const $ = load(fetched.html)
  const meta = (name: string) =>
    $(`meta[name="${name}" i]`)
      .map((_, element) => $(element).attr('content') ?? '')
      .get()
  const headings = $('h1, h2, h3')
    .map((_, element) => ({
      level: Number(element.tagName.slice(1)),
      text: $(element).text().replace(/\s+/g, ' ').trim(),
    }))
    .get()
    .filter((heading) => heading.text)
  const links = $('a[href]')
    .map((_, element) => {
      const anchor = $(element)
      return {
        href: anchor.attr('href') ?? '',
        text: anchor.text().replace(/\s+/g, ' ').trim(),
        location: anchor.closest('nav, header').length
          ? 'navigation'
          : anchor.closest('footer').length
            ? 'footer'
            : anchor.closest('main, article, [role="main"]').length
              ? 'main-content'
              : 'other',
      }
    })
    .get()
  const robots = [...meta('robots'), ...meta('googlebot')]
  return {
    title: $('title').first().text().replace(/\s+/g, ' ').trim(),
    metaDescription: meta('description')[0]?.trim() ?? '',
    canonical: $('link[rel~="canonical" i]').first().attr('href'),
    lang: $('html').attr('lang'),
    headings,
    links,
    nofollow: robots.some((value) => /\bnofollow\b/i.test(value)),
    noindex:
      hasMetaRobotsDirective(robots, 'noindex') ||
      hasXRobotsDirective(fetched.headers['x-robots-tag'], 'noindex'),
    url: finalUrl,
  }
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

export async function crawlForLinks(input: CrawlInput): Promise<SiteCrawl> {
  const warnings: string[] = []
  const robots = createRobotsSession({ refresh: input.refresh })
  const sentences = await SentenceStore.open()
  const renderer = createPageRenderer({ concurrency: 2 })
  try {
    return await crawl(input, robots, sentences, renderer, warnings)
  } catch (error) {
    await sentences.close()
    throw error
  } finally {
    await renderer.close()
  }
}

async function crawl(
  input: CrawlInput,
  robots: ReturnType<typeof createRobotsSession>,
  sentences: SentenceStore,
  renderer: ReturnType<typeof createPageRenderer>,
  warnings: string[],
): Promise<SiteCrawl> {
  const start = crawlUrl(input.startUrl) ?? input.startUrl
  let origin = new URL(start).origin
  const site = bareHost(new URL(start).host)
  const sameSite = (url: string) => {
    try {
      return bareHost(new URL(url).host) === site
    } catch {
      return false
    }
  }

  const urls: string[] = []
  const urlIds = new Map<string, number>()
  const idOf = (url: string): number => {
    let id = urlIds.get(url)
    if (id === undefined) {
      id = urls.length
      urls.push(url)
      urlIds.set(url, id)
    }
    return id
  }
  // URL id to the URL id it leads to: a redirect or a canonical.
  const aliases = new Map<number, number>()
  const pageOfUrl = new Map<number, number>()
  const pages: CrawledPage[] = []
  const index = new SiteIndex()
  const genericAnchors: SiteCrawl['genericAnchors'] = []
  const skipped: SiteCrawl['stats']['skipped'] = {}
  const skip = (reason: CrawlSkipReason) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1
  }

  const rootRobots = await robots.resolve(origin, start)
  const delay = await robots.crawlDelay(origin)
  const crawlDelaySeconds =
    delay === undefined ? null : Math.min(delay, MAX_CRAWL_DELAY_SECONDS)
  const pageLimit =
    crawlDelaySeconds === null
      ? input.maxPages
      : Math.min(
          input.maxPages,
          Math.max(
            20,
            Math.floor(CRAWL_DELAY_BUDGET_SECONDS / crawlDelaySeconds),
          ),
        )
  if (pageLimit < input.maxPages) {
    warnings.push(
      `robots.txt asks for ${crawlDelaySeconds} seconds between requests, so the crawl stopped at ${pageLimit} pages to finish in about ${CRAWL_DELAY_BUDGET_SECONDS / 60} minutes.`,
    )
  }
  const rate: FetchRateControls =
    crawlDelaySeconds === null
      ? {
          concurrency: FETCH_CONCURRENCY,
          intervalCap: FETCH_CONCURRENCY,
          intervalMs: 1000,
        }
      : {
          concurrency: 1,
          intervalCap: 1,
          intervalMs: Math.ceil(crawlDelaySeconds * 1000),
        }
  const options = {
    js: 'auto' as const,
    refresh: input.refresh,
    respectRobots: true,
    robotsResolver: robots.resolve,
    renderer,
    rate,
  }
  const stats = (extra: Partial<SiteCrawl['stats']> = {}) => ({
    maxPages: input.maxPages,
    pageLimit,
    urlsFound: 0,
    pagesCrawled: pages.length,
    capReached: false,
    skipped,
    crawlDelaySeconds,
    blockedByRobots: false,
    redirectsChecked: 0,
    ...extra,
  })
  if (rootRobots.allowed === false) {
    return {
      origin,
      method: 'links',
      pages,
      urls,
      pageOfUrl,
      index,
      sentences,
      genericAnchors,
      stats: stats({ blockedByRobots: true }),
      warnings: [`robots.txt does not allow this crawler to read ${start}.`],
    }
  }

  // Sitemap URLs first; with none, follow links from the start page.
  const declared = await robots.sitemapUrls(origin)
  const sitemap = await sitemapSeeds({
    url: origin,
    maxPages: pageLimit * 2,
    declaredSitemapUrls: declared,
    warnings,
    fetchSitemapUrls,
  })
  const seeds = sitemap.urls
    .map((url) => crawlUrl(url))
    .filter(
      (url): url is string =>
        Boolean(url) &&
        sameSite(url as string) &&
        !ASSET.test(new URL(url as string).pathname),
    )
  const method: SiteCrawl['method'] = seeds.length ? 'sitemap' : 'links'
  const queue: string[] = []
  const queued = new Set<string>()
  const maxQueue = pageLimit * 5
  const enqueue = (url: string | undefined) => {
    if (!url || queued.has(url) || queued.size >= maxQueue) return
    if (!sameSite(url) || ASSET.test(new URL(url).pathname)) return
    queued.add(url)
    idOf(url)
    queue.push(url)
  }
  enqueue(input.firstUrl ? crawlUrl(input.firstUrl) : undefined)
  if (method === 'sitemap') for (const url of seeds) enqueue(url)
  else enqueue(start)

  let overflow = 0
  const crawlOne = async (url: string): Promise<void> => {
    let fetched: PageFetchResult
    try {
      fetched = await fetchPage(url, options)
    } catch (error) {
      skip(
        error instanceof Error && error.name === 'RobotsAccessError'
          ? 'robots'
          : 'fetch-failed',
      )
      return
    }
    const finalUrl = crawlUrl(fetched.finalUrl) ?? url
    if (finalUrl !== url) aliases.set(idOf(url), idOf(finalUrl))
    if (!sameSite(finalUrl)) return skip('off-site')
    if (fetched.status < 200 || fetched.status > 299) return skip('http-error')
    if (!/html/i.test(fetched.headers['content-type'] ?? 'text/html')) {
      return skip('not-html')
    }
    let page: ReturnType<typeof readPage>
    try {
      page = readPage(fetched, finalUrl)
    } catch {
      return skip('fetch-failed')
    }
    const canonical = page.canonical
      ? crawlUrl(page.canonical, finalUrl)
      : undefined
    if (
      canonical &&
      sameSite(canonical) &&
      normalizePageUrl(canonical) !== normalizePageUrl(finalUrl)
    ) {
      aliases.set(idOf(finalUrl), idOf(canonical))
      enqueue(canonical)
      return skip('canonicalised')
    }
    const finalId = idOf(finalUrl)
    if (pageOfUrl.has(finalId)) return skip('duplicate')
    if (pages.length >= pageLimit) {
      overflow += 1
      return
    }
    const text = placementPage({ ...page, url: finalUrl, html: fetched.html })
    const contextual = new Set<number>()
    const other = new Set<number>()
    const id = pages.length
    // Without <main> or <article>, the body outside navigation, header and
    // footer is the content, as for sentences.
    const hasMain = /<(main|article)[\s>]|role=["']main["']/i.test(fetched.html)
    for (const link of page.links) {
      const href = crawlUrl(link.href, finalUrl)
      if (!href || !sameSite(href) || ASSET.test(new URL(href).pathname)) {
        continue
      }
      const hrefId = idOf(href)
      if (
        link.location === 'main-content' ||
        (!hasMain && link.location === 'other')
      ) {
        contextual.add(hrefId)
        if (
          GENERIC_ANCHORS.test(link.text.trim()) &&
          genericAnchors.length < GENERIC_ANCHOR_LIMIT
        ) {
          genericAnchors.push({ source: id, href, text: link.text.trim() })
        }
      } else other.add(hrefId)
    }
    // Number, record and index entry are taken together, with no await in
    // between, so parallel fetches cannot share a number or pass the limit.
    const record: CrawledPage = {
      url: finalUrl,
      title: text.title,
      h1: text.h1,
      description: text.description,
      headings: text.headings,
      excerpt: excerptOf(text.sentences),
      words: text.sentences.reduce(
        (sum, sentence) => sum + sentence.text.split(/\s+/).length,
        0,
      ),
      lang: page.lang?.toLowerCase().split(/[-_]/)[0] || null,
      noindex: page.noindex,
      contextual: [...contextual],
      other: [...other],
      text: { offset: 0, length: 0 },
    }
    pageOfUrl.set(finalId, id)
    pages.push(record)
    index.addPage(termCounts(text))
    record.text = await sentences.write(linkableSentences(text.sentences))
    if (method === 'links' && !page.nofollow) {
      for (const link of page.links) enqueue(crawlUrl(link.href, finalUrl))
    }
    if (pages.length % 50 === 0) {
      input.progress?.(`Crawled ${pages.length} pages of up to ${pageLimit}.`)
    }
  }

  const worker = async () => {
    while (pages.length < pageLimit) {
      const url = queue.shift()
      if (!url) {
        // Another worker may still add links to follow.
        if (active === 0) return
        await new Promise((resolve) => setTimeout(resolve, 50))
        continue
      }
      active += 1
      try {
        await crawlOne(url)
      } finally {
        active -= 1
      }
    }
  }
  let active = 0
  // The start page decides the origin when it redirects (to www, say).
  if (method === 'links' && queue[0] === start) {
    queue.shift()
    active += 1
    await crawlOne(start).finally(() => {
      active -= 1
    })
    const first = pages[0]
    if (first) origin = new URL(first.url).origin
  }
  await Promise.all(
    Array.from({ length: rate.concurrency ?? 1 }, () => worker()),
  )
  const capReached =
    pages.length >= pageLimit && (queue.length > 0 || overflow > 0)

  // Linked URLs that were not crawled may redirect to a crawled page; a link
  // through them is still a link to that page.
  const linkedCounts = new Map<number, number>()
  for (const page of pages) {
    for (const id of [...page.contextual, ...page.other]) {
      if (!pageOfUrl.has(id) && !aliases.has(id)) {
        linkedCounts.set(id, (linkedCounts.get(id) ?? 0) + 1)
      }
    }
  }
  const toCheck = [...linkedCounts]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .slice(0, REDIRECT_CHECKS)
  let redirectsChecked = 0
  await Promise.all(
    Array.from({ length: rate.concurrency ?? 1 }, async () => {
      while (toCheck.length) {
        const next = toCheck.shift()
        if (!next) break
        const url = urls[next[0]] as string
        try {
          const fetched = await fetchPage(url, { ...options, js: 'off' })
          redirectsChecked += 1
          const finalUrl = crawlUrl(fetched.finalUrl)
          if (finalUrl && finalUrl !== url) aliases.set(next[0], idOf(finalUrl))
        } catch {
          // Unreadable: the link stays unresolved.
        }
      }
    }),
  )

  // Every URL id that leads to a crawled page, through any chain of aliases.
  for (let id = 0; id < urls.length; id += 1) {
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
  index.finish()
  return {
    origin,
    method,
    pages,
    urls,
    pageOfUrl,
    index,
    sentences,
    genericAnchors,
    stats: stats({
      urlsFound: Math.max(queued.size, sitemap.discovery.urlsReturned),
      capReached,
      redirectsChecked,
    }),
    warnings,
  }
}
