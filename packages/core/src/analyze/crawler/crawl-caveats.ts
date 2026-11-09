import { explainRule } from '../../rules.js'
import { CRAWL_QUERY_VARIANTS_PER_PATH } from './crawl-url-queue.js'
import {
  type CrawlConfig,
  type CrawlIssue,
  type CrawlSitemapDiscovery,
  MAX_CRAWL_PAGES,
} from './report.js'

/** Reports rank a caveat with this prefix first and lead with it. */
export const CRAWL_COVERAGE_CAVEAT_PREFIX = 'Coverage incomplete:'

export function rateLimitRerunCommand(
  config: Pick<CrawlConfig, 'url' | 'mode' | 'strategy' | 'maxPages'> & {
    sitemapUrl?: string
  },
  intervalMs: number,
): string {
  const scope =
    config.strategy === 'health'
      ? ' --health'
      : config.mode === 'site'
        ? ''
        : ` --mode ${config.mode}`
  const sitemap = config.sitemapUrl ? ` --sitemap-url ${config.sitemapUrl}` : ''
  const slowMs = Math.min(8_000, Math.max(2_000, intervalMs * 2))
  return `seo crawl ${config.url}${scope}${sitemap} --max-pages ${config.maxPages} --concurrency 1 --fetch-interval-cap 1 --fetch-interval-ms ${slowMs}`
}

/** Set when the sitemaps list more URLs than the page limit let the crawl read. */
export function sitemapLimitCaveatInput(
  config: CrawlConfig,
  discovery: CrawlSitemapDiscovery | undefined,
  defaulted: boolean,
  sample?: { checked: number; read: number; sections: number },
): CrawlCaveatInput['sitemapLimit'] {
  if (!discovery) return undefined
  const truncated = discovery.roots.some((root) => root.possiblyTruncated)
  if (!sample && (discovery.urlsReturned < config.maxPages || !truncated)) {
    return undefined
  }
  return {
    maxPages: config.maxPages,
    defaulted,
    ceiling: MAX_CRAWL_PAGES,
    health: config.strategy === 'health',
    url: config.url,
    ...(sample ? { sample: { ...sample, readCapped: truncated } } : {}),
  }
}

type CrawlCaveatInput = Parameters<typeof crawlCaveats>[0]

export function crawlCaveats(input: {
  cancelled: boolean
  pageLimitReached: boolean
  maxPages: number
  queueSafetySkippedUrls: number
  queueSafetyInventoryCapped?: boolean
  originBackpressureSkippedUrls: number
  rateLimit?: { readPages: number; skippedUrls: number; rerunCommand: string }
  sitemapLimit?: {
    maxPages: number
    defaulted: boolean
    ceiling: number
    health: boolean
    url: string
    sample?: {
      checked: number
      read: number
      sections: number
      readCapped: boolean
    }
  }
  memoryPressureSkippedUrls: number
  queryVariantSkippedUrls?: number
  renderingFallbackUrls?: number
  reachIssues?: CrawlIssue[]
}): string[] {
  const caveats = input.cancelled
    ? ['Crawl cancelled before all queued URLs finished.']
    : input.pageLimitReached
      ? [`Stopped after reaching maxPages (${input.maxPages}).`]
      : []
  if (input.queueSafetySkippedUrls > 0) {
    caveats.push(
      input.queueSafetyInventoryCapped
        ? `Left at least ${input.queueSafetySkippedUrls} unique eligible same-origin URLs unqueued to keep this crawl bounded. The excluded-URL inventory reached its reporting cap. Increase --max-pages to inspect more.`
        : `Left ${input.queueSafetySkippedUrls} unique eligible same-origin URLs unqueued to keep this crawl bounded. Increase --max-pages to inspect more.`,
    )
  }
  if (input.originBackpressureSkippedUrls > 0) {
    caveats.push(
      `Stopped ${input.originBackpressureSkippedUrls} queued URL${input.originBackpressureSkippedUrls === 1 ? '' : 's'} because the origin stayed slow. This is incomplete crawl evidence, not a failed URL check.`,
    )
  }
  if (input.rateLimit) {
    const { readPages, skippedUrls, rerunCommand } = input.rateLimit
    caveats.push(
      `${CRAWL_COVERAGE_CAVEAT_PREFIX} read ${readPages} of ${readPages + skippedUrls} pages because the origin kept rate limiting the crawl (HTTP 429) after it backed off. Rerun slower: ${rerunCommand}`,
    )
  }
  if (input.sitemapLimit) {
    const { maxPages, defaulted, ceiling, health, url, sample } =
      input.sitemapLimit
    const rerun = `Raise --max-pages, up to ${ceiling.toLocaleString('en-US')}, to check more: seo crawl ${url}${health ? ' --health' : ''} --max-pages ${ceiling}`
    caveats.push(
      sample
        ? `Checked a sample of ${sample.checked.toLocaleString('en-US')} of the ${sample.read.toLocaleString('en-US')}${sample.readCapped ? '+' : ''} sitemap URLs read because the page limit is ${maxPages}${defaulted ? ' by default' : ''}. The sample takes URLs in turn from each of ${sample.sections} sections (the first path segment), shortest paths first, so no one section fills the crawl.${sample.readCapped ? ' The sitemaps list more URLs than the crawl read.' : ''} ${rerun}`
        : `Checked only the first ${maxPages} sitemap URLs because the page limit is ${maxPages}${defaulted ? ' by default' : ''}, and the sitemaps list more. ${rerun}`,
    )
  }
  if (input.memoryPressureSkippedUrls > 0) {
    caveats.push(
      `Left ${input.memoryPressureSkippedUrls} eligible URL${input.memoryPressureSkippedUrls === 1 ? '' : 's'} unchecked after the local memory safety limit was reached. Start with --health or lower --max-pages.`,
    )
  }
  const renderingFallbackUrls = input.renderingFallbackUrls ?? 0
  if (renderingFallbackUrls > 0) {
    caveats.push(
      `JavaScript rendering could not run for ${renderingFallbackUrls} page${renderingFallbackUrls === 1 ? '' : 's'}, so ${renderingFallbackUrls === 1 ? 'it was' : 'they were'} audited from raw HTML. Client-rendered content, metadata and links may be missing. Install Chromium or set SEO_BROWSER_EXECUTABLE_PATH, then rerun.`,
    )
  }
  const queryVariantSkippedUrls = input.queryVariantSkippedUrls ?? 0
  if (queryVariantSkippedUrls > 0) {
    caveats.push(
      `Left ${queryVariantSkippedUrls} query-string variant${queryVariantSkippedUrls === 1 ? '' : 's'} unqueued after ${CRAWL_QUERY_VARIANTS_PER_PATH} variants of the same path, so tracking parameters do not fill the crawl.`,
    )
  }
  for (const issue of input.reachIssues ?? []) {
    if (issue.detail) caveats.push(issue.detail)
  }
  return caveats
}

/**
 * A site crawl that found no internal links on the start page and no sitemap
 * URLs checked one page, so its other findings cannot stand for the site.
 */
export function crawlReachIssues(input: {
  startUrl: string
  pages: Array<{ url: string; outgoingInternalCount: number; usedJs?: boolean }>
  crawledPages: number
  sitemapUrlsReturned: number
}): CrawlIssue[] {
  const [page] = input.pages
  if (
    input.crawledPages !== 1 ||
    input.pages.length !== 1 ||
    !page ||
    page.outgoingInternalCount > 0 ||
    input.sitemapUrlsReturned > 0
  ) {
    return []
  }
  const rule = explainRule('crawl_single_page_reach')
  if (!rule)
    throw new Error('Missing rule guidance for crawl_single_page_reach')
  return [
    {
      ruleId: 'crawl_single_page_reach',
      title: rule.title,
      category: rule.category,
      severity: rule.defaultSeverity,
      url: page.url,
      detail: page.usedJs
        ? 'The rendered start page had 0 internal links and no sitemap returned URLs, so the crawl checked only this page. List the pages to check with --mode list.'
        : 'The start page had 0 internal links in its HTML and no sitemap returned URLs, so the crawl checked only this page. It probably builds its links with JavaScript. Rerun with --rendering on, or list the pages with --mode list.',
      evidence: {
        startUrl: input.startUrl,
        crawledPages: 1,
        outgoingInternalCount: 0,
        sitemapUrlsReturned: 0,
        rendered: Boolean(page.usedJs),
      },
    },
  ]
}
