import { SeoError } from '../errors.js'
import { extractPage } from '../extract/page-extractor.js'
import { fetchPage } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { assertUrlMatchesGscProperty } from '../gsc/property-url.js'
import type { ExtractedPage, PageFetchResult } from '../types.js'
import {
  analyzePageOpportunitiesFromRows,
  type PageOpportunityAnalysis,
  type PageOpportunityItem,
} from './page-opportunities-analysis.js'
import {
  type PageOpportunityFocus,
  pageOpportunityFocus,
  pageOpportunityRecommendations,
  pageOpportunityVerdict,
} from './page-opportunities-presentation.js'
import { defaultDateRange } from './shared.js'

export * from './page-opportunities-analysis.js'

const MAX_BENCHMARK_ROWS = 100_000

type SearchAnalytics = typeof querySearchAnalytics
type FetchPage = typeof fetchPage
type ExtractPage = typeof extractPage

export type PageOpportunityInput = {
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
}

export type PageOpportunityReport = {
  site: string
  url: string
  generatedAt: string
  range: { startDate: string; endDate: string }
  rangeDays: number
  source: {
    provider: 'google-search-console'
    dimensions: ['query', 'page']
    searchType: 'web'
    dataState: 'final'
    targetRowsFetched: number
    targetCalls: number
  }
  dataStatus: PageOpportunityAnalysis['dataStatus']
  selection: PageOpportunityAnalysis['selection']
  verification: {
    status: 'verified' | 'skipped' | 'failed'
    reason: string
  }
  benchmark: {
    sourceRows: number
    eligibleRows: number
    excludedTargetRows: number
    rowsFetched: number
    calls: number
    maxRows: number
    possiblyTruncated: boolean
  }
  page?: {
    finalUrl: string
    status: number
    title?: string
    h1?: string
    wordCount: number
    fetchDiagnostics: PageFetchResult['diagnostics']
  }
  summary: {
    queries: number
    clicks: number
    impressions: number
    opportunities: number
    estimatedCtrClickShortfall: number
    /** @deprecated Use estimatedCtrClickShortfall. */
    estimatedClickLift: number
    verdict: string
    focus: PageOpportunityFocus
  }
  items: PageOpportunityItem[]
  warnings: string[]
  caveats: string[]
  recommendations: string[]
}

type PageOpportunityDependencies = {
  searchAnalytics: SearchAnalytics
  fetch: FetchPage
  extract: ExtractPage
  now: () => Date
}

const defaultDependencies: PageOpportunityDependencies = {
  searchAnalytics: querySearchAnalytics,
  fetch: fetchPage,
  extract: extractPage,
  now: () => new Date(),
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function reportDays(value?: number): number {
  if (value === undefined) return 28
  if (!Number.isInteger(value) || value < 1 || value > 548) {
    throw new SeoError(
      'INVALID_INPUT',
      'Days must be a whole number between 1 and 548.',
    )
  }
  return value
}

async function verifyPage(input: {
  url: string
  refresh?: boolean
  js?: boolean | 'auto'
  dependencies: PageOpportunityDependencies
}): Promise<{
  fetched?: PageFetchResult
  page?: ExtractedPage
  verification: PageOpportunityReport['verification']
  warnings: string[]
}> {
  const warnings: string[] = []
  let fetched: PageFetchResult
  try {
    fetched = await input.dependencies.fetch(input.url, {
      js: input.js ?? 'auto',
      refresh: input.refresh,
    })
    warnings.push(...fetched.warnings)
  } catch (error) {
    const reason = `Page fetch failed: ${errorMessage(error)}`
    return {
      verification: { status: 'failed', reason },
      warnings: [reason],
    }
  }

  try {
    const page = await input.dependencies.extract(fetched)
    warnings.push(...page.warnings)
    return {
      fetched,
      page,
      verification: {
        status: 'verified',
        reason: 'The live page was fetched and extracted for on-page checks.',
      },
      warnings: unique(warnings),
    }
  } catch (error) {
    const reason = `Page extraction failed: ${errorMessage(error)}`
    return {
      fetched,
      verification: { status: 'failed', reason },
      warnings: unique([...warnings, reason]),
    }
  }
}

function reportCaveats(input: {
  reportInput: PageOpportunityInput
  analysis: PageOpportunityAnalysis
  range: { startDate: string; endDate: string }
  benchmarkTruncated: boolean
  verification: PageOpportunityReport['verification']
}): string[] {
  const { analysis, reportInput, range } = input
  return [
    `Date window: ${range.startDate} to ${range.endDate}, using final GSC data where available.`,
    `Selection: ${analysis.selection.sourceRows} exact-URL rows, ${analysis.selection.eligibleRows} eligible, ${analysis.selection.returnedRows} returned.`,
    `Minimum query impressions: ${analysis.minImpressions}.`,
    `Brand filtering: ${reportInput.includeBrand ? 'brand queries included' : 'brand queries excluded when detected or configured'}.`,
    `Content verification: ${input.verification.status} (${input.verification.reason})`,
    'CTR benchmarks are directional. GSC query data omits anonymized queries and does not explain SERP features or intent changes.',
    input.benchmarkTruncated
      ? `The site-wide benchmark reached its ${MAX_BENCHMARK_ROWS.toLocaleString('en-US')}-row cap, so provenance is complete but the peer sample is truncated.`
      : '',
  ].filter(Boolean)
}

export async function pageOpportunitiesReport(
  input: PageOpportunityInput,
  dependencies: PageOpportunityDependencies = defaultDependencies,
): Promise<PageOpportunityReport> {
  const url = assertUrlMatchesGscProperty(input.site, input.url)
  const days = reportDays(input.days)
  const range = defaultDateRange(days)
  const targetResult = await dependencies.searchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
      dimensionFilterGroups: [
        {
          groupType: 'and',
          filters: [{ dimension: 'page', operator: 'equals', expression: url }],
        },
      ],
    },
    { refresh: input.refresh },
  )

  const preliminary = analyzePageOpportunitiesFromRows({
    targetRows: targetResult.rows,
    benchmarkRows: [],
    site: input.site,
    url,
    minImpressions: input.minImpressions,
    limit: input.limit,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })

  const shouldVerify =
    (input.verifyContent ?? true) && preliminary.eligibleRows > 0
  const verificationPromise: Promise<Awaited<ReturnType<typeof verifyPage>>> =
    shouldVerify
      ? verifyPage({
          url,
          refresh: input.refresh,
          js: input.js,
          dependencies,
        })
      : Promise.resolve({
          verification: {
            status: 'skipped' as const,
            reason:
              preliminary.eligibleRows === 0
                ? 'No eligible query rows required page verification.'
                : 'Page verification was disabled.',
          },
          warnings: [],
        })
  const benchmarkPromise =
    preliminary.eligibleRows > 0
      ? dependencies.searchAnalytics(
          input.site,
          {
            ...range,
            dimensions: ['query', 'page'],
            type: 'web',
            dataState: 'final',
            maxRows: MAX_BENCHMARK_ROWS,
          },
          { refresh: input.refresh },
        )
      : Promise.resolve({ rows: [], calls: 0, rowsFetched: 0 })

  const [verified, benchmarkResult] = await Promise.all([
    verificationPromise,
    benchmarkPromise,
  ])
  const analysis = analyzePageOpportunitiesFromRows({
    targetRows: targetResult.rows,
    benchmarkRows: benchmarkResult.rows,
    site: input.site,
    url,
    minImpressions: input.minImpressions,
    limit: input.limit,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
    page: verified.page,
    fetchDiagnostics: verified.fetched?.diagnostics,
    httpStatus: verified.fetched?.status,
  })
  const focus = pageOpportunityFocus(analysis.items)
  const verdict = pageOpportunityVerdict({ analysis, focus })
  const benchmarkTruncated = benchmarkResult.rowsFetched >= MAX_BENCHMARK_ROWS

  return {
    site: input.site,
    url,
    generatedAt: dependencies.now().toISOString(),
    range,
    rangeDays: days,
    source: {
      provider: 'google-search-console',
      dimensions: ['query', 'page'],
      searchType: 'web',
      dataState: 'final',
      targetRowsFetched: targetResult.rowsFetched,
      targetCalls: targetResult.calls,
    },
    dataStatus: analysis.dataStatus,
    selection: analysis.selection,
    verification: verified.verification,
    benchmark: {
      sourceRows: analysis.benchmarkSourceRows,
      eligibleRows: analysis.benchmarkEligibleRows,
      excludedTargetRows: analysis.excludedTargetBenchmarkRows,
      rowsFetched: benchmarkResult.rowsFetched,
      calls: benchmarkResult.calls,
      maxRows: MAX_BENCHMARK_ROWS,
      possiblyTruncated: benchmarkTruncated,
    },
    page:
      verified.page && verified.fetched
        ? {
            finalUrl: verified.page.finalUrl,
            status: verified.fetched.status,
            title: verified.page.title,
            h1: verified.page.headings.find((heading) => heading.level === 1)
              ?.text,
            wordCount: verified.page.wordCount,
            fetchDiagnostics: verified.fetched.diagnostics,
          }
        : undefined,
    summary: {
      queries: analysis.returnedRows,
      clicks: analysis.summary.clicks,
      impressions: analysis.summary.impressions,
      opportunities: analysis.summary.opportunities,
      estimatedCtrClickShortfall: analysis.summary.estimatedCtrClickShortfall,
      estimatedClickLift: analysis.summary.estimatedCtrClickShortfall,
      verdict,
      focus,
    },
    items: analysis.items,
    warnings: verified.warnings,
    caveats: reportCaveats({
      reportInput: input,
      analysis,
      range,
      benchmarkTruncated,
      verification: verified.verification,
    }),
    recommendations: pageOpportunityRecommendations(analysis),
  }
}
