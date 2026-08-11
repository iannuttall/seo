import { randomUUID } from 'node:crypto'
import type {
  ProviderEvidence,
  ProviderWarning,
  SerpOrganicResult,
  SerpSnapshot,
  SerpSnapshotProvider,
  SerpSnapshotRequest,
} from '../contracts.js'
import { searchMarketSchema } from '../contracts.js'
import { ProviderError } from '../errors.js'
import {
  SerpBaseClient,
  type SerpBaseClientOptions,
  type SerpBaseSearchSnapshot,
} from './client.js'
import type { SerpBaseSearchSuccess } from './schema.js'

const MAX_SERPBASE_DEPTH = 10
const SEARCH_ENDPOINT = 'google/search'

type SerpClient = Pick<SerpBaseClient, 'search'>

export type SerpBaseSerpSnapshotProviderOptions = SerpBaseClientOptions & {
  client?: SerpClient
}

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizedKeyword(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}

function safeUrl(value: string | undefined): string | null {
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

function featureNames(response: SerpBaseSearchSuccess): string[] {
  const present = (value: unknown): boolean => {
    if (value === undefined || value === null) return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'string') return value.trim().length > 0
    if (typeof value === 'object') return Object.keys(value).length > 0
    return true
  }
  const names = [
    'featured_snippet',
    'top_stories',
    'people_also_ask',
    'knowledge_graph',
    'related_searches',
    'ai_overview',
    'weather',
    'finance',
    'flight',
    'result_stats',
  ].filter((key) => present(response[key]))
  if ((response.organic?.length ?? 0) > 0) names.push('organic')
  return names.sort(compareCodepoints)
}

function organicResult(
  item: NonNullable<SerpBaseSearchSuccess['organic']>[number],
): SerpOrganicResult | null {
  const url = safeUrl(
    typeof item.url === 'string'
      ? item.url
      : typeof item.link === 'string'
        ? item.link
        : undefined,
  )
  if (
    !url ||
    typeof item.rank !== 'number' ||
    !Number.isSafeInteger(item.rank) ||
    item.rank < 1
  ) {
    return null
  }
  return {
    rankGroup: item.rank,
    rankAbsolute: item.rank,
    page: 1,
    domain: new URL(url).hostname.toLowerCase(),
    url,
    title:
      typeof item.title === 'string' && item.title.length <= 10_000
        ? item.title.trim() || null
        : null,
    description:
      typeof item.snippet === 'string' && item.snippet.length <= 50_000
        ? item.snippet.trim() || null
        : null,
    isFeaturedSnippet: null,
  }
}

export function mapSerpBaseSerpSnapshot(
  input: SerpSnapshotRequest,
  snapshot: SerpBaseSearchSnapshot,
): ProviderEvidence<SerpSnapshot> {
  const market = searchMarketSchema.parse(input.market)
  const warnings: ProviderWarning[] = [...snapshot.warnings]
  const rawOrganic = snapshot.response.organic ?? []
  const mappedOrganic = rawOrganic
    .flatMap((item) => {
      const mapped = organicResult(item)
      return mapped ? [mapped] : []
    })
    .sort(
      (left, right) =>
        left.rankAbsolute - right.rankAbsolute ||
        compareCodepoints(left.url, right.url),
    )
  const organicResults = mappedOrganic.slice(0, input.depth)
  const invalidRows = rawOrganic.length - mappedOrganic.length
  const capped = mappedOrganic.length > input.depth
  if (invalidRows > 0) {
    warnings.push({
      code: 'invalid-organic-results',
      field: 'organicResults',
      message: `SerpBase returned ${invalidRows} organic result${invalidRows === 1 ? '' : 's'} without a valid rank or URL.`,
    })
  }
  if (snapshot.response.credits_charged > 0) {
    warnings.push({
      code: 'estimated-monetary-cost',
      field: 'cost.actualMicros',
      message:
        'SerpBase reported charged credits but not the account-specific monetary value. The local ledger retained the conservative request estimate.',
    })
  }
  const keyword = normalizedKeyword(input.keyword)
  const effectiveKeyword = normalizedKeyword(snapshot.response.query) || keyword

  return {
    schemaVersion: 1,
    provider: 'serpbase',
    capability: 'serp-snapshot',
    data: {
      keyword,
      effectiveKeyword,
      searchEngineDomain: null,
      checkedAt: snapshot.observedAt,
      checkUrl: null,
      resultCount: null,
      pagesCount: null,
      features: featureNames(snapshot.response),
      organicResults,
      localPack: {
        present: false,
        returnedRows: 0,
        retainedRows: 0,
        invalidRows: 0,
        results: [],
      },
    },
    observedAt: snapshot.observedAt,
    market: { ...market, device: market.device ?? 'desktop' },
    coverage: {
      requestedRows: input.depth,
      returnedRows: snapshot.returnedRows,
      retainedRows: organicResults.length,
      invalidRows,
      providerTotalRows: null,
      completeness:
        invalidRows > 0 ? 'partial' : capped ? 'capped' : 'complete',
      nextCursor: null,
    },
    cache: snapshot.cache,
    cost: snapshot.cost,
    request: {
      operation: 'serp-snapshot',
      endpoint: SEARCH_ENDPOINT,
      limit: input.depth,
      filters: {
        countryCode: market.countryCode,
        languageCode: market.languageCode,
        device: market.device ?? 'desktop',
      },
      sort: ['rankAbsolute:ascending', 'url:codepoint-ascending'],
    },
    warnings,
  }
}

export class SerpBaseSerpSnapshotProvider implements SerpSnapshotProvider {
  readonly provider = 'serpbase' as const
  readonly capabilitySupport = [
    {
      capability: 'serp-snapshot' as const,
      status: 'available' as const,
      markets: [
        {
          searchEngines: ['google'] as const,
          devices: ['desktop', 'mobile'] as const,
          location: 'country-only' as const,
        },
      ],
    },
  ] as const

  private readonly client: SerpClient

  constructor(options: SerpBaseSerpSnapshotProviderOptions = {}) {
    this.client = options.client ?? new SerpBaseClient(options)
  }

  async serpSnapshot(
    input: SerpSnapshotRequest,
  ): Promise<ProviderEvidence<SerpSnapshot>> {
    const market = searchMarketSchema.parse(input.market)
    if (market.searchEngine !== 'google') {
      throw new ProviderError({
        provider: 'serpbase',
        operation: 'serp-snapshot',
        code: 'configuration',
        message: 'SerpBase SERP snapshots currently support Google.',
      })
    }
    if (market.location) {
      throw new ProviderError({
        provider: 'serpbase',
        operation: 'serp-snapshot',
        code: 'configuration',
        message:
          'SerpBase Search supports country-level markets. Omit the canonical location.',
      })
    }
    if (
      !Number.isSafeInteger(input.depth) ||
      input.depth < 1 ||
      input.depth > MAX_SERPBASE_DEPTH
    ) {
      throw new ProviderError({
        provider: 'serpbase',
        operation: 'serp-snapshot',
        code: 'configuration',
        message: 'SerpBase SERP depth must be from 1 to 10.',
      })
    }
    const keyword = normalizedKeyword(input.keyword)
    if (!keyword || keyword.length > 80 || keyword.split(/\s+/u).length > 10) {
      throw new ProviderError({
        provider: 'serpbase',
        operation: 'serp-snapshot',
        code: 'configuration',
        message:
          'SERP snapshots require a keyword of at most 80 characters and 10 words.',
      })
    }
    const snapshot = await this.client.search({
      keyword,
      countryCode: market.countryCode,
      languageCode: market.languageCode,
      device: market.device ?? 'desktop',
      requestedRows: input.depth,
      refresh: input.refresh,
      context: input.context ?? {
        reportId: 'serp-results',
        reportRunId: randomUUID(),
      },
    })
    return mapSerpBaseSerpSnapshot(input, snapshot)
  }
}
