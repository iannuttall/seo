import type { CrawlPageSnapshot } from './types.js'

export function deduplicateCrawlPageSnapshots(
  pages: CrawlPageSnapshot[],
): CrawlPageSnapshot[] {
  const pagesByUrl = new Map<string, CrawlPageSnapshot>()
  for (const page of pages) {
    if (!pagesByUrl.has(page.url)) pagesByUrl.set(page.url, page)
  }
  return [...pagesByUrl.values()]
}
