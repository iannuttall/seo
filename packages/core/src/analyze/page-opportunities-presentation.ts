import type {
  PageOpportunityAnalysis,
  PageOpportunityItem,
  PageOpportunityType,
} from './page-opportunities-analysis.js'

export type PageOpportunityFocus = PageOpportunityType | 'no-data'

const focusPriority: PageOpportunityType[] = [
  'technical-check',
  'content-gap',
  'serp-framing',
  'ranking',
  'ctr',
  'unverified',
  'covered',
]

const actionPriority = new Map(
  focusPriority.map((type, index) => [type, index] as const),
)

function plural(count: number, singular: string, pluralLabel: string): string {
  return count === 1 ? singular : pluralLabel
}

function actionable(item: PageOpportunityItem): boolean {
  return (
    item.opportunityType !== 'covered' && item.opportunityType !== 'unverified'
  )
}

function compareActions(
  left: PageOpportunityItem,
  right: PageOpportunityItem,
): number {
  return (
    (actionPriority.get(left.opportunityType) ?? 99) -
      (actionPriority.get(right.opportunityType) ?? 99) ||
    (right.estimatedCtrClickShortfall ?? -1) -
      (left.estimatedCtrClickShortfall ?? -1) ||
    right.impressions - left.impressions ||
    (left.query < right.query ? -1 : left.query > right.query ? 1 : 0)
  )
}

export function pageOpportunityFocus(
  items: PageOpportunityItem[],
): PageOpportunityFocus {
  if (!items.length) return 'no-data'
  if (items.some((item) => item.opportunityType === 'technical-check')) {
    return 'technical-check'
  }

  const counts = new Map<PageOpportunityType, number>()
  for (const item of items) {
    counts.set(
      item.opportunityType,
      (counts.get(item.opportunityType) ?? 0) + 1,
    )
  }
  return (
    [...counts.entries()].sort(
      ([leftType, leftCount], [rightType, rightCount]) =>
        rightCount - leftCount ||
        (actionPriority.get(leftType) ?? 99) -
          (actionPriority.get(rightType) ?? 99),
    )[0]?.[0] ?? 'no-data'
  )
}

function filteredReason(
  selection: PageOpportunityAnalysis['selection'],
): string {
  const reasons = [
    selection.belowMinimumRows
      ? `${selection.belowMinimumRows} below the impression threshold`
      : undefined,
    selection.brandRows ? `${selection.brandRows} branded` : undefined,
    selection.lowActionabilityRows
      ? `${selection.lowActionabilityRows} low-actionability`
      : undefined,
    selection.invalidRows ? `${selection.invalidRows} invalid` : undefined,
    selection.wrongPageRows
      ? `${selection.wrongPageRows} for another URL`
      : undefined,
  ].filter((reason): reason is string => Boolean(reason))

  return reasons.length ? ` Rows removed: ${reasons.join(', ')}.` : ''
}

export function pageOpportunityVerdict(input: {
  analysis: PageOpportunityAnalysis
  focus: PageOpportunityFocus
}): string {
  const { analysis, focus } = input
  if (analysis.dataStatus === 'empty') {
    return 'No GSC query rows were found for this exact URL in the selected window.'
  }
  if (analysis.dataStatus === 'filtered') {
    return `GSC returned rows for this URL, but none met the report criteria.${filteredReason(analysis.selection)}`
  }
  if (focus === 'technical-check') {
    return 'Technical fetch or indexability evidence needs checking before content or snippet changes.'
  }
  if (focus === 'unverified') {
    return 'GSC visibility exists, but the page was not verified and no specific change is justified yet.'
  }
  if (focus === 'covered') {
    return 'The verified page covers the sampled queries and CTR is not materially below its directional benchmark.'
  }

  const count = analysis.summary.opportunities
  const prefix = `${count} ${plural(count, 'actionable observation', 'actionable observations')} found.`
  if (focus === 'content-gap') {
    return `${prefix} Verified body coverage is the main issue; confirm intent before expanding the page.`
  }
  if (focus === 'serp-framing') {
    return `${prefix} The body is relevant, but its title, meta description, or H1 framing is weak.`
  }
  if (focus === 'ranking') {
    return `${prefix} Most upside requires stronger relevance or authority; no CTR-only lift is claimed for page-two queries.`
  }
  return `${prefix} The page-one CTR shortfall is about ${analysis.summary.estimatedCtrClickShortfall.toFixed(0)} clicks against the directional benchmark.`
}

export function pageOpportunityRecommendations(
  analysis: PageOpportunityAnalysis,
): string[] {
  const actions = analysis.items.filter(actionable).sort(compareActions)
  const top = actions[0]
  if (!top) {
    if (analysis.items.some((item) => item.opportunityType === 'unverified')) {
      return [
        'Verify the live page and current SERP before turning these GSC observations into an editing brief.',
      ]
    }
    return analysis.items.length
      ? [
          'Avoid an unnecessary rewrite. Monitor the queries and inspect current SERP formats before changing the page.',
        ]
      : [
          'No page-level action is justified from this result. Lower the impression threshold only when long-tail inspection is useful.',
        ]
  }

  const recommendations = [`Start with "${top.query}". ${top.recommendation}`]
  const technical = actions.filter(
    (item) => item.opportunityType === 'technical-check',
  ).length
  if (technical) {
    recommendations.push(
      `Resolve the technical evidence affecting ${technical} ${plural(technical, 'row', 'rows')} before content work.`,
    )
  }
  const gaps = actions.filter(
    (item) => item.opportunityType === 'content-gap',
  ).length
  if (gaps >= 3) {
    recommendations.push(
      `Group the ${gaps} verified content gaps into useful sections rather than adding one thin paragraph per query.`,
    )
  }
  return recommendations
}
