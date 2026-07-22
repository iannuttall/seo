import { randomUUID } from 'node:crypto'
import { SeoError } from '../../errors.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { finalGscDateRange } from '../../gsc/dates.js'
import { countLabel } from '../../phrasing.js'
import type {
  ProviderCostEvidence,
  SearchMarket,
} from '../../providers/contracts.js'
import { searchMarketSchema } from '../../providers/contracts.js'
import { serpResultsReport } from '../serp-results.js'
import { analyzeLocalSearchRows } from './analysis.js'
import { localAnalyticsEvidence } from './analytics.js'
import { normalizeLocationTerms } from './intent.js'
import { buildLocalSerpInsights } from './serp-insights.js'
import type {
  LocalSearchInput,
  LocalSearchReport,
  LocalSerpEvidence,
} from './types.js'

const MAX_DAYS = 548
const MAX_ROWS = 50_000

export type LocalSearchDependencies = {
  searchAnalytics?: typeof querySearchAnalytics
  serpResults?: typeof serpResultsReport
  analyticsEvidence?: typeof localAnalyticsEvidence
  now?: () => Date
}

function boundedInteger(input: {
  value: number | undefined
  fallback: number
  minimum: number
  maximum: number
  label: string
}): number {
  const value = input.value ?? input.fallback
  if (
    !Number.isSafeInteger(value) ||
    value < input.minimum ||
    value > input.maximum
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `${input.label} must be a whole number between ${input.minimum} and ${input.maximum}.`,
    )
  }
  return value
}

function validateInput(input: LocalSearchInput) {
  const site = input.site.trim()
  if (!site) throw new SeoError('INVALID_INPUT', 'site must not be empty.')
  if (
    input.locationTerms &&
    (input.locationTerms.length > 100 ||
      input.locationTerms.some((term) => !term.trim() || term.length > 100))
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'locationTerms must contain at most 100 non-empty terms of 100 characters or fewer.',
    )
  }
  if (
    input.brandTerms &&
    (input.brandTerms.length > 20 ||
      input.brandTerms.some((term) => !term.trim() || term.length > 200))
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'brandTerms must contain at most 20 non-empty terms of 200 characters or fewer.',
    )
  }
  const includeSerps = input.includeSerps ?? false
  let market: SearchMarket | undefined
  if (input.market) {
    const parsed = searchMarketSchema.safeParse(input.market)
    if (!parsed.success)
      throw new SeoError('INVALID_INPUT', 'Use a valid search market.')
    market = parsed.data
  }
  if (includeSerps && !market?.location) {
    throw new SeoError(
      'INVALID_INPUT',
      'Local SERP evidence requires a country, language, and canonical location.',
    )
  }
  if (
    !includeSerps &&
    (input.market ||
      input.provider ||
      input.serpLimit !== undefined ||
      input.serpDepth !== undefined)
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Set includeSerps to true before passing market, provider, or SERP options.',
    )
  }
  const googleAnalyticsPropertyId = input.googleAnalyticsPropertyId
    ?.trim()
    .replace(/^properties\//u, '')
  if (
    googleAnalyticsPropertyId &&
    !/^\d{1,30}$/u.test(googleAnalyticsPropertyId)
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'googleAnalyticsPropertyId must be a numeric Google Analytics property id.',
    )
  }
  if (input.analyticsLimit !== undefined && !googleAnalyticsPropertyId) {
    throw new SeoError(
      'INVALID_INPUT',
      'Pass googleAnalyticsPropertyId before setting analyticsLimit.',
    )
  }
  return {
    site,
    days: boundedInteger({
      value: input.days,
      fallback: 28,
      minimum: 1,
      maximum: MAX_DAYS,
      label: 'days',
    }),
    locationTerms: normalizeLocationTerms(input.locationTerms),
    minImpressions: boundedInteger({
      value: input.minImpressions,
      fallback: 1,
      minimum: 0,
      maximum: 1_000_000_000,
      label: 'minImpressions',
    }),
    limit: boundedInteger({
      value: input.limit,
      fallback: 25,
      minimum: 1,
      maximum: 100,
      label: 'limit',
    }),
    maxRows: boundedInteger({
      value: input.maxRows,
      fallback: MAX_ROWS,
      minimum: 1,
      maximum: MAX_ROWS,
      label: 'maxRows',
    }),
    includeSerps,
    market,
    serpLimit: boundedInteger({
      value: input.serpLimit,
      fallback: 3,
      minimum: 1,
      maximum: 3,
      label: 'serpLimit',
    }),
    serpDepth: boundedInteger({
      value: input.serpDepth,
      fallback: 10,
      minimum: 1,
      maximum: 20,
      label: 'serpDepth',
    }),
    googleAnalyticsPropertyId,
    analyticsLimit: boundedInteger({
      value: input.analyticsLimit,
      fallback: 5_000,
      minimum: 1,
      maximum: 10_000,
      label: 'analyticsLimit',
    }),
  }
}

function emptyCost(): ProviderCostEvidence {
  return {
    currency: 'USD',
    estimatedMicros: 0,
    actualMicros: 0,
    taskIds: [],
  }
}

function aggregateCosts(costs: ProviderCostEvidence[]): ProviderCostEvidence {
  const estimated = costs.map((cost) => cost.estimatedMicros)
  const actual = costs.map((cost) => cost.actualMicros)
  return {
    currency: 'USD',
    estimatedMicros: estimated.some((value) => value === null)
      ? null
      : estimated.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    actualMicros: actual.some((value) => value === null)
      ? null
      : actual.reduce<number>((sum, value) => sum + (value ?? 0), 0),
    taskIds: [...new Set(costs.flatMap((cost) => cost.taskIds))].sort(),
  }
}

function costsWithUnknownRequest(
  costs: ProviderCostEvidence[],
): ProviderCostEvidence {
  return {
    currency: 'USD',
    estimatedMicros: null,
    actualMicros: null,
    taskIds: [...new Set(costs.flatMap((cost) => cost.taskIds))].sort(),
  }
}

async function acquireSerps(input: {
  requested: boolean
  queries: string[]
  market?: SearchMarket
  provider?: LocalSearchInput['provider']
  projectId?: string
  refresh?: boolean
  limit: number
  depth: number
  reportRunId: string
  run: typeof serpResultsReport
}): Promise<LocalSerpEvidence> {
  const selected = input.queries.slice(0, input.limit)
  const selection: LocalSerpEvidence['selection'] = {
    availableQueries: input.queries.length,
    requestedQueries: selected.length,
    omittedQueries: Math.max(0, input.queries.length - selected.length),
    limit: input.limit,
    depth: input.depth,
    method: 'highest-impression-local-queries-v1',
  }
  if (!input.requested) {
    return {
      requested: false,
      status: 'not-requested',
      selection,
      market: null,
      reports: [],
      cost: emptyCost(),
      reason:
        'Local SERP snapshots were not requested, so no paid provider work was attempted.',
    }
  }
  if (selected.length === 0) {
    return {
      requested: true,
      status: 'skipped',
      selection,
      market: input.market ?? null,
      reports: [],
      cost: emptyCost(),
      reason:
        'No retained local-intent query was available for a SERP snapshot.',
    }
  }
  if (!input.market) {
    throw new SeoError(
      'INVALID_INPUT',
      'Local SERP evidence requires a market.',
    )
  }
  const reports = []
  try {
    for (const query of selected) {
      reports.push(
        await input.run({
          keyword: query,
          market: input.market,
          depth: input.depth,
          provider: input.provider,
          projectId: input.projectId,
          context: {
            reportId: 'local-search-demand',
            reportRunId: input.reportRunId,
          },
          refresh: input.refresh,
        }),
      )
    }
  } catch (error) {
    if (
      error instanceof SeoError &&
      (error.code === 'PROVIDER_UNAVAILABLE' || error.code === 'RATE_LIMITED')
    ) {
      return {
        requested: true,
        status: reports.length > 0 ? 'partial' : 'unavailable',
        selection,
        market: input.market,
        reports,
        cost: costsWithUnknownRequest(
          reports.map((report) => report.evidence.cost),
        ),
        reason:
          'First-party local demand remains available, but not every requested SERP snapshot could be acquired.',
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      }
    }
    throw error
  }
  return {
    requested: true,
    status: reports.every((report) => report.dataStatus === 'complete')
      ? 'complete'
      : 'partial',
    selection,
    market: input.market,
    reports,
    cost: aggregateCosts(reports.map((report) => report.evidence.cost)),
  }
}

export async function localSearchReport(
  input: LocalSearchInput,
  dependencies: LocalSearchDependencies = {},
): Promise<LocalSearchReport> {
  const options = validateInput(input)
  const now = (dependencies.now ?? (() => new Date()))()
  const generatedAt = now.toISOString()
  const range = finalGscDateRange(options.days, now)
  const source = await (dependencies.searchAnalytics ?? querySearchAnalytics)(
    options.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
      maxRows: options.maxRows,
    },
    { refresh: input.refresh },
  )
  const analysis = analyzeLocalSearchRows({
    rows: source.rows,
    site: options.site,
    locationTerms: options.locationTerms,
    brandTerms: input.brandTerms,
    includeBrand: input.includeBrand,
    minImpressions: options.minImpressions,
    limit: options.limit,
  })
  const [serpEvidence, analyticsEvidence] = await Promise.all([
    acquireSerps({
      requested: options.includeSerps,
      queries: analysis.opportunities.map((item) => item.query),
      market: options.market,
      provider: input.provider,
      projectId: input.projectId,
      refresh: input.refresh,
      limit: options.serpLimit,
      depth: options.serpDepth,
      reportRunId: randomUUID(),
      run: dependencies.serpResults ?? serpResultsReport,
    }),
    (dependencies.analyticsEvidence ?? localAnalyticsEvidence)({
      propertyId: options.googleAnalyticsPropertyId,
      startDate: range.startDate,
      endDate: range.endDate,
      limit: options.analyticsLimit,
      localPageUrls: analysis.eligiblePageUrls,
      templates: analysis.templates,
      refresh: input.refresh,
    }),
  ])
  const serpInsights = buildLocalSerpInsights({
    site: options.site,
    reports: serpEvidence.reports,
  })
  const possiblyTruncated = source.rowsFetched >= options.maxRows
  const sourceEmpty = source.rows.length === 0
  const filtered = !sourceEmpty && analysis.selection.eligibleQueries === 0
  const partial =
    possiblyTruncated ||
    serpEvidence.status === 'partial' ||
    serpEvidence.status === 'unavailable' ||
    analyticsEvidence.source.completeness === 'partial' ||
    analyticsEvidence.status === 'unavailable'
  const opportunities = analysis.opportunities
  const localPackSnapshots = serpEvidence.reports.filter((report) =>
    report.evidence.data.features.includes('local_pack'),
  ).length
  const dataStatus: LocalSearchReport['dataStatus'] = sourceEmpty
    ? 'empty'
    : partial
      ? 'partial'
      : filtered
        ? 'filtered'
        : 'complete'
  const warnings: string[] = []
  if (possiblyTruncated) {
    warnings.push(
      `Search Console reached the ${options.maxRows}-row retention cap. Lower-volume local queries may be missing.`,
    )
  }
  if (analysis.selection.invalidRows > 0) {
    warnings.push(
      `${analysis.selection.invalidRows} malformed Search Console rows were excluded.`,
    )
  }
  if (analysis.selection.conflictingRows > 0) {
    warnings.push(
      `${analysis.selection.conflictingRows} conflicting duplicate Search Console rows were excluded.`,
    )
  }
  if (serpEvidence.error) warnings.push(serpEvidence.error.message)
  warnings.push(...analyticsEvidence.source.qualityWarnings)
  if (analyticsEvidence.status === 'unavailable' && analyticsEvidence.reason) {
    warnings.push(
      `Google Analytics geography was unavailable: ${analyticsEvidence.reason}`,
    )
  }
  const nextSteps: string[] = []
  if (!options.includeSerps) {
    nextSteps.push(
      'If the shortlisted queries justify paid verification, rerun with includeSerps true and an exact location and device to inspect current local result features and organic competitors.',
    )
  } else if (serpEvidence.status === 'unavailable') {
    nextSteps.push(
      'Check the provider connection, market support, and local spend limits before retrying the missing SERP snapshots.',
    )
  }
  if (!analyticsEvidence.requested && analysis.eligiblePageCount > 0) {
    nextSteps.push(
      'If visitor geography would change the page or service-area decision, rerun with a connected Google Analytics property. Geography is joined to landing pages, never inferred as the source of a Search Console query.',
    )
  } else if (analyticsEvidence.status === 'unavailable') {
    nextSteps.push(
      'Check the Google Analytics property connection before retrying the optional landing-page geography evidence.',
    )
  }
  if (serpInsights.organicCompetitors.available > 0) {
    nextSteps.push(
      'Classify the repeated local result domains as businesses, directories, publishers, communities or marketplaces before using them in competitor research.',
    )
  }
  if (analysis.templates.length > 0) {
    nextSteps.push(
      'Run pseo-audit on the strongest repeated local page pattern before expanding it; verify source fields, page uniqueness, indexability, and representative output.',
    )
  }
  if (opportunities.some((item) => item.action === 'review-page-overlap')) {
    nextSteps.push(
      'Review overlapping pages query by query before consolidating anything; multiple retained pages do not by themselves prove harmful cannibalisation.',
    )
  }
  nextSteps.push(
    'Use location terms for the actual service area and repeat the report for materially different markets or devices instead of treating one area as representative.',
  )

  return {
    schemaVersion: 1,
    methodology: 'local-search-demand-v1',
    site: options.site,
    generatedAt,
    range,
    rangeDays: options.days,
    dataStatus,
    source: {
      provider: 'google-search-console',
      dimensions: ['query', 'page'],
      searchType: 'web',
      dataState: 'final',
      rowsFetched: source.rowsFetched,
      calls: source.calls,
      maxRows: options.maxRows,
      possiblyTruncated,
      completeness: possiblyTruncated
        ? 'possibly-truncated'
        : 'retained-query-page-rows-only',
    },
    methodologyDetails: {
      intentMethod: 'explicit-local-intent-v1',
      suppliedLocationTerms: options.locationTerms,
      automaticPatterns: [
        'nearby-phrases',
        'uk-postcodes',
        'contextual-us-zip-codes',
      ],
      opportunityOrder: 'impressions-clicks-position-query-v1',
      templateMethod: 'pseo-url-template-clustering-v1',
      analyticsJoinMethod: 'landing-page-path-geography-v1',
      serpInsightMethod: 'local-serp-insights-v1',
    },
    selection: analysis.selection,
    summary: {
      localQueries: analysis.selection.eligibleQueries,
      returnedQueries: opportunities.length,
      pages: analysis.eligiblePageCount,
      ...analysis.eligibleSummary,
      templates: analysis.templates.length,
      serpSnapshots: serpEvidence.reports.length,
      localPackSnapshots,
      localPackListings: serpInsights.localPackListings.available,
      organicCompetitors: serpInsights.organicCompetitors.available,
      analyticsLocations: analyticsEvidence.locationCoverage.available,
      analyticsMatchedPages: analyticsEvidence.source.matchedPages,
      verdict: sourceEmpty
        ? 'Search Console returned no retained query/page rows for this date window.'
        : filtered
          ? 'No retained query/page rows matched the supplied terms or automatic local-intent patterns.'
          : `${countLabel(analysis.selection.eligibleQueries, 'local-intent query')} found; ${countLabel(opportunities.length, 'query')} returned for review.`,
    },
    opportunities,
    templates: analysis.templates,
    serpEvidence,
    serpInsights,
    analyticsEvidence,
    warnings,
    caveats: [
      'Search Console exposes retained top query/page rows and does not guarantee every query. A row cap means lower-volume local demand may be missing.',
      'Named-place, proximity, and postal-code matching are explicit heuristics. They can miss implicit local intent and postal-looking non-location terms.',
      "A place in a query describes query wording, not the searcher's physical location. Search Console average position is not an exact local rank.",
      'Google Analytics geography is joined only through an exact retained landing-page path. It describes measured users under Analytics rules and cannot prove which Search Console query brought a user.',
      'Retained local-pack listings come from the requested market, device, and observation. They do not prove listing ownership, complete Maps coverage, or Google Business Profile performance.',
      'Repeated URL patterns and page overlap are review signals, not proof that more pages should exist or that consolidation is required.',
      input.includeBrand
        ? 'Brand queries were included when they matched the local-intent rules.'
        : 'Brand-like queries were excluded using the site and supplied brand terms.',
    ],
    nextSteps,
  }
}
