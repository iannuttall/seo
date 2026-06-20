import type { PageOpportunityReport } from './page-opportunities.js'
import { pageOpportunitiesReport } from './page-opportunities.js'

export type ContentOptimizationIntent =
  | 'comparison'
  | 'commercial'
  | 'how-to'
  | 'definition'
  | 'local'
  | 'navigational'
  | 'general'

export type ContentOptimizationReport = {
  site: string
  url: string
  generatedAt: string
  sourceReport: PageOpportunityReport
  summary: {
    score: number
    primaryIntent: ContentOptimizationIntent
    primaryQuery?: string
    queries: number
    opportunities: number
    estimatedClickLift: number
    verdict: string
  }
  intentMix: Array<{
    intent: ContentOptimizationIntent
    queries: number
    impressions: number
    clicks: number
  }>
  brief: {
    titleAngle?: string
    h1Angle?: string
    metaAngle?: string
    sections: Array<{
      heading: string
      why: string
      queries: string[]
    }>
    internalLinkAnchors: string[]
  }
  topActions: Array<{
    title: string
    plainEnglish: string
    action: string
    queries: string[]
  }>
  caveats: string[]
}

function intentFor(query: string): ContentOptimizationIntent {
  const value = query.toLowerCase()
  if (
    /\b(vs|versus|alternative|alternatives|compare|comparison|best)\b/.test(
      value,
    )
  ) {
    return 'comparison'
  }
  if (/\b(price|pricing|cost|buy|deal|coupon|review|reviews)\b/.test(value)) {
    return 'commercial'
  }
  if (/\b(how|steps|guide|tutorial|setup|fix|create|make)\b/.test(value)) {
    return 'how-to'
  }
  if (/\b(what is|meaning|definition|explained|why)\b/.test(value)) {
    return 'definition'
  }
  if (
    /\b(near me|city|state|county|postcode|zip|london|new york)\b/.test(value)
  ) {
    return 'local'
  }
  if (/\b(login|sign in|app|dashboard|support)\b/.test(value)) {
    return 'navigational'
  }
  return 'general'
}

function score(report: PageOpportunityReport): number {
  if (!report.items.length) return 0
  const actionableRatio = report.summary.opportunities / report.items.length
  const coveragePenalty =
    report.items.filter((item) => item.opportunityType === 'content-gap')
      .length * 8
  const framingPenalty =
    report.items.filter((item) => item.opportunityType === 'serp-framing')
      .length * 5
  const ctrPenalty =
    report.items.filter((item) => item.opportunityType === 'ctr').length * 4
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          actionableRatio * 40 -
          coveragePenalty -
          framingPenalty -
          ctrPenalty,
      ),
    ),
  )
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
}

function sectionHeading(
  intent: ContentOptimizationIntent,
  query: string,
): string {
  if (intent === 'comparison') return `${titleCase(query)}: what to choose`
  if (intent === 'how-to') return `How to ${query.replace(/^how to\s+/i, '')}`
  if (intent === 'definition') return `${titleCase(query)}, in plain English`
  if (intent === 'commercial')
    return `${titleCase(query)}: costs and trade-offs`
  return titleCase(query)
}

function intentMix(
  report: PageOpportunityReport,
): ContentOptimizationReport['intentMix'] {
  const groups = new Map<
    ContentOptimizationIntent,
    { queries: number; impressions: number; clicks: number }
  >()
  for (const item of report.items) {
    const intent = intentFor(item.query)
    const current = groups.get(intent) ?? {
      queries: 0,
      impressions: 0,
      clicks: 0,
    }
    current.queries += 1
    current.impressions += item.impressions
    current.clicks += item.clicks
    groups.set(intent, current)
  }
  return [...groups.entries()]
    .map(([intent, values]) => ({ intent, ...values }))
    .sort((a, b) => b.impressions - a.impressions)
}

function brief(
  report: PageOpportunityReport,
): ContentOptimizationReport['brief'] {
  const actionable = report.items
    .filter((item) => item.opportunityType !== 'covered')
    .sort((a, b) => b.estimatedClickLift - a.estimatedClickLift)
  const primary = actionable[0] ?? report.items[0]
  const sections = actionable.slice(0, 5).map((item) => {
    const intent = intentFor(item.query)
    return {
      heading: sectionHeading(intent, item.query),
      why: item.recommendation,
      queries: [
        item.query,
        ...actionable
          .filter(
            (candidate) =>
              candidate.query !== item.query &&
              intentFor(candidate.query) === intent,
          )
          .slice(0, 3)
          .map((candidate) => candidate.query),
      ],
    }
  })

  return {
    titleAngle: primary
      ? `Make the title clearly promise the "${primary.query}" answer.`
      : undefined,
    h1Angle: primary
      ? `Keep the H1 aligned with the page topic, then use subheadings for "${primary.query}" variants.`
      : undefined,
    metaAngle: primary
      ? `Use the meta description to state the outcome, trade-off, or direct answer searchers get.`
      : undefined,
    sections,
    internalLinkAnchors: actionable
      .slice(0, 8)
      .map((item) => item.query)
      .filter((query, index, values) => values.indexOf(query) === index),
  }
}

function topActions(
  report: PageOpportunityReport,
): ContentOptimizationReport['topActions'] {
  const gaps = report.items.filter(
    (item) => item.opportunityType === 'content-gap',
  )
  const framing = report.items.filter(
    (item) =>
      item.opportunityType === 'serp-framing' || item.opportunityType === 'ctr',
  )
  const ranking = report.items.filter(
    (item) => item.opportunityType === 'ranking',
  )
  const actions: ContentOptimizationReport['topActions'] = []

  if (gaps.length) {
    actions.push({
      title: 'Add missing answer coverage',
      plainEnglish: `${gaps.length} query angle needs clearer body coverage.`,
      action:
        'Add one useful section that directly answers the grouped query angles. Do not add one thin paragraph per query.',
      queries: gaps.slice(0, 8).map((item) => item.query),
    })
  }
  if (framing.length) {
    actions.push({
      title: 'Tighten the SERP framing',
      plainEnglish: `${framing.length} query angle looks covered but under-framed in title, H1, or meta copy.`,
      action:
        'Test clearer title/meta wording before rewriting the body. Keep the promise specific and human.',
      queries: framing.slice(0, 8).map((item) => item.query),
    })
  }
  if (ranking.length) {
    actions.push({
      title: 'Strengthen relevance and links',
      plainEnglish: `${ranking.length} query angle is still too low for a simple CTR change.`,
      action:
        'Improve the relevant answer block and add internal links from pages that already cover related demand.',
      queries: ranking.slice(0, 8).map((item) => item.query),
    })
  }
  if (!actions.length) {
    actions.push({
      title: 'Avoid unnecessary content expansion',
      plainEnglish:
        'The sampled queries look mostly covered. More copy may dilute the page.',
      action:
        'Review title/meta tests, internal links, and SERP format before adding new sections.',
      queries: report.items.slice(0, 5).map((item) => item.query),
    })
  }
  return actions
}

export function contentOptimizationFromPageOpportunities(
  sourceReport: PageOpportunityReport,
): ContentOptimizationReport {
  const mix = intentMix(sourceReport)
  const primaryIntent = mix[0]?.intent ?? 'general'
  const primaryQuery =
    sourceReport.items
      .filter((item) => item.opportunityType !== 'covered')
      .sort((a, b) => b.estimatedClickLift - a.estimatedClickLift)[0]?.query ??
    sourceReport.items[0]?.query

  return {
    site: sourceReport.site,
    url: sourceReport.url,
    generatedAt: new Date().toISOString(),
    sourceReport,
    summary: {
      score: score(sourceReport),
      primaryIntent,
      primaryQuery,
      queries: sourceReport.summary.queries,
      opportunities: sourceReport.summary.opportunities,
      estimatedClickLift: sourceReport.summary.estimatedClickLift,
      verdict: sourceReport.summary.verdict,
    },
    intentMix: mix,
    brief: brief(sourceReport),
    topActions: topActions(sourceReport),
    caveats: sourceReport.caveats,
  }
}

export async function contentOptimizationReport(input: {
  site: string
  url: string
  days?: number
  limit?: number
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  refresh?: boolean
  js?: boolean | 'auto'
}): Promise<ContentOptimizationReport> {
  return contentOptimizationFromPageOpportunities(
    await pageOpportunitiesReport(input),
  )
}
