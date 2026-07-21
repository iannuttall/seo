import { randomUUID } from 'node:crypto'
import type {
  KeywordDiscoveryProvider,
  KeywordDiscoveryRequest,
  KeywordDiscoverySource,
  KeywordIdea,
  ProviderCacheEvidence,
  ProviderCostEvidence,
  ProviderEvidence,
  ProviderWarning,
} from '../contracts.js'
import {
  keywordDiscoverySourceSchema,
  searchMarketSchema,
} from '../contracts.js'
import { ProviderError } from '../errors.js'
import {
  DataForSeoClient,
  type DataForSeoClientOptions,
  type DataForSeoKeywordDiscoverySnapshot,
} from './client.js'
import type { DataForSeoDiscoveryItem } from './discovery-schema.js'
import {
  compareCodepoints,
  locationRequest,
  MAX_RETAINED_MONTHLY_SEARCH_ROWS,
  marketWarnings,
  metricForKeyword,
  normalizedKeyword,
} from './keyword-mapping.js'
import type { DataForSeoKeywordOverviewItem } from './schema.js'

const MAX_DISCOVERY_SEEDS = 5
const MAX_DISCOVERY_ROWS = 100
const ENDPOINT_FAMILY =
  'v3/dataforseo_labs/google/{keyword_ideas,related_keywords,keyword_suggestions}/live'

type KeywordDiscoveryClient = Pick<DataForSeoClient, 'keywordDiscovery'>

export type DataForSeoKeywordDiscoveryProviderOptions =
  DataForSeoClientOptions & {
    client?: KeywordDiscoveryClient
  }

type DiscoveryCall = {
  source: KeywordDiscoverySource
  seeds: string[]
  limit: number
}

type DiscoveryRow = {
  keyword: string
  row: DataForSeoKeywordOverviewItem
  sources: Array<{ seed: string; source: KeywordDiscoverySource }>
}

function discoveryItemRow(
  item: DataForSeoDiscoveryItem,
): DataForSeoKeywordOverviewItem {
  return 'keyword_data' in item
    ? (item.keyword_data as DataForSeoKeywordOverviewItem)
    : item
}

function responseRows(
  snapshot: DataForSeoKeywordDiscoverySnapshot,
  call: DiscoveryCall,
): DiscoveryRow[] {
  return snapshot.response.tasks.flatMap((task) =>
    (task.result ?? []).flatMap((result) => {
      return (result.items ?? []).map((item) => {
        const row = discoveryItemRow(item)
        return {
          keyword: normalizedKeyword(row.keyword),
          row,
          sources: call.seeds.map((seed) => ({
            seed,
            source: call.source,
          })),
        }
      })
    }),
  )
}

function plannedCalls(
  sources: KeywordDiscoverySource[],
  seeds: string[],
  limit: number,
): DiscoveryCall[] {
  const requests: Array<{
    source: KeywordDiscoverySource
    seeds: string[]
  }> = []
  for (const source of sources) {
    requests.push(...seeds.map((seed) => ({ source, seeds: [seed] })))
  }
  if (limit < requests.length) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'keyword-discovery',
      code: 'configuration',
      message: `Keyword discovery needs a limit of at least ${requests.length} to sample every requested source and seed.`,
    })
  }
  const base = Math.floor(limit / requests.length)
  const remainder = limit % requests.length
  return requests.map((request, index) => ({
    ...request,
    limit: base + Number(index < remainder),
  }))
}

function combinedCache(
  snapshots: DataForSeoKeywordDiscoverySnapshot[],
): ProviderCacheEvidence {
  if (snapshots.some((snapshot) => snapshot.cache.status === 'bypass')) {
    return { status: 'bypass', storedAt: null, expiresAt: null }
  }
  if (snapshots.every((snapshot) => snapshot.cache.status === 'hit')) {
    const stored = snapshots
      .map((snapshot) => snapshot.cache.storedAt)
      .filter((value): value is string => Boolean(value))
      .sort(compareCodepoints)
    const expires = snapshots
      .map((snapshot) => snapshot.cache.expiresAt)
      .filter((value): value is string => Boolean(value))
      .sort(compareCodepoints)
    return {
      status: 'hit',
      storedAt: stored[0] ?? null,
      expiresAt: expires[0] ?? null,
    }
  }
  return { status: 'miss', storedAt: null, expiresAt: null }
}

function combinedCost(
  snapshots: DataForSeoKeywordDiscoverySnapshot[],
): ProviderCostEvidence {
  const estimated = snapshots.map((snapshot) => snapshot.cost.estimatedMicros)
  const actual = snapshots.map((snapshot) => snapshot.cost.actualMicros)
  return {
    currency: 'USD',
    estimatedMicros: estimated.every((value) => value !== null)
      ? estimated.reduce((sum, value) => sum + (value ?? 0), 0)
      : null,
    actualMicros: actual.every((value) => value !== null)
      ? actual.reduce((sum, value) => sum + (value ?? 0), 0)
      : null,
    taskIds: [
      ...new Set(snapshots.flatMap((snapshot) => snapshot.cost.taskIds)),
    ]
      .sort(compareCodepoints)
      .slice(0, 20),
  }
}

function observedVolume(idea: KeywordIdea): number {
  return idea.monthlySearchVolume.state === 'observed'
    ? idea.monthlySearchVolume.value
    : -1
}

export class DataForSeoKeywordDiscoveryProvider
  implements KeywordDiscoveryProvider
{
  readonly provider = 'dataforseo' as const
  readonly capabilitySupport = [
    {
      capability: 'keyword-discovery' as const,
      status: 'available' as const,
      markets: [
        {
          searchEngines: ['google'] as const,
          location: 'country-only' as const,
        },
      ],
    },
  ] as const

  private readonly client: KeywordDiscoveryClient

  constructor(options: DataForSeoKeywordDiscoveryProviderOptions = {}) {
    this.client = options.client ?? new DataForSeoClient(options)
  }

  async discoverKeywords(
    input: KeywordDiscoveryRequest,
  ): Promise<ProviderEvidence<KeywordIdea[]>> {
    const market = searchMarketSchema.parse(input.market)
    if (market.searchEngine !== 'google') {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-discovery',
        code: 'configuration',
        message: 'DataForSEO keyword discovery currently supports Google.',
      })
    }
    if (market.location) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-discovery',
        code: 'configuration',
        message:
          'DataForSEO Labs keyword discovery supports country-level markets; omit market.location and use countryCode.',
      })
    }
    const seeds = [...new Set(input.seeds.map(normalizedKeyword))]
      .filter(Boolean)
      .sort(compareCodepoints)
    if (
      seeds.length < 1 ||
      seeds.length > MAX_DISCOVERY_SEEDS ||
      seeds.some((seed) => seed.length > 80 || seed.split(/\s+/u).length > 10)
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-discovery',
        code: 'configuration',
        message:
          'Keyword discovery requires 1 to 5 seeds of at most 80 characters and 10 words.',
      })
    }
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_DISCOVERY_ROWS
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-discovery',
        code: 'configuration',
        message: 'Keyword discovery limit must be from 1 to 100.',
      })
    }
    const sources = [
      ...new Set(
        input.sources.map((source) =>
          keywordDiscoverySourceSchema.parse(source),
        ),
      ),
    ].sort(compareCodepoints)
    if (sources.length < 1 || sources.length > 3) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-discovery',
        code: 'configuration',
        message: 'Choose 1 to 3 keyword discovery sources.',
      })
    }

    const calls = plannedCalls(sources, seeds, input.limit)
    const context = input.context ?? {
      reportId: 'keyword-research',
      reportRunId: randomUUID(),
    }
    const location = locationRequest(market, 'keyword-discovery')
    const snapshots: DataForSeoKeywordDiscoverySnapshot[] = []
    const rows: DiscoveryRow[] = []
    const warnings: ProviderWarning[] = [...marketWarnings(market)]
    let lastError: ProviderError | undefined
    for (const call of calls) {
      try {
        const snapshot = await this.client.keywordDiscovery({
          ...call,
          languageCode: market.languageCode.split('-')[0] as string,
          ...location,
          refresh: input.refresh,
          context,
        })
        snapshots.push(snapshot)
        rows.push(...responseRows(snapshot, call))
        warnings.push(...snapshot.warnings)
      } catch (error) {
        if (!(error instanceof ProviderError)) throw error
        lastError = error
        warnings.push({
          code: 'discovery-request-failed',
          field: call.source,
          message: `DataForSEO ${call.source} discovery failed for ${call.seeds.length} seed${call.seeds.length === 1 ? '' : 's'} (${error.code}).`,
        })
      }
    }
    if (snapshots.length === 0 && lastError) throw lastError

    const grouped = new Map<string, DiscoveryRow[]>()
    let invalidRows = 0
    for (const row of rows) {
      if (!row.keyword) {
        invalidRows += 1
        continue
      }
      grouped.set(row.keyword, [...(grouped.get(row.keyword) ?? []), row])
    }
    const ideas = [...grouped.entries()]
      .map(([keyword, matches]) => ({
        ...metricForKeyword(
          keyword,
          matches.map((match) => match.row),
        ),
        sources: [
          ...new Map(
            matches
              .flatMap((match) => match.sources)
              .map((source) => [`${source.source}\0${source.seed}`, source]),
          ).values(),
        ].sort(
          (left, right) =>
            compareCodepoints(left.source, right.source) ||
            compareCodepoints(left.seed, right.seed),
        ),
      }))
      .sort(
        (left, right) =>
          observedVolume(right) - observedVolume(left) ||
          compareCodepoints(left.keyword, right.keyword),
      )
      .slice(0, input.limit)
    const failedCalls = calls.length - snapshots.length
    const providerTotals = snapshots.map(
      (snapshot) => snapshot.providerTotalRows,
    )
    const cursors = snapshots
      .map((snapshot) => snapshot.nextCursor)
      .filter((value): value is string => Boolean(value))
    const providerCapped = snapshots.some(
      (snapshot) =>
        snapshot.nextCursor !== null ||
        (snapshot.providerTotalRows !== null &&
          snapshot.providerTotalRows > snapshot.returnedRows),
    )
    const latestObservedAt = snapshots
      .map((snapshot) => snapshot.observedAt)
      .sort(compareCodepoints)
      .at(-1)

    return {
      schemaVersion: 1,
      provider: 'dataforseo',
      capability: 'keyword-discovery',
      data: ideas,
      observedAt: latestObservedAt as string,
      market,
      coverage: {
        requestedRows: calls.reduce((sum, call) => sum + call.limit, 0),
        returnedRows: snapshots.reduce(
          (sum, snapshot) => sum + snapshot.returnedRows,
          0,
        ),
        retainedRows: ideas.length,
        invalidRows,
        providerTotalRows: providerTotals.every((value) => value !== null)
          ? providerTotals.reduce((sum, value) => sum + (value ?? 0), 0)
          : null,
        completeness:
          snapshots.length === 0
            ? 'unavailable'
            : failedCalls > 0 || invalidRows > 0
              ? 'partial'
              : ideas.length < grouped.size || providerCapped
                ? 'capped'
                : 'complete',
        nextCursor: snapshots.length === 1 ? (cursors[0] ?? null) : null,
      },
      cache: combinedCache(snapshots),
      cost: combinedCost(snapshots),
      request: {
        operation: 'keyword-discovery',
        endpoint: ENDPOINT_FAMILY,
        limit: input.limit,
        filters: {
          sources: sources.join(','),
          seeds: seeds.length,
          providerRequests: calls.length,
          retainedMonthlyHistoryRows: MAX_RETAINED_MONTHLY_SEARCH_ROWS,
          countryCode: market.countryCode,
          languageCode: market.languageCode,
          ...(location.locationCode !== undefined
            ? { locationCode: location.locationCode }
            : { locationName: location.locationName }),
        },
        sort: ['monthlySearchVolume:descending', 'keyword:codepoint-ascending'],
      },
      warnings,
    }
  }
}
