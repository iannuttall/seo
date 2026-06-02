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
  return `This template has repeated quick-win queries. Update the shared title, H1, meta description, and intro copy so the recurring query wording is clear on every affected page.${examplesLine(queries)}`
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
        'Surname pages are ranking for origin, rarity, country popularity, and people-count queries. Make those angles obvious in the title, H1, meta description, and above-the-fold summary.',
    }
  }

  if (input.templateId === 'example-site-last-name-list') {
    return {
      evidence,
      action:
        'Last-name list pages are ranking for specific facets. Make the title, H1, meta description, and intro match the exact facet, such as letter, length, ethnicity, rarity, gender, or language.',
    }
  }

  if (input.templateId === 'example-site-first-name') {
    return {
      evidence,
      action:
        'First-name pages are ranking for meaning, origin, history, popularity, and gender queries. Make those angles explicit in the title, H1, meta description, and opening summary.',
    }
  }

  if (input.templateId === 'example-site-first-name-list') {
    return {
      evidence,
      action:
        'First-name list pages are ranking for specific facets. Make the title, H1, meta description, and intro match the exact facet, such as gender, origin, language, popularity, meaning, or starting letter.',
    }
  }

  if (input.templateId === 'example-site-location') {
    return {
      evidence,
      action:
        'Location tide pages are ranking for tide-time variants. Make the title, H1, meta description, and first content block clearly cover high tide today, low tide today, tide chart, and tide times for the exact location.',
    }
  }

  if (input.templateId.startsWith('example-site-')) {
    return {
      evidence,
      action:
        'Salary pages are ranking for pay-format variants. Make average salary, monthly salary, hourly pay, currency, job title, and location clear in the title, H1, meta description, and summary table.',
    }
  }

  if (input.templateId === 'tool-page') {
    return {
      evidence,
      action:
        'Tool pages are ranking for exact tool/action queries. Make the tool name, main action verb, and common “without login/account” modifiers clear in the title, H1, meta description, and first paragraph.',
    }
  }

  return { evidence, action: defaultRecommendation(input) }
}
