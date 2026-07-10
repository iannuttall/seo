import { SeoError } from '../errors.js'
import type { FetchRateControls } from '../fetch/page-fetcher.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { finalGscDateRange } from '../gsc/dates.js'
import {
  contentCoverageRecommendation,
  type QueryContentCoverage,
  verifyQueryContent,
} from './content-coverage.js'
import type { TemplateSummary } from './page-patterns.js'
import {
  analyzeStrikingDistanceRows,
  type StrikingDistanceAnalysis,
  type StrikingDistanceAnalysisGroup,
  type StrikingDistanceAnalysisItem,
} from './striking-distance-analysis.js'

export * from './striking-distance-analysis.js'

const DEFAULT_DAYS = 28
const MAX_DAYS = 548
const DEFAULT_VERIFY_LIMIT = 5
const MAX_SOURCE_ROWS = 100_000

type SearchAnalytics = typeof querySearchAnalytics
type VerifyQueryContent = typeof verifyQueryContent

export type StrikingDistanceInput = {
  site: string
  days?: number
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
  searchAnalytics: SearchAnalytics
  verifyContent: VerifyQueryContent
  now: () => Date
}

const defaultDependencies: StrikingDistanceDependencies = {
  searchAnalytics: querySearchAnalytics,
  verifyContent: verifyQueryContent,
  now: () => new Date(),
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
  return `${analysis.summary.eligibleRows} eligible query/page rows found; ${analysis.summary.returnedRows} returned for review.`
}

export async function strikingDistance(
  input: StrikingDistanceInput,
  dependencies: StrikingDistanceDependencies = defaultDependencies,
): Promise<StrikingDistanceReport> {
  const days = reportDays(input.days)
  const generatedAt = dependencies.now().toISOString()
  const range = dateRange(days, new Date(generatedAt))
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
    input.verifyContent === true || input.verifyLimit !== undefined
  const attempted = verificationRequested
    ? Math.min(verifyLimit, analysis.items.length)
    : 0
  const items: StrikingDistanceItem[] = await Promise.all(
    analysis.items.map(async (item, index) => {
      if (index >= attempted) return item
      const contentVerification = await dependencies.verifyContent({
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
