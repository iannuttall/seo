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
        'Restore the page or add a direct 301 to the closest equivalent URL before content work.',
      confidence: 'high',
    }
  }

  if (item.kind === 'removed') {
    return {
      severity: 'high',
      category: 'inventory',
      title: 'Previously crawled URL disappeared',
      action:
        'Confirm whether this URL was intentionally removed; if it had search value, redirect it or restore internal links.',
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
        ? 'Remove accidental noindex directives or confirm this URL is intentionally excluded.'
        : 'Inspect robots, canonical, status, and rendered page state to find why this URL is no longer indexable.',
      confidence: noindex ? 'high' : 'medium',
    }
  }

  if (canonicalChangedAway(item)) {
    return {
      severity: 'medium',
      category: 'canonical',
      title: 'Canonical changed away from the final URL',
      action:
        'Confirm the canonical target is intentional; if not, restore self-canonical or redirect directly to the preferred URL.',
      confidence: 'high',
    }
  }

  if (item.changes.includes('title') || item.changes.includes('h1')) {
    return {
      severity: 'medium',
      category: 'metadata',
      title: 'Primary SERP/on-page targeting changed',
      action:
        'Review the title and H1 changes against top GSC queries before assuming traffic movement is content decay.',
      confidence: 'medium',
    }
  }

  if (item.changes.includes('meta_description')) {
    return {
      severity: 'low',
      category: 'metadata',
      title: 'Meta description changed',
      action:
        'Check CTR movement for this URL before spending time on copy edits.',
      confidence: 'medium',
    }
  }

  if (item.changes.includes('content')) {
    return {
      severity: 'low',
      category: 'content',
      title: 'Main content changed',
      action:
        'Compare the changed content with ranking query intent if traffic moved after this crawl.',
      confidence: 'medium',
    }
  }

  if (statusRecovered(item)) {
    return {
      severity: 'low',
      category: 'status',
      title: 'URL recovered from an error status',
      action:
        'Keep monitoring this URL and run URL Inspection if it was previously deindexed.',
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
