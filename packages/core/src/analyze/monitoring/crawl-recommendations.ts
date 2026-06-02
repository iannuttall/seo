import type { CrawlDiffItem, CrawlDiffRecommendation } from './types.js'

function hasNoIndex(value?: string): boolean {
  return /\bnoindex\b/i.test(value ?? '')
}

function statusMovedToError(item: CrawlDiffItem): boolean {
  return (
    item.kind !== 'removed' &&
    (item.after?.status ?? 0) >= 400 &&
    (item.before?.status ?? 200) < 400
  )
}

function statusRecovered(item: CrawlDiffItem): boolean {
  return (
    item.kind === 'changed' &&
    (item.before?.status ?? 200) >= 400 &&
    (item.after?.status ?? 0) < 400
  )
}

function indexabilityLost(item: CrawlDiffItem): boolean {
  return (
    item.kind === 'changed' &&
    item.before?.indexable === true &&
    item.after?.indexable === false
  )
}

function canonicalChangedAway(item: CrawlDiffItem): boolean {
  return (
    item.kind === 'changed' &&
    item.changes.includes('canonical') &&
    Boolean(item.after?.canonical) &&
    item.after?.canonical !== item.after?.finalUrl
  )
}

export function recommendCrawlDiffItem(
  item: CrawlDiffItem,
): CrawlDiffRecommendation | undefined {
  if (statusMovedToError(item)) {
    return {
      severity: 'high',
      category: 'status',
      title: 'Search-visible URL now returns an error',
      action:
        'This URL used to be crawlable and now returns an error. Restore it if the page should still exist, or add one direct 301 to the closest live replacement before doing any content work.',
      confidence: 'high',
    }
  }

  if (item.kind === 'removed') {
    return {
      severity: 'high',
      category: 'inventory',
      title: 'Previously crawled URL disappeared',
      action:
        'This URL was in the previous crawl but is missing now. Confirm whether removal was intentional; if it had search traffic or links, restore it or redirect it to the best replacement.',
      confidence: 'medium',
    }
  }

  if (indexabilityLost(item)) {
    const noindex =
      hasNoIndex(item.after?.metaRobots) || hasNoIndex(item.after?.xRobotsTag)
    return {
      severity: 'high',
      category: 'indexability',
      title: 'URL became non-indexable',
      action: noindex
        ? 'This URL now has a noindex signal. Remove it if accidental, or mark this as intentional so it does not keep appearing as a risk.'
        : 'This URL used to be indexable and now is not. Check robots, canonical, status, and rendered HTML to find what changed.',
      confidence: noindex ? 'high' : 'medium',
    }
  }

  if (canonicalChangedAway(item)) {
    return {
      severity: 'medium',
      category: 'canonical',
      title: 'Canonical changed away from the final URL',
      action:
        'Google may treat a different URL as the preferred page now. If that is not intentional, restore the self-canonical or redirect directly to the preferred URL.',
      confidence: 'high',
    }
  }

  if (item.changes.includes('title') || item.changes.includes('h1')) {
    return {
      severity: 'medium',
      category: 'metadata',
      title: 'Primary SERP/on-page targeting changed',
      action:
        'The title or H1 changed. Compare the old and new wording against the top GSC queries for this URL before blaming traffic movement on content decay.',
      confidence: 'medium',
    }
  }

  if (item.changes.includes('meta_description')) {
    return {
      severity: 'low',
      category: 'metadata',
      title: 'Meta description changed',
      action:
        'The meta description changed. Check CTR for this URL before spending time on more copy edits.',
      confidence: 'medium',
    }
  }

  if (item.changes.includes('content')) {
    return {
      severity: 'low',
      category: 'content',
      title: 'Main content changed',
      action:
        'Main content changed. If traffic moved after this crawl, compare the changed section against the queries this URL ranks for.',
      confidence: 'medium',
    }
  }

  if (statusRecovered(item)) {
    return {
      severity: 'low',
      category: 'status',
      title: 'URL recovered from an error status',
      action:
        'The URL is no longer returning an error. Keep monitoring it and run URL Inspection if it was previously deindexed.',
      confidence: 'medium',
    }
  }

  return undefined
}

export function attachCrawlRecommendations(
  items: CrawlDiffItem[],
): CrawlDiffItem[] {
  return items.map((item) => ({
    ...item,
    recommendation: recommendCrawlDiffItem(item),
  }))
}

export function topCrawlRecommendations(
  items: CrawlDiffItem[],
): Array<CrawlDiffRecommendation & { url: string }> {
  const priority = { high: 3, medium: 2, low: 1 }
  return items
    .filter((item) => item.recommendation)
    .map((item) => ({
      ...(item.recommendation as CrawlDiffRecommendation),
      url: item.url,
    }))
    .sort((a, b) => priority[b.severity] - priority[a.severity])
}
