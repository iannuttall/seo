import { randomUUID } from 'node:crypto'
import { crawlOne } from './crawl-page.js'
import {
  attachCrawlRecommendations,
  topCrawlRecommendations,
} from './crawl-recommendations.js'
import { getPreviousRun, getRunPages, insertCrawlRun } from './crawl-store.js'
import type {
  CrawlDiffItem,
  CrawlDiffReport,
  CrawlPageSnapshot,
  CrawlRun,
} from './types.js'

export function compareCrawlPages(input: {
  current: CrawlPageSnapshot[]
  previous: CrawlPageSnapshot[]
}): CrawlDiffItem[] {
  const current = new Map(input.current.map((page) => [page.url, page]))
  const previous = new Map(input.previous.map((page) => [page.url, page]))
  const items: CrawlDiffItem[] = []

  for (const [url, page] of current.entries()) {
    const before = previous.get(url)
    if (!before) {
      items.push({ url, kind: 'added', changes: ['url_added'], after: page })
      continue
    }

    const changes: string[] = []
    if (before.status !== page.status) changes.push('status')
    if (before.title !== page.title) changes.push('title')
    if (before.metaDescription !== page.metaDescription) {
      changes.push('meta_description')
    }
    if (before.canonical !== page.canonical) changes.push('canonical')
    if (before.h1 !== page.h1) changes.push('h1')
    if (before.indexable !== page.indexable) changes.push('indexability')
    if (before.contentHash !== page.contentHash) changes.push('content')

    if (changes.length) {
      items.push({ url, kind: 'changed', changes, before, after: page })
    }
  }

  for (const [url, page] of previous.entries()) {
    if (!current.has(url)) {
      items.push({
        url,
        kind: 'removed',
        changes: ['url_removed'],
        before: page,
      })
    }
  }

  return items
}

export async function crawlDiff(input: {
  startUrl: string
  site?: string
  limit?: number
  refresh?: boolean
  js?: boolean | 'auto'
}): Promise<CrawlDiffReport> {
  const startUrl = new URL(input.startUrl).toString()
  const site = input.site ?? new URL(startUrl).origin
  const limit = input.limit ?? 50
  const queue = [startUrl]
  const seen = new Set<string>()
  const pages: CrawlPageSnapshot[] = []
  const warnings: string[] = []

  while (queue.length && pages.length < limit) {
    const url = queue.shift()
    if (!url || seen.has(url)) continue
    seen.add(url)
    const result = await crawlOne(url, {
      refresh: input.refresh,
      js: input.js ?? 'auto',
    })
    if (result.warning) warnings.push(result.warning)
    if (result.page) pages.push(result.page)
    for (const next of result.urls) {
      if (!seen.has(next) && queue.length + pages.length < limit * 3) {
        queue.push(next)
      }
    }
  }

  const run: CrawlRun = {
    id: randomUUID(),
    site,
    startUrl,
    createdAt: new Date().toISOString(),
    limit,
    urlCount: pages.length,
  }
  const previousRun = getPreviousRun({ site, startUrl, currentRunId: run.id })
  const previousPages = previousRun
    ? [...getRunPages(previousRun.id).values()]
    : []
  const items = previousRun
    ? attachCrawlRecommendations(
        compareCrawlPages({ current: pages, previous: previousPages }),
      )
    : []
  const recommendations = topCrawlRecommendations(items)
  insertCrawlRun(run, pages, recommendations)

  return {
    run,
    previousRun,
    summary: {
      crawled: pages.length,
      added: items.filter((item) => item.kind === 'added').length,
      removed: items.filter((item) => item.kind === 'removed').length,
      changed: items.filter((item) => item.kind === 'changed').length,
      newErrors: items.filter(
        (item) =>
          item.kind !== 'removed' &&
          (item.after?.status ?? 0) >= 400 &&
          (item.before?.status ?? 200) < 400,
      ).length,
      indexabilityFlips: items.filter((item) =>
        item.changes.includes('indexability'),
      ).length,
      highPriorityRecommendations: recommendations.filter(
        (item) => item.severity === 'high',
      ).length,
    },
    recommendations,
    items,
    warnings,
  }
}
