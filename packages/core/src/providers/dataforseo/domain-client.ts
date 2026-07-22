import type { ZodType } from 'zod'
import type {
  ProviderCapability,
  ProviderRequestContext,
} from '../contracts.js'
import { ProviderError } from '../errors.js'
import type {
  DataForSeoAccountSnapshot,
  DataForSeoDomainOverviewRequest,
  DataForSeoRankedKeywordsRequest,
  DataForSeoRankingPagesRequest,
  DataForSeoSerpCompetitorsRequest,
} from './client-types.js'
import {
  type DataForSeoDomainOverviewResponse,
  type DataForSeoRankedKeywordsResponse,
  type DataForSeoRankingPagesResponse,
  type DataForSeoSerpCompetitorsResponse,
  dataForSeoDomainOverviewResponseSchema,
  dataForSeoRankedKeywordsResponseSchema,
  dataForSeoRankingPagesResponseSchema,
  dataForSeoSerpCompetitorsResponseSchema,
} from './domain-schema.js'
import type {
  DataForSeoPaidResponse,
  DataForSeoUnitPrice,
} from './paid-request.js'

export const DEFAULT_DOMAIN_RESEARCH_TTL_MS = 7 * 24 * 60 * 60 * 1000

const DOMAIN_OVERVIEW_PATH =
  'v3/dataforseo_labs/google/domain_rank_overview/live'
const RANKED_KEYWORDS_PATH = 'v3/dataforseo_labs/google/ranked_keywords/live'
const RANKING_PAGES_PATH = 'v3/dataforseo_labs/google/relevant_pages/live'
const SERP_COMPETITORS_PATH = 'v3/dataforseo_labs/google/serp_competitors/live'
const MAX_DOMAIN_ROWS = 1_000
const MAX_DOMAIN_OFFSET = 100_000
const MAX_COMPETITOR_KEYWORDS = 200
const MAX_KEYWORD_CHARACTERS = 80
const MAX_KEYWORD_WORDS = 10
const DOMAIN_RESULT_TYPES = new Set([
  'organic',
  'paid',
  'featured_snippet',
  'local_pack',
  'ai_overview_reference',
])

export type DataForSeoDomainPaidRequest<T extends DataForSeoPaidResponse> = {
  operation: string
  capability: ProviderCapability
  endpoint: string
  request: unknown
  schema: ZodType<T>
  requestedRows: number
  price: (account: DataForSeoAccountSnapshot) => DataForSeoUnitPrice
  context: ProviderRequestContext
  ttlMs: number
  refresh?: boolean
  rowCount: (response: T) => number
}

function validateLocation(
  input: {
    languageCode: string
    locationCode?: number
    locationName?: string
    limit?: number
    offset?: number
  },
  operation: string,
): { locationName: string | undefined } {
  if (!/^[a-z]{2}$/.test(input.languageCode)) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation,
      code: 'configuration',
      message: 'DataForSEO language code must contain two lowercase letters.',
    })
  }
  const locationName = input.locationName?.trim()
  if ((input.locationCode !== undefined) === Boolean(locationName)) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation,
      code: 'configuration',
      message:
        'DataForSEO domain research requires exactly one location code or location name.',
    })
  }
  if (
    input.locationCode !== undefined &&
    (!Number.isSafeInteger(input.locationCode) || input.locationCode <= 0)
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation,
      code: 'configuration',
      message: 'DataForSEO location code must be a positive integer.',
    })
  }
  if (locationName && locationName.length > 500) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation,
      code: 'configuration',
      message: 'DataForSEO location name must be at most 500 characters.',
    })
  }
  if (
    input.limit !== undefined &&
    (!Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_DOMAIN_ROWS)
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation,
      code: 'configuration',
      message: `DataForSEO ${operation} limit must be from 1 to ${MAX_DOMAIN_ROWS}.`,
    })
  }
  if (
    input.offset !== undefined &&
    (!Number.isSafeInteger(input.offset) ||
      input.offset < 0 ||
      input.offset > MAX_DOMAIN_OFFSET)
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation,
      code: 'configuration',
      message: `DataForSEO ${operation} offset must be from 0 to ${MAX_DOMAIN_OFFSET}.`,
    })
  }
  return { locationName }
}

function validateResultTypes(
  resultTypes: string[],
  operation: string,
  allowAiOverview: boolean,
): void {
  const allowed = allowAiOverview
    ? DOMAIN_RESULT_TYPES
    : new Set(
        [...DOMAIN_RESULT_TYPES].filter(
          (item) => item !== 'ai_overview_reference',
        ),
      )
  if (
    resultTypes.length < 1 ||
    resultTypes.length > allowed.size ||
    new Set(resultTypes).size !== resultTypes.length ||
    resultTypes.some((item) => !allowed.has(item))
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation,
      code: 'configuration',
      message: `DataForSEO ${operation} received unsupported result types.`,
    })
  }
}

function locationRequest(input: {
  locationCode?: number
  locationName?: string
}): { location_code: number } | { location_name: string } {
  return input.locationCode !== undefined
    ? { location_code: input.locationCode }
    : { location_name: input.locationName as string }
}

function domainRows(response: {
  tasks: Array<{
    result?: Array<{ items?: unknown[] | null }> | null
  }>
}): number {
  return response.tasks.reduce(
    (taskTotal, task) =>
      taskTotal +
      (task.result ?? []).reduce(
        (resultTotal, result) => resultTotal + (result.items?.length ?? 0),
        0,
      ),
    0,
  )
}

export function domainOverviewPaidRequest(
  input: DataForSeoDomainOverviewRequest,
  ttlMs: number,
): DataForSeoDomainPaidRequest<DataForSeoDomainOverviewResponse> {
  const { locationName } = validateLocation(input, 'domain-overview')
  return {
    operation: 'domain-overview',
    capability: 'domain-overview',
    endpoint: DOMAIN_OVERVIEW_PATH,
    request: {
      target: input.target,
      language_code: input.languageCode,
      ...locationRequest({
        locationCode: input.locationCode,
        locationName,
      }),
    },
    schema: dataForSeoDomainOverviewResponseSchema,
    requestedRows: 1,
    price: (account) => account.domainResearchPrices.domainOverview,
    context: input.context,
    ttlMs,
    refresh: input.refresh,
    rowCount: domainRows,
  }
}

export function rankedKeywordsPaidRequest(
  input: DataForSeoRankedKeywordsRequest,
  ttlMs: number,
): DataForSeoDomainPaidRequest<DataForSeoRankedKeywordsResponse> {
  const { locationName } = validateLocation(input, 'ranked-keywords')
  validateResultTypes(input.resultTypes, 'ranked-keywords', true)
  return {
    operation: 'ranked-keywords',
    capability: 'ranked-keywords',
    endpoint: RANKED_KEYWORDS_PATH,
    request: {
      target: input.target,
      language_code: input.languageCode,
      ...locationRequest({
        locationCode: input.locationCode,
        locationName,
      }),
      include_subdomains: input.includeSubdomains,
      item_types: input.resultTypes,
      limit: input.limit,
      offset: input.offset ?? 0,
      order_by: input.orderBy,
      ...(input.filters?.length ? { filters: input.filters } : {}),
    },
    schema: dataForSeoRankedKeywordsResponseSchema,
    requestedRows: input.limit,
    price: (account) => account.domainResearchPrices.rankedKeywords,
    context: input.context,
    ttlMs,
    refresh: input.refresh,
    rowCount: domainRows,
  }
}

export function rankingPagesPaidRequest(
  input: DataForSeoRankingPagesRequest,
  ttlMs: number,
): DataForSeoDomainPaidRequest<DataForSeoRankingPagesResponse> {
  const { locationName } = validateLocation(input, 'ranking-pages')
  return {
    operation: 'ranking-pages',
    capability: 'relevant-pages',
    endpoint: RANKING_PAGES_PATH,
    request: {
      target: input.target,
      language_code: input.languageCode,
      ...locationRequest({
        locationCode: input.locationCode,
        locationName,
      }),
      limit: input.limit,
      offset: input.offset ?? 0,
      order_by: input.orderBy,
      ...(input.filters?.length ? { filters: input.filters } : {}),
    },
    schema: dataForSeoRankingPagesResponseSchema,
    requestedRows: input.limit,
    price: (account) => account.domainResearchPrices.rankingPages,
    context: input.context,
    ttlMs,
    refresh: input.refresh,
    rowCount: domainRows,
  }
}

export function serpCompetitorsPaidRequest(
  input: DataForSeoSerpCompetitorsRequest,
  ttlMs: number,
): DataForSeoDomainPaidRequest<DataForSeoSerpCompetitorsResponse> {
  const { locationName } = validateLocation(input, 'serp-competitors')
  validateResultTypes(input.resultTypes, 'serp-competitors', false)
  if (
    input.keywords.length < 1 ||
    input.keywords.length > MAX_COMPETITOR_KEYWORDS ||
    input.keywords.some(
      (keyword) =>
        keyword.length < 1 ||
        keyword.length > MAX_KEYWORD_CHARACTERS ||
        keyword.split(/\s+/u).length > MAX_KEYWORD_WORDS,
    )
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-competitors',
      code: 'configuration',
      message: `SERP competitors requires 1 to ${MAX_COMPETITOR_KEYWORDS} keywords of at most ${MAX_KEYWORD_CHARACTERS} characters and ${MAX_KEYWORD_WORDS} words.`,
    })
  }
  return {
    operation: 'serp-competitors',
    capability: 'serp-competitors',
    endpoint: SERP_COMPETITORS_PATH,
    request: {
      keywords: input.keywords,
      language_code: input.languageCode,
      ...locationRequest({
        locationCode: input.locationCode,
        locationName,
      }),
      include_subdomains: input.includeSubdomains,
      item_types: input.resultTypes,
      limit: input.limit,
      offset: input.offset ?? 0,
      order_by: input.orderBy,
    },
    schema: dataForSeoSerpCompetitorsResponseSchema,
    requestedRows: input.limit,
    price: (account) => account.domainResearchPrices.serpCompetitors,
    context: input.context,
    ttlMs,
    refresh: input.refresh,
    rowCount: domainRows,
  }
}
