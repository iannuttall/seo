import type { CrawlReport } from '../analyze/crawler/report.js'
import type { CrawlPageSnapshot } from '../analyze/monitoring/types.js'
import type { GscRow } from '../types.js'
import type { LinkTargetCrawlEvidence } from './context-types.js'
import type { CollectedLinkEvidence, LinkTargetCount } from './types.js'

export type AggregatedSearchRow = {
  clicks: number
  impressions: number
  positionWeight: number
}

export function urlKey(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function compareTargets(left: LinkTargetCount, right: LinkTargetCount): number {
  return (
    right.observedLinks - left.observedLinks ||
    (left.targetUrl < right.targetUrl
      ? -1
      : left.targetUrl > right.targetUrl
        ? 1
        : 0)
  )
}

export function linkTargetCounts(
  evidence: CollectedLinkEvidence,
): LinkTargetCount[] {
  if (evidence.targetCounts.length) {
    return [...evidence.targetCounts].sort(compareTargets)
  }
  const counts = new Map<string, number>()
  for (const row of evidence.rows) {
    counts.set(row.targetUrl, (counts.get(row.targetUrl) ?? 0) + 1)
  }
  return [...counts]
    .map(([targetUrl, observedLinks]) => ({ targetUrl, observedLinks }))
    .sort(compareTargets)
}

export function crawlForLinkTargets(input: {
  report: CrawlReport | undefined
  targets: LinkTargetCount[]
}): {
  values: Map<string, LinkTargetCrawlEvidence>
  matched: number
} {
  const values = new Map<string, LinkTargetCrawlEvidence>()
  if (!input.report) {
    for (const target of input.targets) {
      values.set(target.targetUrl, {
        state: 'unavailable',
        reason: 'No matching saved crawl was available.',
      })
    }
    return { values, matched: 0 }
  }

  const pages = new Map<string, CrawlPageSnapshot>()
  for (const page of input.report.pages) {
    for (const value of [page.url, page.finalUrl]) {
      const key = urlKey(value)
      if (key && !pages.has(key)) pages.set(key, page)
    }
  }
  const issues = new Map<string, Set<string>>()
  for (const issue of input.report.issues) {
    const key = urlKey(issue.url)
    if (!key) continue
    const ids = issues.get(key) ?? new Set<string>()
    ids.add(issue.ruleId)
    issues.set(key, ids)
  }
  let matched = 0
  for (const target of input.targets) {
    const key = urlKey(target.targetUrl)
    const page = key ? pages.get(key) : undefined
    if (!page) {
      values.set(target.targetUrl, {
        state: 'not-observed',
        reason: 'The target URL was not present in the retained crawl pages.',
      })
      continue
    }
    matched += 1
    values.set(target.targetUrl, {
      state: 'observed',
      reportId: input.report.id,
      observedAt: input.report.generatedAt,
      status: page.status,
      finalUrl: page.finalUrl,
      indexable: page.indexable,
      canonical: page.canonical ?? null,
      issueIds: [...(issues.get(key as string) ?? [])].sort(),
    })
  }
  return { values, matched }
}

export function aggregateLinkSearchRows(
  rows: GscRow[],
): Map<string, AggregatedSearchRow> {
  const values = new Map<string, AggregatedSearchRow>()
  for (const row of rows) {
    const page = row.keys[0]
    const key = page ? urlKey(page) : null
    if (!key) continue
    const current = values.get(key) ?? {
      clicks: 0,
      impressions: 0,
      positionWeight: 0,
    }
    current.clicks += row.clicks
    current.impressions += row.impressions
    current.positionWeight += row.position * row.impressions
    values.set(key, current)
  }
  return values
}
