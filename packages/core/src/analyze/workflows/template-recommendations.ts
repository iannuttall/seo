import type { QuickWinItem } from '../site-diagnostics/types.js'

type TemplateRecommendationInput = {
  templateId: string
  templateLabel: string
  items: QuickWinItem[]
}

function topQueries(items: QuickWinItem[], limit = 5): string[] {
  const queries: string[] = []
  for (const item of [...items]
    .sort(
      (left, right) =>
        right.estimatedCtrClickShortfall - left.estimatedCtrClickShortfall,
    )
    .slice(0, limit * 3)) {
    const query =
      item.query.length > 90 ? `${item.query.slice(0, 87)}...` : item.query
    if (!queries.includes(query)) queries.push(query)
    if (queries.length >= limit) break
  }
  return queries
}

export function templateOpportunityRecommendation(
  input: TemplateRecommendationInput,
): { action: string; evidence: string } {
  const urls = new Set(input.items.map((item) => item.url))
  const queries = topQueries(input.items, 3)
  const technicalUrls = new Set(
    input.items
      .filter(
        (item) =>
          item.contentVerification?.classification === 'technical-check',
      )
      .map((item) => item.url),
  )
  const evidence = `${input.items.length} eligible rows across ${urls.size} distinct URLs share the ${input.templateLabel} pattern. Example queries: ${queries.join('; ')}.`

  if (technicalUrls.size > 0) {
    return {
      evidence,
      action: `Fix verified technical evidence on ${technicalUrls.size} affected URLs before testing shared template changes.`,
    }
  }

  return {
    evidence,
    action: `Compare the live search results and verified page evidence across these ${urls.size} URLs before testing shared title, snippet, heading, or body changes.`,
  }
}
