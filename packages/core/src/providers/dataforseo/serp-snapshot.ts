import { randomUUID } from 'node:crypto'
import type {
  ProviderEvidence,
  ProviderWarning,
  SerpLocalPackResult,
  SerpOrganicResult,
  SerpSnapshot,
  SerpSnapshotProvider,
  SerpSnapshotRequest,
} from '../contracts.js'
import { z } from 'zod/v4'
import { searchMarketSchema } from '../contracts.js'
import { ProviderError } from '../errors.js'
import {
  DataForSeoClient,
  type DataForSeoClientOptions,
  type DataForSeoSerpSnapshot,
} from './client.js'
import {
  compareCodepoints,
  locationRequest,
  normalizedKeyword,
} from './keyword-mapping.js'
import type { DataForSeoSerpResponse } from './serp-schema.js'

const MAX_SERP_DEPTH = 100
const SERP_ENDPOINT = 'v3/serp/google/organic/live/advanced'

type SerpClient = Pick<DataForSeoClient, 'serpLive'>

export type DataForSeoSerpSnapshotProviderOptions = DataForSeoClientOptions & {
  client?: SerpClient
}

type SerpResult = NonNullable<
  NonNullable<DataForSeoSerpResponse['tasks'][number]['result']>[number]
>
type SerpItem = NonNullable<SerpResult['items']>[number]

const localPackRatingSchema = z
  .object({
    rating_type: z.string().trim().min(1).max(100).nullable().optional(),
    value: z.number().finite().nonnegative().nullable().optional(),
    votes_count: z.number().int().nonnegative().nullable().optional(),
    rating_max: z.number().finite().positive().nullable().optional(),
  })
  .passthrough()

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    return null
  }
}

function validOrganic(item: SerpItem): item is SerpItem & {
  rank_group: number
  rank_absolute: number
  page: number
  domain: string
  url: string
} {
  return (
    item.type === 'organic' &&
    Number.isSafeInteger(item.rank_group) &&
    (item.rank_group ?? 0) > 0 &&
    Number.isSafeInteger(item.rank_absolute) &&
    (item.rank_absolute ?? 0) > 0 &&
    Number.isSafeInteger(item.page) &&
    (item.page ?? 0) > 0 &&
    Boolean(item.domain?.trim()) &&
    safeUrl(item.url) !== null
  )
}

function organicResult(item: SerpItem): SerpOrganicResult | null {
  if (!validOrganic(item)) return null
  const url = safeUrl(item.url)
  if (!url) return null
  return {
    rankGroup: item.rank_group,
    rankAbsolute: item.rank_absolute,
    page: item.page,
    domain: item.domain.trim().toLowerCase(),
    url,
    title: item.title ?? null,
    description: item.description ?? null,
    isFeaturedSnippet: item.is_featured_snippet ?? null,
  }
}

function optionalText(value: unknown, maximum: number): string | null {
  return typeof value === 'string' && value.trim() && value.length <= maximum
    ? value.trim()
    : null
}

function validLocalPack(item: SerpItem): item is SerpItem & {
  rank_group: number
  rank_absolute: number
  title: string
} {
  return (
    item.type === 'local_pack' &&
    Number.isSafeInteger(item.rank_group) &&
    (item.rank_group ?? 0) > 0 &&
    Number.isSafeInteger(item.rank_absolute) &&
    (item.rank_absolute ?? 0) > 0 &&
    Boolean(item.title?.trim()) &&
    (item.title?.trim().length ?? 0) <= 500
  )
}

function localPackResult(item: SerpItem): SerpLocalPackResult | null {
  if (!validLocalPack(item)) return null
  const rating = localPackRatingSchema.safeParse(item.rating)
  return {
    rankGroup: item.rank_group,
    rankAbsolute: item.rank_absolute,
    page:
      Number.isSafeInteger(item.page) && (item.page ?? 0) > 0
        ? (item.page ?? null)
        : null,
    title: item.title.trim(),
    domain: optionalText(item.domain, 253)?.toLowerCase() ?? null,
    url: safeUrl(item.url),
    cid: optionalText(item.cid, 100),
    phone: optionalText(item.phone, 100),
    description: optionalText(item.description, 2_000),
    isPaid: typeof item.is_paid === 'boolean' ? item.is_paid : null,
    rating: rating.success
      ? {
          type: rating.data.rating_type ?? null,
          value: rating.data.value ?? null,
          votesCount: rating.data.votes_count ?? null,
          maximum: rating.data.rating_max ?? null,
        }
      : null,
  }
}

function checkedAt(value: string, fallback: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : fallback
}

export function mapDataForSeoSerpSnapshot(
  input: SerpSnapshotRequest,
  snapshot: DataForSeoSerpSnapshot,
  endpoint = SERP_ENDPOINT,
): ProviderEvidence<SerpSnapshot> {
  const market = searchMarketSchema.parse(input.market)
  const keyword = normalizedKeyword(input.keyword)
  const location = locationRequest(market, 'serp-snapshot')
  const result = snapshot.response.tasks
    .flatMap((task) => task.result ?? [])
    .find((item) => normalizedKeyword(item.keyword) === keyword)
  if (!result) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-snapshot',
      code: 'invalid-response',
      message: 'DataForSEO returned no matching SERP result.',
    })
  }

  const warnings: ProviderWarning[] = [...snapshot.warnings]
  const items = result.items ?? []
  const organicItems = items.filter((item) => item.type === 'organic')
  const mappedOrganicResults = organicItems
    .flatMap((item) => {
      const mapped = organicResult(item)
      return mapped ? [mapped] : []
    })
    .sort(
      (left, right) =>
        left.rankAbsolute - right.rankAbsolute ||
        left.rankGroup - right.rankGroup ||
        compareCodepoints(left.url, right.url),
    )
  const organicResults = mappedOrganicResults.slice(0, input.depth)
  const localPackItems = items.filter((item) => item.type === 'local_pack')
  const localPackResults = localPackItems
    .flatMap((item) => {
      const mapped = localPackResult(item)
      return mapped ? [mapped] : []
    })
    .sort(
      (left, right) =>
        left.rankAbsolute - right.rankAbsolute ||
        left.rankGroup - right.rankGroup ||
        compareCodepoints(left.title, right.title) ||
        compareCodepoints(left.cid ?? '', right.cid ?? ''),
    )
  const invalidOrganicRows = organicItems.length - mappedOrganicResults.length
  const invalidLocalPackRows = localPackItems.length - localPackResults.length
  const invalidRows = invalidOrganicRows + invalidLocalPackRows
  const resultCapped = mappedOrganicResults.length > input.depth
  const invalidResultCount =
    result.se_results_count !== null &&
    result.se_results_count !== undefined &&
    result.se_results_count < organicResults.length
  if (invalidOrganicRows > 0) {
    warnings.push({
      code: 'invalid-organic-results',
      field: 'organicResults',
      message: `DataForSEO returned ${invalidOrganicRows} organic result${invalidOrganicRows === 1 ? '' : 's'} without a valid rank, domain, or URL.`,
    })
  }
  if (invalidLocalPackRows > 0) {
    warnings.push({
      code: 'invalid-local-pack-results',
      field: 'localPack.results',
      message: `DataForSEO returned ${invalidLocalPackRows} local-pack result${invalidLocalPackRows === 1 ? '' : 's'} without a valid rank or title.`,
    })
  }
  if (!Number.isFinite(Date.parse(result.datetime))) {
    warnings.push({
      code: 'invalid-serp-observation-time',
      field: 'checkedAt',
      message:
        'DataForSEO returned an invalid SERP observation time; the local response time was retained.',
    })
  }
  const checkUrl = safeUrl(result.check_url)
  if (result.check_url && !checkUrl) {
    warnings.push({
      code: 'invalid-serp-check-url',
      field: 'checkUrl',
      message: 'DataForSEO returned an invalid SERP check URL.',
    })
  }
  if (invalidResultCount) {
    warnings.push({
      code: 'invalid-serp-result-count',
      field: 'resultCount',
      message:
        'DataForSEO returned an estimated result count below the retained organic result count; the estimate was discarded.',
    })
  }
  const features = [
    ...new Set([
      ...(result.item_types ?? []),
      ...items.map((item) => item.type),
    ]),
  ].sort(compareCodepoints)
  const data: SerpSnapshot = {
    keyword,
    effectiveKeyword: normalizedKeyword(
      result.spell?.keyword ?? result.keyword,
    ),
    searchEngineDomain: result.se_domain?.trim().toLowerCase() ?? null,
    checkedAt: checkedAt(result.datetime, snapshot.observedAt),
    checkUrl,
    resultCount: invalidResultCount ? null : (result.se_results_count ?? null),
    pagesCount: result.pages_count === undefined ? null : result.pages_count,
    features,
    organicResults,
    localPack: {
      present: features.includes('local_pack'),
      returnedRows: localPackItems.length,
      retainedRows: localPackResults.length,
      invalidRows: invalidLocalPackRows,
      results: localPackResults,
    },
  }

  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'serp-snapshot',
    data,
    observedAt: snapshot.observedAt,
    market: { ...market, device: market.device ?? 'desktop' },
    coverage: {
      requestedRows: input.depth,
      returnedRows: snapshot.returnedRows,
      retainedRows: organicResults.length,
      invalidRows,
      providerTotalRows: invalidResultCount
        ? null
        : (result.se_results_count ?? null),
      completeness:
        invalidRows > 0 || invalidResultCount
          ? 'partial'
          : resultCapped
            ? 'capped'
            : 'complete',
      nextCursor: null,
    },
    cache: snapshot.cache,
    cost: snapshot.cost,
    request: {
      operation: 'serp-snapshot',
      endpoint,
      limit: input.depth,
      filters: {
        countryCode: market.countryCode,
        languageCode: market.languageCode,
        device: market.device ?? 'desktop',
        ...(location.locationCode !== undefined
          ? { locationCode: location.locationCode }
          : { locationName: location.locationName }),
      },
      sort: ['rankAbsolute:ascending', 'url:codepoint-ascending'],
    },
    warnings,
  }
}

export class DataForSeoSerpSnapshotProvider implements SerpSnapshotProvider {
  readonly provider = 'dataforseo' as const
  readonly capabilitySupport = [
    {
      capability: 'serp-snapshot' as const,
      status: 'available' as const,
      markets: [
        {
          searchEngines: ['google'] as const,
          devices: ['desktop', 'mobile'] as const,
          location: 'any' as const,
        },
      ],
    },
  ] as const

  private readonly client: SerpClient

  constructor(options: DataForSeoSerpSnapshotProviderOptions = {}) {
    this.client = options.client ?? new DataForSeoClient(options)
  }

  async serpSnapshot(
    input: SerpSnapshotRequest,
  ): Promise<ProviderEvidence<SerpSnapshot>> {
    const market = searchMarketSchema.parse(input.market)
    if (market.searchEngine !== 'google') {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'serp-snapshot',
        code: 'configuration',
        message: 'DataForSEO SERP snapshots currently support Google.',
      })
    }
    if (
      !Number.isSafeInteger(input.depth) ||
      input.depth < 1 ||
      input.depth > MAX_SERP_DEPTH
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'serp-snapshot',
        code: 'configuration',
        message: 'SERP depth must be from 1 to 100.',
      })
    }
    const keyword = normalizedKeyword(input.keyword)
    if (!keyword || keyword.length > 80 || keyword.split(/\s+/u).length > 10) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'serp-snapshot',
        code: 'configuration',
        message:
          'SERP snapshots require a keyword of at most 80 characters and 10 words.',
      })
    }
    const context = input.context ?? {
      reportId: 'serp-results',
      reportRunId: randomUUID(),
    }
    const location = locationRequest(market, 'serp-snapshot')
    const snapshot = await this.client.serpLive({
      keyword,
      languageCode: market.languageCode.split('-')[0] as string,
      ...location,
      device: market.device ?? 'desktop',
      depth: input.depth,
      refresh: input.refresh,
      context,
    })
    return mapDataForSeoSerpSnapshot(input, snapshot)
  }
}
