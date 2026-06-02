import { shouldExcludeBrandQuery } from '../brand.js'
import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import type { PageFetchDiagnostics, QueryContentCoverage } from '../types.js'
import {
  contentCoverageRecommendation,
  queryContentCoverageFromPage,
} from './content-coverage.js'
import { CTR_BASELINE, defaultDateRange } from './shared.js'

export type PageOpportunityReport = {
  site: string
  url: string
  generatedAt: string
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
    return `This query ranks outside easy-win range; strengthen the on-page answer and label stack for "${input.query}", then add internal links using that wording.`
  }
  if (input.coverage) return contentCoverageRecommendation(input.coverage)
  if (input.type === 'ctr') {
    return `Test title/meta wording for "${input.query}" before rewriting body copy.`
  }
  return `Keep "${input.query}" covered; look for CTR, internal-link, or SERP-format improvements.`
}

export async function pageOpportunitiesReport(input: {
  site: string
  url: string
  days?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  refresh?: boolean
  js?: boolean | 'auto'
}): Promise<PageOpportunityReport> {
  const days = input.days ?? 28
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
        row.impressions > 0 &&
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

  return {
    site: input.site,
    url: input.url,
    generatedAt: new Date().toISOString(),
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
      opportunities: items.filter((item) => item.opportunityType !== 'covered')
        .length,
      estimatedClickLift: items.reduce(
        (sum, item) => sum + item.estimatedClickLift,
        0,
      ),
    },
    items,
    warnings,
  }
}
