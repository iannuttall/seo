import { normalizeText } from '../shared.js'
import type { PriorityQueueItem } from './types.js'

const GROUPABLE_SOURCES = new Set<PriorityQueueItem['source']>([
  'quick-win',
  'striking-distance',
])

function queueTemplateFamilyId(
  template?: PriorityQueueItem['template'],
): string {
  if (!template) return 'no-template'
  if (template.id.startsWith('example-site-')) return 'example-site-salary'
  return template.id
}

function groupKey(item: PriorityQueueItem): string | undefined {
  if (!GROUPABLE_SOURCES.has(item.source)) return undefined
  if (item.grouped) return undefined
  const templateId = queueTemplateFamilyId(item.template)
  return [
    item.source,
    item.category,
    templateId,
    normalizeText(item.title),
  ].join('|')
}

function targetGroupKey(item: PriorityQueueItem): string | undefined {
  if (!GROUPABLE_SOURCES.has(item.source)) return undefined
  if (item.grouped) return undefined
  const templateId = queueTemplateFamilyId(item.template)
  return [
    item.source,
    item.category,
    templateId,
    normalizeText(item.target),
  ].join('|')
}

function groupedAction(items: PriorityQueueItem[]): string {
  const first = items[0]
  if (!first) return ''
  const targetCount = new Set(items.map((item) => item.target)).size
  if (targetCount <= 1 && items.length <= 1) return first.action
  if (targetCount <= 1) {
    return `${items.length} findings point at this URL. Start with the highest-impact issue first: ${first.action}`
  }
  return `${targetCount} URLs have the same issue. Apply this action across the affected pages: ${first.action}`
}

function groupedEvidence(items: PriorityQueueItem[]): string {
  const totalImpact = items.reduce((sum, item) => sum + item.impact, 0)
  const actionCount = new Set(items.map((item) => item.action)).size
  const topTargets = items
    .slice(0, 3)
    .map((item) => item.target)
    .join(', ')
  const actionNote =
    actionCount > 1
      ? ` ${actionCount} action variants are preserved in grouped findings.`
      : ''
  return `Grouped ${items.length} matching findings; total impact ${totalImpact.toFixed(2)}.${actionNote} Top targets: ${topTargets}.`
}

function groupedItem(items: PriorityQueueItem[]): PriorityQueueItem {
  const sorted = [...items].sort((a, b) => b.score - a.score)
  const first = sorted[0]
  if (!first) {
    throw new Error('Cannot group an empty priority list.')
  }
  const totalImpact = sorted.reduce((sum, item) => sum + item.impact, 0)
  const totalScore = sorted.reduce((sum, item) => sum + item.score, 0)
  const score = Number(
    Math.min(
      first.score * (1 + Math.log1p(sorted.length - 1) / 8),
      300,
    ).toFixed(2),
  )

  return {
    ...first,
    score,
    impact: Number(totalImpact.toFixed(2)),
    action: groupedAction(sorted),
    evidence: groupedEvidence(sorted),
    grouped: {
      count: sorted.length,
      totalImpact: Number(totalImpact.toFixed(2)),
      totalScore: Number(totalScore.toFixed(2)),
      findings: sorted.map((item) => ({
        source: item.source,
        title: item.title,
        target: item.target,
        category: item.category,
        score: item.score,
        impact: item.impact,
        confidence: item.confidence,
        template: item.template,
        analytics: item.analytics,
        action: item.action,
        evidence: item.evidence,
      })),
    },
  }
}

function groupBy(
  items: PriorityQueueItem[],
  keyFor: (item: PriorityQueueItem) => string | undefined,
): PriorityQueueItem[] {
  const grouped = new Map<string, PriorityQueueItem[]>()
  const passthrough: PriorityQueueItem[] = []

  for (const item of items) {
    const key = keyFor(item)
    if (!key) {
      passthrough.push(item)
      continue
    }
    const group = grouped.get(key) ?? []
    group.push(item)
    grouped.set(key, group)
  }

  return [
    ...passthrough,
    ...[...grouped.values()].flatMap((items) =>
      items.length > 1 ? [groupedItem(items)] : items,
    ),
  ]
}

export function groupPriorityQueue(
  items: PriorityQueueItem[],
): PriorityQueueItem[] {
  const targetGrouped = groupBy(items, targetGroupKey)
  const queryGrouped = groupBy(targetGrouped, groupKey)
  return queryGrouped.sort((a, b) => b.score - a.score)
}
