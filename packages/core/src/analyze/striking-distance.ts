import { shouldExcludeBrandQuery } from '../brand.js'
import type { FetchRateControls } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import {
  contentCoverageRecommendation,
  type QueryContentCoverage,
  verifyQueryContent,
} from './content-coverage.js'
import type { PageTemplate } from './page-patterns.js'
import { detectPageTemplate, summarizeTemplates } from './page-patterns.js'
import { isLowActionabilityQuery } from './query-quality.js'
import { defaultDateRange } from './shared.js'

export type StrikingDistanceItem = {
  query: string
  url: string
  template: PageTemplate
  clicks: number
  impressions: number
  ctr: number
  position: number
  opportunityScore: number
  contentVerification?: QueryContentCoverage
  action: string
}

export type StrikingDistanceGroup = {
  id: string
  label: string
  template: PageTemplate
  count: number
  totalImpressions: number
  bestPosition: number
  averagePosition: number
  sampleQueries: string[]
  sampleUrls: string[]
  recommendation: string
}

function normalizeSignal(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function combinedSignal(input: { queries: string[]; urls: string[] }): string {
  return normalizeSignal([...input.queries, ...input.urls].join(' '))
}

function opportunityNoun(count: number, label: string): string {
  if (count !== 1 && label.endsWith('opportunity')) {
    return `${label.slice(0, -1)}ies`
  }
  return count === 1 ? label : `${label}s`
}

function opportunityFamily(input: {
  queries: string[]
  urls: string[]
  template?: PageTemplate
}): string {
  const querySignal = normalizeSignal(input.queries.join(' '))
  const signal = combinedSignal(input)
  if (/\b(salary|salaries|wage|pay|income|hourly|monthly)\b/.test(signal)) {
    return 'pay'
  }
  if (
    /\b(tide|tides|high tide|low tide|tide chart|tide times)\b/.test(signal)
  ) {
    return 'local-schedule'
  }
  if (
    /\b(surname|last name|last names|first name|first names|meaning|origin|popularity|rarity|caste)\b/.test(
      querySignal || signal,
    )
  ) {
    return /\b(list|last names|first names)\b/.test(querySignal)
      ? 'list'
      : 'name'
  }
  if (
    /\b(alternative|alternatives|vs|versus|compare|comparison)\b/.test(signal)
  ) {
    return 'comparison'
  }
  if (
    input.template?.id === 'tool-page' ||
    /\b(tool|calculator|generator|checker|converter|template)\b/.test(signal)
  ) {
    return 'tool'
  }
  if (input.template?.confidence !== 'low') return 'template'
  return 'default'
}

function defaultAction(input: {
  query: string
  url: string
  template: PageTemplate
}): string {
  const family = opportunityFamily({
    queries: [input.query],
    urls: [input.url],
    template: input.template,
  })
  if (family === 'pay') {
    return `This pay-intent page is close to page one for "${input.query}". Make the role/entity, location, currency, average/monthly/hourly pay, and freshness signals clearer on ${input.url}, then add internal links from related comparison pages.`
  }
  if (family === 'local-schedule') {
    return `This local schedule page is close to page one for "${input.query}". Make the exact place, date/time, chart/table, and current-year wording clearer on ${input.url}, then link from nearby or parent location pages.`
  }
  if (family === 'name') {
    return `This entity page is close to page one for "${input.query}". Make meaning, origin, rarity/popularity, geography, and count answers easier to find on ${input.url}, then add internal links from related entity and list pages.`
  }
  if (family === 'list') {
    return `This list page is close to page one for "${input.query}". Tighten ${input.url} around the exact facet such as category, letter, length, attribute, popularity, or examples, then add internal links from related lists.`
  }
  if (family === 'tool') {
    return `This tool page is close to page one for "${input.query}". Make the main action, input/output, and common modifiers like "without login" clearer on ${input.url}, then add internal links from related docs or blog pages.`
  }
  if (family === 'comparison') {
    return `This comparison page is close to page one for "${input.query}". Make the winner, alternatives, comparison criteria, pricing/features, and internal links clearer on ${input.url}.`
  }
  if (family === 'template') {
    return `This templated page is close to page one for "${input.query}". Strengthen the exact query angle in the title/H1/intro and add internal links from related pages before creating new URLs.`
  }
  return `This query is close to page one. Strengthen ${input.url} around "${input.query}", put the query angle in title/H1 where natural, and add internal links from related pages before creating new content.`
}

function groupRecommendation(group: {
  template: PageTemplate
  count: number
  sampleQueries: string[]
  sampleUrls: string[]
}): string {
  const family = opportunityFamily({
    queries: group.sampleQueries,
    urls: group.sampleUrls,
    template: group.template,
  })
  const examples = group.sampleQueries.slice(0, 3).join('; ')
  const start = group.sampleUrls[0]
  if (family === 'pay') {
    return `${group.count} ${opportunityNoun(group.count, 'pay-intent opportunity')} ${group.count === 1 ? 'is' : 'are'} sitting in positions 11-20. Fix the shared template for average/monthly/hourly pay wording, freshness, currency, entity, and location signals, then add internal links into the highest-impression URLs${start ? ` starting with ${start}` : ''}.${examples ? ` Example queries: ${examples}.` : ''}`
  }
  if (family === 'name') {
    return `${group.count} ${opportunityNoun(group.count, 'entity-page opportunity')} ${group.count === 1 ? 'is' : 'are'} close to page one. Tighten the shared template around meaning, origin, rarity/popularity, geography, and count sections, then strengthen related entity/list internal links${start ? ` starting with ${start}` : ''}.${examples ? ` Example queries: ${examples}.` : ''}`
  }
  if (family === 'list') {
    return `${group.count} ${opportunityNoun(group.count, 'list-page opportunity')} ${group.count === 1 ? 'is' : 'are'} close to page one. Improve the shared list template around exact facets like category, letter, length, attribute, popularity, and examples, then add links between related list pages${start ? ` starting with ${start}` : ''}.${examples ? ` Example queries: ${examples}.` : ''}`
  }
  if (family === 'local-schedule') {
    return `${group.count} ${opportunityNoun(group.count, 'local schedule opportunity')} ${group.count === 1 ? 'is' : 'are'} close to page one. Improve the shared location template around exact place, date/time, chart/table, current-year wording, and local aliases, then add nearby-location links${start ? ` starting with ${start}` : ''}.${examples ? ` Example queries: ${examples}.` : ''}`
  }
  if (family === 'tool') {
    return `${group.count} ${opportunityNoun(group.count, 'tool-page opportunity')} ${group.count === 1 ? 'is' : 'are'} close to page one. Improve the shared tool-page framing around the action, input/output, proof, and common modifiers, then add internal links from docs/blog pages${start ? ` starting with ${start}` : ''}.${examples ? ` Example queries: ${examples}.` : ''}`
  }
  if (family === 'comparison') {
    return `${group.count} ${opportunityNoun(group.count, 'comparison/alternative opportunity')} ${group.count === 1 ? 'is' : 'are'} close to page one. Improve the shared comparison template around winner framing, alternatives, comparison criteria, pricing/features, and internal links${start ? ` starting with ${start}` : ''}.${examples ? ` Example queries: ${examples}.` : ''}`
  }
  if (family === 'template') {
    return `${group.count} ${opportunityNoun(group.count, 'templated-page opportunity')} ${group.count === 1 ? 'is' : 'are'} close to page one. Fix the shared title/H1/intro/internal-link pattern first, then manually review the highest-impression URLs${start ? ` starting with ${start}` : ''}.${examples ? ` Example queries: ${examples}.` : ''}`
  }
  return `${group.count} ${opportunityNoun(group.count, `${group.template.label} opportunity`)} ${group.count === 1 ? 'is' : 'are'} close to page one. Review the highest-impression URLs, strengthen the query-specific section, and add internal links before creating new pages${start ? ` starting with ${start}` : ''}.${examples ? ` Example queries: ${examples}.` : ''}`
}

function groupStrikingDistance(
  items: StrikingDistanceItem[],
): StrikingDistanceGroup[] {
  const groups = new Map<string, StrikingDistanceGroup>()
  for (const item of items) {
    const existing = groups.get(item.template.id) ?? {
      id: item.template.id,
      label: item.template.label,
      template: item.template,
      count: 0,
      totalImpressions: 0,
      bestPosition: item.position,
      averagePosition: 0,
      sampleQueries: [],
      sampleUrls: [],
      recommendation: '',
    }
    existing.count += 1
    existing.totalImpressions += item.impressions
    existing.bestPosition = Math.min(existing.bestPosition, item.position)
    existing.averagePosition += item.position
    if (existing.sampleQueries.length < 5) {
      existing.sampleQueries.push(item.query)
    }
    if (
      existing.sampleUrls.length < 3 &&
      !existing.sampleUrls.includes(item.url)
    ) {
      existing.sampleUrls.push(item.url)
    }
    groups.set(item.template.id, existing)
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      totalImpressions: Number(group.totalImpressions.toFixed(0)),
      averagePosition: Number((group.averagePosition / group.count).toFixed(1)),
      recommendation: groupRecommendation(group),
    }))
    .sort((a, b) => b.totalImpressions - a.totalImpressions)
}

function reportVerdict(input: {
  items: StrikingDistanceItem[]
  groups: StrikingDistanceGroup[]
}): string {
  if (!input.items.length) {
    return 'No position 11-20 opportunities matched these filters.'
  }
  const topGroup = input.groups[0]
  if (topGroup && topGroup.count >= 3) {
    return `${input.items.length} striking-distance opportunities found. The biggest leverage is ${topGroup.label}, with ${topGroup.count} rows and ${topGroup.totalImpressions.toFixed(0)} impressions.`
  }
  return `${input.items.length} striking-distance opportunities found. Start with the highest-impression query/page rows.`
}

export async function strikingDistance(input: {
  site: string
  days?: number
  minImpressions?: number
  maxCtr?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean | 'auto'
  rate?: FetchRateControls
  refresh?: boolean
}): Promise<{
  site: string
  generatedAt: string
  range: { startDate: string; endDate: string }
  verification:
    | { requested: false; verified: 0; failed: 0 }
    | { requested: true; limit: number; verified: number; failed: number }
  items: StrikingDistanceItem[]
  templates: ReturnType<typeof summarizeTemplates>
  groups: StrikingDistanceGroup[]
  summary: {
    opportunities: number
    groups: number
    totalImpressions: number
    brandFiltering: 'included' | 'excluded'
    verdict: string
  }
  caveats: string[]
  recommendations: string[]
}> {
  const range = defaultDateRange(input.days ?? 28)
  const minImpressions = input.minImpressions ?? 100
  const maxCtr = input.maxCtr ?? 0.03
  const result = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )

  const items: StrikingDistanceItem[] = result.rows
    .filter((row) => {
      const query = row.keys[0] ?? ''
      return (
        row.position >= 11 &&
        row.position <= 20 &&
        row.impressions >= minImpressions &&
        row.ctr <= maxCtr &&
        !isLowActionabilityQuery(query) &&
        !shouldExcludeBrandQuery({
          query,
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        })
      )
    })
    .map((row) => {
      const query = row.keys[0] ?? ''
      const url = row.keys[1] ?? ''
      const template = detectPageTemplate(url)
      const score =
        row.impressions * (21 - row.position) * (maxCtr - row.ctr + 0.005)
      return {
        query,
        url,
        template,
        clicks: Number(row.clicks.toFixed(3)),
        impressions: Number(row.impressions.toFixed(3)),
        ctr: Number(row.ctr.toFixed(4)),
        position: Number(row.position.toFixed(2)),
        opportunityScore: Number(score.toFixed(2)),
        action: defaultAction({
          query,
          url,
          template,
        }),
      }
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, input.limit ?? 25)

  if (input.verifyContent) {
    const verifyLimit = input.verifyLimit ?? 5
    for (const item of items.slice(0, verifyLimit)) {
      const contentVerification = await verifyQueryContent({
        query: item.query,
        url: item.url,
        js: input.js,
        refresh: input.refresh,
        rate: input.rate,
      })
      item.contentVerification = contentVerification
      if (contentVerification.status === 'verified') {
        item.action = contentCoverageRecommendation(contentVerification)
      }
    }
  }

  const groups = groupStrikingDistance(items)
  const summary = {
    opportunities: items.length,
    groups: groups.length,
    totalImpressions: items.reduce((sum, item) => sum + item.impressions, 0),
    brandFiltering: input.includeBrand ? 'included' : 'excluded',
    verdict: reportVerdict({ items, groups }),
  } as const

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    range,
    verification: input.verifyContent
      ? {
          requested: true,
          limit: input.verifyLimit ?? 5,
          verified: items.filter((item) => item.contentVerification).length,
          failed: items.filter(
            (item) => item.contentVerification?.status === 'failed',
          ).length,
        }
      : { requested: false, verified: 0, failed: 0 },
    items,
    templates: summarizeTemplates(items),
    groups,
    summary,
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate}.`,
      `Filters: position 11-20, at least ${minImpressions} impressions, CTR at or below ${(maxCtr * 100).toFixed(1)}%.`,
      `Brand filtering: ${input.includeBrand ? 'brand queries included' : 'brand queries excluded when detected/configured'}.`,
      `Content verification: ${input.verifyContent ? `requested for top ${input.verifyLimit ?? 5} row(s)` : 'not run'}.`,
    ],
    recommendations: groups.length
      ? groups.slice(0, 5).map((group) => group.recommendation)
      : [
          'No striking-distance action is recommended from this report. Lower --min-impressions or widen the date window if you want long-tail inspection.',
        ],
  }
}
