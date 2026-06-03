import { normalizeText } from '../shared.js'
import type { QuickWinGroup, QuickWinItem } from './types.js'

function groupKey(item: QuickWinItem): string {
  return `${item.template.id}:${normalizeText(item.query)}`
}

function groupLabel(item: QuickWinItem): string {
  return `${item.template.label} - ${item.query}`
}

function groupAction(group: QuickWinGroup): string {
  if (group.template.id.endsWith('-salary')) {
    return `${group.count} salary pages have the same quick-win pattern for "${group.query}". Update the shared template so the role/entity, location, currency, and monthly/hourly pay are clear in the title, H1, meta, and opening summary.`
  }
  if (group.template.id === 'location-schedule') {
    return `${group.count} location pages have the same quick-win pattern for "${group.query}". Update the shared template so the exact place, date/time, chart/table, current-year wording, and local aliases are clear before adding more copy.`
  }
  if (group.template.id === 'surname-entity') {
    return `${group.count} surname/entity pages have the same quick-win pattern for "${group.query}". Update the shared template so origin, meaning, rarity, geography, or people-count intent is obvious in the title, H1, meta, and intro.`
  }
  if (group.template.id.includes('name-list')) {
    return `${group.count} name-list pages have the same quick-win pattern for "${group.query}". Make the title, H1, meta, and intro match the exact list facet instead of using generic list wording.`
  }
  if (
    group.template.id === 'alternative-page' ||
    group.template.id === 'comparison-page'
  ) {
    return `${group.count} comparison/alternative pages have the same quick-win pattern for "${group.query}". Make the winner, criteria, pricing/features, and alternatives clearer in the title, H1, meta, and opening summary.`
  }
  return `${group.count} URLs have the same quick-win pattern for "${group.query}". Fix the shared title/H1/meta wording first, then check whether any page still needs unique body copy.`
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
