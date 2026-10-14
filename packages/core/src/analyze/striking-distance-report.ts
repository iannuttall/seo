import { SeoError } from '../errors.js'
import type { FetchRateControls } from '../fetch/page-fetcher/types.js'
import type { SearchAnalyticsQuery } from '../gsc/client/types.js'
import { finalGscDateRange } from '../gsc/dates.js'
import { countLabel } from '../phrasing.js'
import {
  contentCoverageRecommendation,
  type QueryContentCoverage,
  type QueryContentVerifier,
} from './content-coverage-analysis.js'
import type { TemplateSummary } from './page-patterns.js'
import { explicitDateRange } from './site-diagnostics/quick-wins-report-input.js'
import {
  analyzeStrikingDistanceRows,
  type StrikingDistanceAnalysis,
  type StrikingDistanceAnalysisGroup,
  type StrikingDistanceAnalysisItem,
} from './striking-distance-analysis.js'

const DEFAULT_DAYS = 28
const MAX_DAYS = 548
const DEFAULT_VERIFY_LIMIT = 5
const MAX_SOURCE_ROWS = 100_000

export type StrikingDistanceInput = {
  site: string
  /** Window length in days; ignored when startDate and endDate are given. */
  days?: number
  /** Explicit window start (YYYY-MM-DD); pass with endDate. */
  startDate?: string
  /** Explicit window end (YYYY-MM-DD); pass with startDate. */
  endDate?: string
  minImpressions?: number
  limit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  verifyContent?: boolean
  verifyLimit?: number
  js?: boolean | 'auto'
  rate?: FetchRateControls
  refresh?: boolean
}

export type StrikingDistanceItem = StrikingDistanceAnalysisItem & {
  contentVerification?: QueryContentCoverage
}

export type StrikingDistanceReport = {
  site: string
  generatedAt: string
  range: { startDate: string; endDate: string }
  rangeDays: number
  source: {
    provider: 'google-search-console'
    dimensions: ['query', 'page']
    searchType: 'web'
    dataState: 'final'
    rowsFetched: number
    calls: number
    maxRows: number
    possiblyTruncated: boolean
    completeness: 'retained-query-rows-only'
  }
  dataStatus: StrikingDistanceAnalysis['dataStatus']
  minImpressions: StrikingDistanceAnalysis['minImpressionsPolicy']
  brand: StrikingDistanceAnalysis['brand']
  selection: StrikingDistanceAnalysis['selection']
  methodology: StrikingDistanceAnalysis['methodology']
  verification:
    | { requested: false; attempted: 0; verified: 0; technical: 0; failed: 0 }
    | {
        requested: true
        limit: number
        attempted: number
        verified: number
        technical: number
        failed: number
      }
  items: StrikingDistanceItem[]
  templates: TemplateSummary[]
  groups: StrikingDistanceAnalysisGroup[]
  summary: StrikingDistanceAnalysis['summary'] & {
    brandFiltering: 'included' | 'excluded'
    verdict: string
  }
  caveats: string[]
  recommendations: string[]
}

export type StrikingDistanceDependencies = {
  searchAnalytics: SearchAnalyticsQuery
  /** Required only when page verification is requested. */
  verifyContent?: QueryContentVerifier
  now: () => Date
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.floor(value)))
}

function reportDays(value?: number): number {
  if (value === undefined) return DEFAULT_DAYS
  if (!Number.isInteger(value) || value < 1 || value > MAX_DAYS) {
    throw new SeoError(
      'INVALID_INPUT',
      `Days must be a whole number between 1 and ${MAX_DAYS}.`,
    )
  }
  return value
}

function dateRange(days: number, now: Date): StrikingDistanceReport['range'] {
  return finalGscDateRange(days, now)
}

function verifiedRecommendation(
  coverage: QueryContentCoverage,
): StrikingDistanceAnalysisItem['recommendation'] {
  if (coverage.status === 'failed') {
    return {
      type: 'verification-failed',
      confidence: 'low',
      evidence: coverage.error ?? 'The page could not be verified.',
      action: contentCoverageRecommendation(coverage),
    }
  }
  if (coverage.classification === 'technical-check') {
    return {
      type: 'fix-technical',
      confidence: 'medium',
      evidence: `Verified technical signals: ${coverage.signals.join(', ')}.`,
      action: contentCoverageRecommendation(coverage),
    }
  }
  return {
    type:
      coverage.classification === 'covered'
        ? 'investigate-ranking'
        : 'review-page-evidence',
    confidence: 'low',
    evidence: coverage.summary,
    action: contentCoverageRecommendation(coverage),
  }
}

function templatesFromGroups(
  groups: StrikingDistanceAnalysisGroup[],
): TemplateSummary[] {
  return groups.slice(0, 5).map((group) => ({
    id: group.id,
    label: group.label,
    count: group.rowCount,
    sampleUrls: group.sampleUrls,
  }))
}

function verdict(analysis: StrikingDistanceAnalysis): string {
  if (analysis.dataStatus === 'empty') {
    return 'Search Console returned no retained query/page rows for this date window.'
  }
  if (analysis.dataStatus === 'filtered') {
    return 'No retained query/page rows met the report filters.'
  }
  return `${countLabel(analysis.summary.eligibleRows, 'eligible query/page row')} found; ${countLabel(analysis.summary.returnedRows, 'row')} returned for review.`
}

export async function strikingDistanceWith(
  input: StrikingDistanceInput,
  dependencies: StrikingDistanceDependencies,
): Promise<StrikingDistanceReport> {
  const explicitRange = explicitDateRange(input, MAX_DAYS)
  const days = explicitRange?.days ?? reportDays(input.days)
  const generatedAt = dependencies.now().toISOString()
  const range = explicitRange?.range ?? dateRange(days, new Date(generatedAt))
  const result = await dependencies.searchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
      maxRows: MAX_SOURCE_ROWS,
    },
    { refresh: input.refresh },
  )
  const analysis = analyzeStrikingDistanceRows({
    rows: result.rows,
    site: input.site,
    minImpressions: input.minImpressions,
    limit: input.limit,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
  })
  const verifyLimit = boundedInteger(
    input.verifyLimit,
    DEFAULT_VERIFY_LIMIT,
    0,
    analysis.limit,
  )
  const verificationRequested =
    input.verifyContent === true ||
    (input.verifyContent !== false && input.verifyLimit !== undefined)
  const attempted = verificationRequested
    ? Math.min(verifyLimit, analysis.items.length)
    : 0
  const { verifyContent } = dependencies
  if (attempted > 0 && !verifyContent) {
    throw new SeoError(
      'INVALID_INPUT',
      'Page verification is not available in this environment.',
    )
  }
  const items: StrikingDistanceItem[] = await Promise.all(
    analysis.items.map(async (item, index) => {
      if (index >= attempted || !verifyContent) return item
      const contentVerification = await verifyContent({
        query: item.query,
        url: item.url,
        js: input.js,
        refresh: input.refresh,
        rate: input.rate,
        verifiedAt: generatedAt,
      })
      return {
        ...item,
        contentVerification,
        recommendation: verifiedRecommendation(contentVerification),
      }
    }),
  )
  const verifiedItems = items
    .slice(0, attempted)
    .map((item) => item.contentVerification)
    .filter((coverage): coverage is QueryContentCoverage => Boolean(coverage))
  const possiblyTruncated = result.rowsFetched >= MAX_SOURCE_ROWS

  return {
    site: input.site,
    generatedAt,
    range,
    rangeDays: days,
    source: {
      provider: 'google-search-console',
      dimensions: ['query', 'page'],
      searchType: 'web',
      dataState: 'final',
      rowsFetched: result.rowsFetched,
      calls: result.calls,
      maxRows: MAX_SOURCE_ROWS,
      possiblyTruncated,
      completeness: 'retained-query-rows-only',
    },
    dataStatus: analysis.dataStatus,
    minImpressions: analysis.minImpressionsPolicy,
    brand: analysis.brand,
    selection: analysis.selection,
    methodology: analysis.methodology,
    verification: verificationRequested
      ? {
          requested: true,
          limit: verifyLimit,
          attempted,
          verified: verifiedItems.filter((item) => item.status === 'verified')
            .length,
          technical: verifiedItems.filter(
            (item) => item.classification === 'technical-check',
          ).length,
          failed: verifiedItems.filter((item) => item.status === 'failed')
            .length,
        }
      : {
          requested: false,
          attempted: 0,
          verified: 0,
          technical: 0,
          failed: 0,
        },
    items,
    templates: templatesFromGroups(analysis.groups),
    groups: analysis.groups,
    summary: {
      ...analysis.summary,
      brandFiltering: input.includeBrand ? 'included' : 'excluded',
      verdict: verdict(analysis),
    },
    caveats: [
      `Date window: ${range.startDate} to ${range.endDate}, using final GSC data where available.`,
      `Selection: ${analysis.selection.sourceRows} source rows, ${analysis.selection.eligibleRows} eligible, ${analysis.selection.returnedRows} returned.`,
      analysis.minImpressionsPolicy.source === 'scaled-default'
        ? `Minimum impressions per query/page row: ${analysis.minImpressions}, scaled from ${analysis.minImpressionsPolicy.basisImpressions} retained impressions (1 in 5,000, between ${analysis.minImpressionsPolicy.scale.floor} and ${analysis.minImpressionsPolicy.scale.ceiling}); ${analysis.selection.belowMinimumRows} rows were below it. This scaling is a heuristic.`
        : `Minimum impressions per query/page row: ${analysis.minImpressions} (requested); ${analysis.selection.belowMinimumRows} rows were below it.`,
      `Brand queries: ${analysis.brand.filtering}. Brand terms used: ${analysis.brand.terms.join(', ') || 'none'} (${analysis.brand.source === 'provided' ? 'provided' : 'host forms, plus the bare domain stem only when Search Console shows the site is its navigational answer'}).`,
      analysis.selection.fragmentRows
        ? `${countLabel(analysis.selection.fragmentRows, 'source row')} with a #fragment URL merged into the base URL.`
        : '',
      analysis.selection.flaggedRows
        ? `${countLabel(analysis.selection.flaggedRows, 'eligible row')} carry heuristic query flags (likely-automated or navigational-other) and rank after unflagged rows.`
        : '',
      "Position is GSC average position for the property's topmost result per impression; it does not prove a URL ranked on a literal second results page every time.",
      'Search Analytics exposes retained query rows only. Anonymized and lower-value queries can be absent even when pagination is exhausted.',
      'Priority is a demand-and-position heuristic, not an estimated click lift or proof that a change will improve rankings.',
      `Content verification: ${verificationRequested ? `${attempted} ${attempted === 1 ? 'row' : 'rows'} attempted` : 'not run'}.`,
      possiblyTruncated
        ? `The report reached its ${MAX_SOURCE_ROWS.toLocaleString('en-US')}-row safety cap.`
        : '',
    ].filter(Boolean),
    recommendations: analysis.groups.length
      ? analysis.groups.slice(0, 5).map((group) => group.recommendation.action)
      : [
          'No action is recommended from this report. Lower the minimum impressions or widen the date window if you need long-tail inspection.',
        ],
  }
}
