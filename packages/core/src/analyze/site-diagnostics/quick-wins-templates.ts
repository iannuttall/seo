import type {
  QuickWinItem,
  QuickWinTemplateRecommendation,
} from './quick-wins-types.js'

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

export function quickWinTemplateRecommendations(
  items: QuickWinItem[],
): QuickWinTemplateRecommendation[] {
  const byTemplate = new Map<string, QuickWinItem[]>()
  for (const item of items) {
    byTemplate.set(item.template.id, [
      ...(byTemplate.get(item.template.id) ?? []),
      item,
    ])
  }

  return [...byTemplate.entries()]
    .map(([templateId, templateItems]) => {
      const first = templateItems[0]
      if (!first || first.template.confidence === 'low') return undefined
      const urls = [...new Set(templateItems.map((item) => item.url))]
      if (urls.length < 2) return undefined
      const technicalUrls = new Set(
        templateItems
          .filter(
            (item) =>
              item.contentVerification?.classification === 'technical-check',
          )
          .map((item) => item.url),
      ).size
      const queries = unique(templateItems.map((item) => item.query)).slice(
        0,
        3,
      )
      return {
        templateId,
        templateLabel: first.template.label,
        rowCount: templateItems.length,
        urlCount: urls.length,
        totalEstimatedCtrClickShortfall: Number(
          templateItems
            .reduce((sum, item) => sum + item.estimatedCtrClickShortfall, 0)
            .toFixed(2),
        ),
        totalImpressions: Number(
          templateItems
            .reduce((sum, item) => sum + item.impressions, 0)
            .toFixed(0),
        ),
        action:
          technicalUrls > 0
            ? `Fix verified technical issues on ${technicalUrls} affected URLs before testing shared template changes.`
            : `Compare live results and verified page evidence for ${urls.length} affected URLs before testing a shared title, snippet, or heading change.`,
        evidence: `${templateItems.length} eligible rows across ${urls.length} distinct URLs share this recognised template. Example queries: ${queries.join('; ')}.`,
      }
    })
    .filter(
      (item): item is QuickWinTemplateRecommendation => item !== undefined,
    )
    .sort(
      (left, right) =>
        right.totalEstimatedCtrClickShortfall -
          left.totalEstimatedCtrClickShortfall ||
        right.totalImpressions - left.totalImpressions ||
        compareText(left.templateId, right.templateId),
    )
}

export function quickWinTemplateSummaries(items: QuickWinItem[]): Array<{
  id: string
  label: string
  rowCount: number
  urlCount: number
  sampleUrls: string[]
}> {
  const templates = new Map<
    string,
    { label: string; rows: number; urls: Set<string> }
  >()
  for (const item of items) {
    const current = templates.get(item.template.id) ?? {
      label: item.template.label,
      rows: 0,
      urls: new Set<string>(),
    }
    current.rows++
    current.urls.add(item.url)
    templates.set(item.template.id, current)
  }
  return [...templates.entries()]
    .map(([id, item]) => ({
      id,
      label: item.label,
      rowCount: item.rows,
      urlCount: item.urls.size,
      sampleUrls: [...item.urls].sort(compareText).slice(0, 3),
    }))
    .sort(
      (left, right) =>
        right.urlCount - left.urlCount ||
        right.rowCount - left.rowCount ||
        compareText(left.id, right.id),
    )
    .slice(0, 5)
}
