import { normalizeText } from '../shared.js'
import type { QuickWinGroup, QuickWinItem } from './types.js'

function groupKey(item: QuickWinItem): string {
  return `${item.template.id}:${normalizeText(item.query)}`
}

function groupLabel(item: QuickWinItem): string {
  return `${item.template.label} - ${item.query}`
}

function groupAction(group: QuickWinGroup): string {
  if (group.template.id.startsWith('example-site-')) {
    return `Apply the same salary SERP-framing fix across ${group.count} pages for "${group.query}": title/H1/meta should expose job, location, currency, and monthly/hourly salary variants.`
  }
  if (group.template.id === 'example-site-location') {
    return `Apply the same tide SERP-framing fix across ${group.count} locations for "${group.query}": title/H1/meta should cover tide times, high/low tide, tide chart, year, and local place wording.`
  }
  if (group.template.id === 'example-site-surname') {
    return `Apply the same surname SERP-framing fix across ${group.count} pages for "${group.query}": title/H1/meta should make origin, meaning, rarity, geography, or people-count intent explicit.`
  }
  if (group.template.id.includes('name-list')) {
    return `Apply the same name-list SERP-framing fix across ${group.count} pages for "${group.query}": title/H1/meta should match the list facet exactly.`
  }
  return `Apply the same SERP-framing fix across ${group.count} affected URLs for "${group.query}".`
}

export function groupQuickWins(items: QuickWinItem[]): QuickWinGroup[] {
  const groups = new Map<string, QuickWinGroup>()

  for (const item of items) {
    const key = groupKey(item)
    const existing = groups.get(key) ?? {
      id: key,
      label: groupLabel(item),
      query: item.query,
      template: item.template,
      count: 0,
      totalEstimatedClickLift: 0,
      totalImpressions: 0,
      sampleUrls: [],
      recommendation: '',
    }
    existing.count += 1
    existing.totalEstimatedClickLift += item.estimatedClickLift
    existing.totalImpressions += item.impressions
    if (existing.sampleUrls.length < 3) existing.sampleUrls.push(item.url)
    groups.set(key, existing)
  }

  return [...groups.values()]
    .filter((group) => group.count >= 2)
    .map((group) => ({
      ...group,
      totalEstimatedClickLift: Number(group.totalEstimatedClickLift.toFixed(2)),
      totalImpressions: Number(group.totalImpressions.toFixed(0)),
      recommendation: groupAction(group),
    }))
    .sort(
      (a, b) =>
        b.totalEstimatedClickLift - a.totalEstimatedClickLift ||
        b.totalImpressions - a.totalImpressions,
    )
}
