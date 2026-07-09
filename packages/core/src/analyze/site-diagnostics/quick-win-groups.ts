import type { QuickWinGroup, QuickWinItem } from './quick-wins-types.js'

function normalizedQuery(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .replace(/\s+/gu, ' ')
    .trim()
}

function groupKey(item: QuickWinItem): string {
  return `${item.template.id}:${normalizedQuery(item.query)}`
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function groupAction(input: {
  group: QuickWinGroup
  technicalUrls: number
}): string {
  if (input.technicalUrls > 0) {
    return `${input.technicalUrls} of ${input.group.urlCount} affected URLs have verified technical evidence. Fix those HTTP, indexability, redirect, or canonical issues before testing shared search-framing changes.`
  }
  return `${input.group.urlCount} distinct ${input.group.template.label.toLowerCase()} URLs share the query pattern "${input.group.query}". Compare their live search results and verified page evidence before testing a shared title, snippet, or heading change.`
}

export function groupQuickWins(items: QuickWinItem[]): QuickWinGroup[] {
  const groups = new Map<string, QuickWinItem[]>()
  for (const item of items) {
    const key = groupKey(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }

  return [...groups.entries()]
    .map(([id, groupItems]): QuickWinGroup | undefined => {
      const first = groupItems[0]
      if (!first || first.template.confidence === 'low') return undefined
      const urls = [...new Set(groupItems.map((item) => item.url))]
      if (urls.length < 2) return undefined
      const technicalUrls = new Set(
        groupItems
          .filter(
            (item) =>
              item.contentVerification?.classification === 'technical-check',
          )
          .map((item) => item.url),
      ).size
      const group: QuickWinGroup = {
        id,
        label: `${first.template.label} - ${first.query}`,
        query: first.query,
        template: first.template,
        rowCount: groupItems.length,
        urlCount: urls.length,
        totalEstimatedCtrClickShortfall: Number(
          groupItems
            .reduce((sum, item) => sum + item.estimatedCtrClickShortfall, 0)
            .toFixed(2),
        ),
        totalImpressions: Number(
          groupItems
            .reduce((sum, item) => sum + item.impressions, 0)
            .toFixed(0),
        ),
        sampleUrls: urls.slice(0, 3),
        recommendation: '',
      }
      group.recommendation = groupAction({ group, technicalUrls })
      return group
    })
    .filter((group): group is QuickWinGroup => group !== undefined)
    .sort(
      (left, right) =>
        right.totalEstimatedCtrClickShortfall -
          left.totalEstimatedCtrClickShortfall ||
        right.totalImpressions - left.totalImpressions ||
        compareText(left.id, right.id),
    )
}
