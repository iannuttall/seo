import { explainRule } from '../../rules.js'
import { CRAWL_QUERY_VARIANTS_PER_PATH } from './crawl-url-queue.js'
import type { CrawlIssue } from './report.js'

export function crawlCaveats(input: {
  cancelled: boolean
  pageLimitReached: boolean
  maxPages: number
  queueSafetySkippedUrls: number
  queueSafetyInventoryCapped?: boolean
  originBackpressureSkippedUrls: number
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
