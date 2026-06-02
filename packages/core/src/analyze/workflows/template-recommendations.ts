import type { QuickWinItem } from '../site-diagnostics/types.js'

type TemplateRecommendationInput = {
  templateId: string
  templateLabel: string
  items: QuickWinItem[]
}

function topQueries(items: QuickWinItem[], limit = 5): string[] {
  const queries: string[] = []
  for (const item of items
    .sort((a, b) => b.estimatedClickLift - a.estimatedClickLift)
    .slice(0, limit * 3)) {
    const query =
      item.query.length > 90 ? `${item.query.slice(0, 87)}...` : item.query
    if (!queries.includes(query)) queries.push(query)
    if (queries.length >= limit) break
  }
  return queries
}

function classCounts(items: QuickWinItem[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = item.contentVerification?.classification ?? 'unverified'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function examplesLine(queries: string[]): string {
  return queries.length ? ` Examples: ${queries.join('; ')}.` : ''
}

function defaultRecommendation(input: TemplateRecommendationInput): string {
  const queries = topQueries(input.items, 3)
  return `Update the ${input.templateLabel} title, H1, meta description, and intro copy to match recurring query phrasing across the template.${examplesLine(queries)}`
}

export function templateOpportunityRecommendation(
  input: TemplateRecommendationInput,
): { action: string; evidence: string } {
  const queries = topQueries(input.items)
  const counts = classCounts(input.items)
  const evidence = `${input.items.length} quick-win opportunities share this template; checks: ${Object.entries(
    counts,
  )
    .map(([label, count]) => `${count} ${label}`)
    .join(', ')}.${examplesLine(queries.slice(0, 3))}`

  if (input.templateId === 'example-site-surname') {
    return {
      evidence,
      action:
        'Update the surname template to expose origin, rarity, country-specific popularity, and "how many people have this last name" phrasing in the title/H1/meta and above-the-fold summary.',
    }
  }

  if (input.templateId === 'example-site-first-name') {
    return {
      evidence,
      action:
        'Update the first-name template to make meaning, origin, history, popularity, and gender intent explicit in title/H1/meta and the opening summary.',
    }
  }

  if (input.templateId === 'example-site-location') {
    return {
      evidence,
      action:
        'Update the location tide template so title/H1/meta and the first content block explicitly cover high tide today, low tide today, tide chart, and tide times for the location.',
    }
  }

  if (input.templateId.startsWith('example-site-')) {
    return {
      evidence,
      action:
        'Update the salary template to cover average salary, monthly salary, hourly pay, currency, job title, and location variants in the title/H1/meta and summary table.',
    }
  }

  if (input.templateId === 'tool-page') {
    return {
      evidence,
      action:
        'Update the tool-page template so the exact tool name, main verb, and common “without login/account” modifiers are reflected in title/H1/meta and the first paragraph.',
    }
  }

  return { evidence, action: defaultRecommendation(input) }
}
