import { shouldExcludeBrandQuery } from '../brand.js'
import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import type { PageFetchDiagnostics, QueryContentCoverage } from '../types.js'
import {
  contentCoverageRecommendation,
  queryContentCoverageFromPage,
} from './content-coverage.js'
import { isLowActionabilityQuery } from './query-quality.js'
import { CTR_BASELINE, defaultDateRange } from './shared.js'

export type PageOpportunityReport = {
  site: string
  url: string
  generatedAt: string
  range: { startDate: string; endDate: string }
  rangeDays: number
  page?: {
    finalUrl: string
    title?: string
    h1?: string
    wordCount: number
    fetchDiagnostics?: PageFetchDiagnostics
  }
  summary: {
    queries: number
    clicks: number
    impressions: number
    opportunities: number
    estimatedClickLift: number
    verdict: string
    focus:
      | 'content-gap'
      | 'serp-framing'
      | 'ranking'
      | 'ctr'
      | 'covered'
      | 'no-data'
  }
  items: Array<{
    query: string
    clicks: number
    impressions: number
    ctr: number
    position: number
    expectedCtr: number
    estimatedClickLift: number
    opportunityType:
      | 'ctr'
      | 'ranking'
      | 'content-gap'
      | 'serp-framing'
      | 'covered'
    recommendation: string
    coverage?: QueryContentCoverage
  }>
  warnings: string[]
  caveats: string[]
  recommendations: string[]
}

function plural(count: number, singular: string, pluralLabel: string): string {
  return count === 1 ? singular : pluralLabel
}

function expectedCtr(position: number): number {
  const rounded = Math.max(1, Math.min(10, Math.round(position)))
  return CTR_BASELINE[rounded] ?? 0.01
}

function opportunityType(input: {
  position: number
  ctr: number
  expectedCtr: number
  coverage?: QueryContentCoverage
}): PageOpportunityReport['items'][number]['opportunityType'] {
  if (input.coverage?.classification === 'content-gap') {
    return 'content-gap'
  }
  if (input.position > 20) return 'ranking'
  if (input.coverage?.classification === 'serp-framing') {
    return 'serp-framing'
  }
  if (input.position > 10 && input.position <= 20) return 'ranking'
  if (input.position <= 10 && input.ctr < input.expectedCtr * 0.65) return 'ctr'
  return 'covered'
}

function recommendationFor(input: {
  query: string
  type: PageOpportunityReport['items'][number]['opportunityType']
  coverage?: QueryContentCoverage
}): string {
  if (input.type === 'ranking') {
    return `"${input.query}" is ranking too low for a simple CTR tweak. Make the page answer this query more directly, then add internal links from related pages using this wording.`
  }
  if (input.coverage) return contentCoverageRecommendation(input.coverage)
  if (input.type === 'ctr') {
    return `"${input.query}" already ranks on page one but gets weak CTR. Test a clearer title and meta description for this angle before rewriting the page body.`
  }
  return `"${input.query}" is already covered. Do not add more copy just for this query; look for title/meta tests, internal links, or SERP features that explain the click gap.`
}

function primaryFocus(
  items: PageOpportunityReport['items'],
): PageOpportunityReport['summary']['focus'] {
  if (!items.length) return 'no-data'
  const actionable = items.filter((item) => item.opportunityType !== 'covered')
  if (!actionable.length) return 'covered'
  const counts = new Map<PageOpportunityReport['summary']['focus'], number>()
  for (const item of actionable) {
    counts.set(
      item.opportunityType,
      (counts.get(item.opportunityType) ?? 0) + 1,
    )
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'covered'
}

function pageVerdict(input: {
  focus: PageOpportunityReport['summary']['focus']
  opportunities: number
  estimatedClickLift: number
}): string {
  if (input.focus === 'no-data') {
    return 'No GSC query rows were found for this exact URL in the selected window.'
  }
  if (input.focus === 'covered') {
    return 'The sampled queries are mostly covered. Treat this as a SERP/title/internal-link review, not a content expansion brief.'
  }
  if (input.focus === 'content-gap') {
    return `${input.opportunities} ${plural(input.opportunities, 'query opportunity', 'query opportunities')} found. The main issue is content coverage, so add targeted answers before spending time on title tests.`
  }
  if (input.focus === 'serp-framing') {
    return `${input.opportunities} ${plural(input.opportunities, 'query opportunity', 'query opportunities')} found. The page appears to cover the topic, but the title/H1/meta do not make the search angle clear enough.`
  }
  if (input.focus === 'ranking') {
    return `${input.opportunities} ${plural(input.opportunities, 'query opportunity', 'query opportunities')} found. Most upside needs stronger relevance and internal links, not only CTR copy changes.`
  }
  return `${input.opportunities} ${plural(input.opportunities, 'query opportunity', 'query opportunities')} found, with about ${input.estimatedClickLift.toFixed(0)} estimated clicks available from better SERP framing.`
}

function pageRecommendations(items: PageOpportunityReport['items']): string[] {
  const actionable = items
    .filter((item) => item.opportunityType !== 'covered')
    .sort((a, b) => b.estimatedClickLift - a.estimatedClickLift)
  const top = actionable[0]
  if (!top) {
    return items.length
      ? [
          'Do not add more copy just because the page has query impressions. Review title/meta wording, internal links, and SERP features first.',
        ]
      : [
          'No page-level action is recommended from this report. Lower --min-impressions for long-tail inspection, or use query-cluster to find broader demand.',
        ]
  }
  const recommendations = [
    `Start with "${top.query}" because it has the clearest upside in this URL-level report. ${top.recommendation}`,
  ]
  const contentGaps = actionable.filter(
    (item) => item.opportunityType === 'content-gap',
  ).length
  const serpFraming = actionable.filter(
    (item) =>
      item.opportunityType === 'serp-framing' || item.opportunityType === 'ctr',
  ).length
  const ranking = actionable.filter(
    (item) => item.opportunityType === 'ranking',
  ).length
  if (contentGaps >= 3) {
    recommendations.push(
      `${contentGaps} queries look like content gaps. Group them into one useful section instead of adding thin one-query paragraphs.`,
    )
  }
  if (serpFraming >= 3) {
    recommendations.push(
      `${serpFraming} queries look like title/meta/SERP-framing issues. Test wording before rewriting the body.`,
    )
  }
  if (ranking >= 3) {
    recommendations.push(
      `${ranking} queries rank outside page one. Add internal links and make the relevant answer easier to find on the page before expecting CTR wins.`,
    )
  }
  return recommendations
}

function pageCaveats(input: {
  days: number
  range: { startDate: string; endDate: string }
  minImpressions: number
  includeBrand?: boolean
  verifyContent?: boolean
  fetched?: boolean
  warnings: string[]
}): string[] {
  return [
    `Date window: ${input.range.startDate} to ${input.range.endDate} (${input.days} ${plural(input.days, 'day', 'days')}), using final GSC data where available.`,
    `Minimum query impressions: ${input.minImpressions}.`,
    `Brand filtering: ${input.includeBrand ? 'brand queries included' : 'brand queries excluded when detected/configured'}.`,
    `Content verification: ${
      input.verifyContent
        ? input.fetched
          ? 'ran against the fetched page'
          : 'requested but did not complete'
        : 'not run'
    }.`,
    input.warnings.length
      ? `${input.warnings.length} fetch/extraction ${plural(input.warnings.length, 'warning', 'warnings')} affected this report.`
      : '',
  ].filter((item) => item.length > 0)
}

export async function pageOpportunitiesReport(input: {
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
}): Promise<PageOpportunityReport> {
  const days = input.days ?? 28
  const minImpressions = input.minImpressions ?? 10
  const range = defaultDateRange(days)
  const { rows } = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
      dimensionFilterGroups: [
        {
          groupType: 'and',
          filters: [
            { dimension: 'page', operator: 'equals', expression: input.url },
          ],
        },
      ],
    },
    { refresh: input.refresh },
  )
  const candidates = rows
    .map((row) => ({
      query: row.keys[0] ?? '',
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }))
    .filter(
      (row) =>
        row.query &&
        row.impressions >= minImpressions &&
        !isLowActionabilityQuery(row.query) &&
        !shouldExcludeBrandQuery({
          query: row.query,
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        }),
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, input.limit ?? 25)

  const warnings: string[] = []
  const fetched =
    (input.verifyContent ?? true)
      ? await fetchPage(input.url, {
          js: input.js ?? 'auto',
          refresh: input.refresh,
        }).catch((error) => {
          warnings.push(error instanceof Error ? error.message : String(error))
          return undefined
        })
      : undefined
  const page = fetched
    ? await extractPage(fetched).catch((error) => {
        warnings.push(error instanceof Error ? error.message : String(error))
        return undefined
      })
    : undefined

  const items = candidates.map((row) => {
    const expected = expectedCtr(row.position)
    const lift =
      row.position <= 10
        ? Math.max(0, expected * row.impressions - row.clicks)
        : row.position <= 20
          ? Math.max(0, 0.03 * row.impressions - row.clicks)
          : 0
    const coverage = page
      ? queryContentCoverageFromPage({
          query: row.query,
          url: input.url,
          page,
          fetchDiagnostics: fetched?.diagnostics,
        })
      : undefined
    const type = opportunityType({
      position: row.position,
      ctr: row.ctr,
      expectedCtr: expected,
      coverage,
    })

    return {
      ...row,
      expectedCtr: expected,
      estimatedClickLift: lift,
      opportunityType: type,
      recommendation: recommendationFor({
        query: row.query,
        type,
        coverage,
      }),
      coverage,
    }
  })

  const focus = primaryFocus(items)
  const estimatedClickLift = items.reduce(
    (sum, item) => sum + item.estimatedClickLift,
    0,
  )
  const opportunities = items.filter(
    (item) => item.opportunityType !== 'covered',
  ).length

  return {
    site: input.site,
    url: input.url,
    generatedAt: new Date().toISOString(),
    range,
    rangeDays: days,
    page: page
      ? {
          finalUrl: page.finalUrl,
          title: page.title,
          h1: page.headings.find((heading) => heading.level === 1)?.text,
          wordCount: page.wordCount,
          fetchDiagnostics: fetched?.diagnostics,
        }
      : undefined,
    summary: {
      queries: candidates.length,
      clicks: candidates.reduce((sum, item) => sum + item.clicks, 0),
      impressions: candidates.reduce((sum, item) => sum + item.impressions, 0),
      opportunities,
      estimatedClickLift,
      verdict: pageVerdict({ focus, opportunities, estimatedClickLift }),
      focus,
    },
    items,
    warnings,
    caveats: pageCaveats({
      days,
      range,
      minImpressions,
      includeBrand: input.includeBrand,
      verifyContent: input.verifyContent ?? true,
      fetched: Boolean(fetched),
      warnings,
    }),
    recommendations: pageRecommendations(items),
  }
}
