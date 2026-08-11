import { randomUUID } from 'node:crypto'
import type {
  ProviderCacheEvidence,
  ProviderCostEvidence,
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

const MAX_SERPBASE_DEPTH = 100
const SERPBASE_RESULTS_PER_PAGE = 10
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
  page: number,
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
  const rankAbsolute = (page - 1) * SERPBASE_RESULTS_PER_PAGE + item.rank
  return {
    rankGroup: item.rank,
    rankAbsolute,
    page,
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

function aggregateCache(
  snapshots: SerpBaseSearchSnapshot[],
): ProviderCacheEvidence {
  if (snapshots.every((snapshot) => snapshot.cache.status === 'hit')) {
    return {
      status: 'hit',
      storedAt:
        snapshots
          .flatMap((snapshot) =>
            snapshot.cache.storedAt ? [snapshot.cache.storedAt] : [],
          )
          .sort(compareCodepoints)[0] ?? null,
      expiresAt:
        snapshots
          .flatMap((snapshot) =>
            snapshot.cache.expiresAt ? [snapshot.cache.expiresAt] : [],
          )
          .sort(compareCodepoints)[0] ?? null,
    }
  }
  return {
    status: snapshots.every((snapshot) => snapshot.cache.status === 'bypass')
      ? 'bypass'
      : 'miss',
    storedAt: null,
    expiresAt: null,
  }
}

function sumKnown(values: Array<number | null>): number | null {
  return values.every((value): value is number => value !== null)
    ? values.reduce((total, value) => total + value, 0)
    : null
}

function aggregateCost(
  snapshots: SerpBaseSearchSnapshot[],
): ProviderCostEvidence {
  return {
    currency: 'USD',
    estimatedMicros: sumKnown(
      snapshots.map((snapshot) => snapshot.cost.estimatedMicros),
    ),
    actualMicros: sumKnown(
      snapshots.map((snapshot) => snapshot.cost.actualMicros),
    ),
    taskIds: [
      ...new Set(snapshots.flatMap((snapshot) => snapshot.cost.taskIds)),
    ].sort(compareCodepoints),
    native: {
      unit: 'credit',
      estimatedUnits: sumKnown(
        snapshots.map(
          (snapshot) => snapshot.cost.native?.estimatedUnits ?? null,
        ),
      ),
      actualUnits: sumKnown(
        snapshots.map((snapshot) => snapshot.cost.native?.actualUnits ?? null),
      ),
      remainingBefore: null,
    },
  }
}

type SerpBasePageCollection = {
  snapshots: SerpBaseSearchSnapshot[]
  failedPage: number | null
  requestedPages: number
}

function mapSerpBaseSerpSnapshots(
  input: SerpSnapshotRequest,
  collection: SerpBasePageCollection,
): ProviderEvidence<SerpSnapshot> {
  const { snapshots, failedPage, requestedPages } = collection
  const firstSnapshot = snapshots[0]
  if (!firstSnapshot) {
    throw new ProviderError({
      provider: 'serpbase',
      operation: 'serp-snapshot',
      code: 'invalid-response',
      message: 'SerpBase returned no result pages.',
    })
  }
  const market = searchMarketSchema.parse(input.market)
  const warnings: ProviderWarning[] = snapshots.flatMap(
    (snapshot) => snapshot.warnings,
  )
  const rawOrganic = snapshots.flatMap((snapshot) =>
    (snapshot.response.organic ?? []).map((item) => ({
      item,
      page: snapshot.response.page,
    })),
  )
  const mappedOrganic = rawOrganic
    .flatMap(({ item, page }) => {
      const mapped = organicResult(item, page)
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
  if (snapshots.some((snapshot) => snapshot.response.credits_charged > 0)) {
    warnings.push({
      code: 'estimated-monetary-cost',
      field: 'cost.actualMicros',
      message:
        'SerpBase reported charged credits but not the account-specific monetary value. The local ledger retained the conservative request estimate.',
    })
  }
  if (requestedPages > 1) {
    warnings.push({
      code: 'page-offset-rank',
      field: 'organicResults.rankAbsolute',
      message:
        'Positions after page one are derived from the requested page and SerpBase page-relative rank, using 10 organic positions per page.',
    })
  }
  if (failedPage !== null) {
    warnings.push({
      code: 'page-fetch-failed',
      field: 'organicResults',
      message: `SerpBase page ${failedPage} could not be collected. Results from earlier pages were retained.`,
    })
  }
  const keyword = normalizedKeyword(input.keyword)
  const effectiveKeyword =
    normalizedKeyword(firstSnapshot.response.query) || keyword
  const observedAt =
    snapshots
      .map((snapshot) => snapshot.observedAt)
      .sort(compareCodepoints)
      .at(-1) ?? firstSnapshot.observedAt

  return {
    schemaVersion: 1,
    provider: 'serpbase',
    capability: 'serp-snapshot',
    data: {
      keyword,
      effectiveKeyword,
      searchEngineDomain: null,
      checkedAt: observedAt,
      checkUrl: null,
      resultCount: null,
      pagesCount: snapshots.length,
      features: [
        ...new Set(
          snapshots.flatMap((snapshot) => featureNames(snapshot.response)),
        ),
      ].sort(compareCodepoints),
      organicResults,
      localPack: {
        present: false,
        returnedRows: 0,
        retainedRows: 0,
        invalidRows: 0,
        results: [],
      },
    },
    observedAt,
    market: { ...market, device: market.device ?? 'desktop' },
    coverage: {
      requestedRows: input.depth,
      returnedRows: snapshots.reduce(
        (total, snapshot) => total + snapshot.returnedRows,
        0,
      ),
      retainedRows: organicResults.length,
      invalidRows,
      providerTotalRows: null,
      completeness:
        failedPage !== null || invalidRows > 0
          ? 'partial'
          : capped
            ? 'capped'
            : 'complete',
      nextCursor: failedPage === null ? null : String(failedPage),
    },
    cache: aggregateCache(snapshots),
    cost: aggregateCost(snapshots),
    request: {
      operation: 'serp-snapshot',
      endpoint: SEARCH_ENDPOINT,
      limit: input.depth,
      filters: {
        countryCode: market.countryCode,
        languageCode: market.languageCode,
        device: market.device ?? 'desktop',
        pagesRequested: requestedPages,
        pagesCollected: snapshots.length,
      },
      sort: ['rankAbsolute:ascending', 'url:codepoint-ascending'],
    },
    warnings,
  }
}

export function mapSerpBaseSerpSnapshot(
  input: SerpSnapshotRequest,
  snapshot: SerpBaseSearchSnapshot,
): ProviderEvidence<SerpSnapshot> {
  return mapSerpBaseSerpSnapshots(input, {
    snapshots: [snapshot],
    failedPage: null,
    requestedPages: 1,
  })
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
        message: 'SerpBase SERP depth must be from 1 to 100.',
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
    const requestedPages = Math.ceil(input.depth / SERPBASE_RESULTS_PER_PAGE)
    const snapshots: SerpBaseSearchSnapshot[] = []
    let failedPage: number | null = null
    const context = input.context ?? {
      reportId: 'serp-results',
      reportRunId: randomUUID(),
    }
    for (let page = 1; page <= requestedPages; page += 1) {
      try {
        snapshots.push(
          await this.client.search({
            keyword,
            countryCode: market.countryCode,
            languageCode: market.languageCode,
            device: market.device ?? 'desktop',
            page,
            requestedRows: Math.min(
              SERPBASE_RESULTS_PER_PAGE,
              input.depth - (page - 1) * SERPBASE_RESULTS_PER_PAGE,
            ),
            refresh: input.refresh,
            context,
          }),
        )
      } catch (error) {
        if (page === 1) throw error
        failedPage = page
        break
      }
    }
    return mapSerpBaseSerpSnapshots(input, {
      snapshots,
      failedPage,
      requestedPages,
    })
  }
}
