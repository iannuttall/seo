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
import { keywordDiscoverySourceSchema } from '../contracts.js'
import { ProviderError } from '../errors.js'
import {
  type AhrefsApiSnapshot,
  AhrefsClient,
  type AhrefsClientOptions,
} from './client.js'
import { emptyAhrefsKeywordIdea } from './mapping.js'
import { ahrefsKeywordIdeasResponseSchema } from './schema.js'
import {
  AHREFS_API_BASE_URL,
  AHREFS_MARKETS,
  compareCodepoints,
  marketCountry,
  marketWarnings,
  normalizedKeyword,
  requestContext,
} from './shared.js'

const MAX_SEEDS = 5
const MAX_ROWS = 100
const SELECT = 'keyword'
const REPORTS = {
  ideas: {
    path: 'keywords-explorer/matching-terms',
    query: { match_mode: 'terms', terms: 'all' },
  },
  related: {
    path: 'keywords-explorer/related-terms',
    query: { view_for: 'top_10', terms: 'all' },
  },
  suggestions: {
    path: 'keywords-explorer/search-suggestions',
    query: {},
  },
} as const satisfies Record<
  KeywordDiscoverySource,
  { path: string; query: Record<string, string> }
>

type KeywordDiscoveryClient = Pick<AhrefsClient, 'request'>
type KeywordIdeasResponse = {
  keywords: Array<{ keyword: string }>
}
type KeywordIdeasSnapshot = AhrefsApiSnapshot<KeywordIdeasResponse>

export type AhrefsKeywordDiscoveryProviderOptions = AhrefsClientOptions & {
  client?: KeywordDiscoveryClient
}

type DiscoveryCall = {
  seed: string
  source: KeywordDiscoverySource
  limit: number
}

function plannedCalls(
  seeds: string[],
  sources: KeywordDiscoverySource[],
  limit: number,
): DiscoveryCall[] {
  const requests = sources.flatMap((source) =>
    seeds.map((seed) => ({ source, seed })),
  )
  if (limit < requests.length) {
    throw new ProviderError({
      provider: 'ahrefs',
      operation: 'keyword-discovery',
      code: 'configuration',
      message: `Ahrefs keyword discovery needs a limit of at least ${requests.length} to sample every source and seed.`,
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
  snapshots: KeywordIdeasSnapshot[],
): ProviderCacheEvidence {
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
  return {
    status: snapshots.every((snapshot) => snapshot.cache.status === 'bypass')
      ? 'bypass'
      : 'miss',
    storedAt: null,
    expiresAt: null,
  }
}

function sumNullable(values: Array<number | null>): number | null {
  return values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + (value ?? 0), 0)
    : null
}

function combinedCost(snapshots: KeywordIdeasSnapshot[]): ProviderCostEvidence {
  const natives = snapshots.map((snapshot) => snapshot.cost.native)
  const remaining = natives
    .map((native) => native?.remainingBefore ?? null)
    .filter((value): value is number => value !== null)
  return {
    currency: 'USD',
    estimatedMicros: null,
    actualMicros: null,
    taskIds: [],
    native: {
      unit: 'api-unit',
      estimatedUnits: sumNullable(
        natives.map((native) => native?.estimatedUnits ?? null),
      ),
      actualUnits: sumNullable(
        natives.map((native) => native?.actualUnits ?? null),
      ),
      remainingBefore: remaining.length ? Math.max(...remaining) : null,
    },
  }
}

export class AhrefsKeywordDiscoveryProvider
  implements KeywordDiscoveryProvider
{
  readonly provider = 'ahrefs' as const
  readonly capabilitySupport = [
    {
      capability: 'keyword-discovery' as const,
      status: 'available' as const,
      markets: AHREFS_MARKETS,
    },
  ] as const

  private readonly client: KeywordDiscoveryClient

  constructor(options: AhrefsKeywordDiscoveryProviderOptions = {}) {
    this.client = options.client ?? new AhrefsClient(options)
  }

  async discoverKeywords(
    input: KeywordDiscoveryRequest,
  ): Promise<ProviderEvidence<KeywordIdea[]>> {
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_ROWS
    ) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation: 'keyword-discovery',
        code: 'configuration',
        message: 'Ahrefs keyword discovery limit must be from 1 to 100.',
      })
    }
    if (input.seeds.length < 1 || input.seeds.length > MAX_SEEDS) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation: 'keyword-discovery',
        code: 'configuration',
        message: 'Ahrefs keyword discovery requires 1 to 5 seeds.',
      })
    }
    const seeds = [
      ...new Set(
        input.seeds.map((seed) => normalizedKeyword(seed, 'keyword-discovery')),
      ),
    ].sort(compareCodepoints)
    const sources = [
      ...new Set(
        input.sources.map((source) =>
          keywordDiscoverySourceSchema.parse(source),
        ),
      ),
    ].sort(compareCodepoints)
    if (sources.length < 1 || sources.length > 3) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation: 'keyword-discovery',
        code: 'configuration',
        message: 'Choose 1 to 3 Ahrefs keyword discovery sources.',
      })
    }
    const country = marketCountry(input.market, 'keyword-discovery')
    const calls = plannedCalls(seeds, sources, input.limit)
    const context = requestContext('keyword-research', input.context)
    const snapshots: KeywordIdeasSnapshot[] = []
    const rows: Array<{
      keyword: string
      seed: string
      source: KeywordDiscoverySource
    }> = []
    const warnings: ProviderWarning[] = [...marketWarnings(input.market)]
    let lastError: ProviderError | undefined
    for (const call of calls) {
      const report = REPORTS[call.source]
      try {
        const snapshot = await this.client.request({
          operation: `keyword-discovery-${call.source}`,
          capability: 'keyword-discovery',
          path: report.path,
          query: {
            country,
            keywords: call.seed,
            select: SELECT,
            limit: call.limit,
            ...report.query,
          },
          schema: ahrefsKeywordIdeasResponseSchema,
          requestedRows: call.limit,
          perRowUnits: 1,
          rowCount: (response) => response.keywords.length,
          free: ['ahrefs', 'yep', 'firehose'].includes(call.seed),
          refresh: input.refresh,
          context,
        })
        snapshots.push(snapshot)
        warnings.push(...snapshot.warnings)
        rows.push(
          ...snapshot.response.keywords.map((row) => ({
            keyword: row.keyword,
            seed: call.seed,
            source: call.source,
          })),
        )
      } catch (error) {
        if (!(error instanceof ProviderError)) throw error
        lastError = error
        warnings.push({
          code: 'discovery-request-failed',
          field: call.source,
          message: `Ahrefs ${call.source} discovery failed for one seed (${error.code}).`,
        })
      }
    }
    if (!snapshots.length && lastError) throw lastError

    const grouped = new Map<
      string,
      Array<{ seed: string; source: KeywordDiscoverySource }>
    >()
    let invalidRows = 0
    for (const row of rows) {
      let keyword: string
      try {
        keyword = normalizedKeyword(row.keyword, 'keyword-discovery')
      } catch {
        invalidRows += 1
        continue
      }
      grouped.set(keyword, [
        ...(grouped.get(keyword) ?? []),
        { seed: row.seed, source: row.source },
      ])
    }
    const ideas = [...grouped.entries()]
      .sort(([left], [right]) => compareCodepoints(left, right))
      .slice(0, input.limit)
      .map(([keyword, matches]) =>
        emptyAhrefsKeywordIdea(
          keyword,
          [
            ...new Map(
              matches.map((match) => [`${match.source}\0${match.seed}`, match]),
            ).values(),
          ].sort(
            (left, right) =>
              compareCodepoints(left.source, right.source) ||
              compareCodepoints(left.seed, right.seed),
          ),
        ),
      )
    const returnedRows = snapshots.reduce(
      (sum, snapshot) => sum + snapshot.returnedRows,
      0,
    )
    const failedCalls = calls.length - snapshots.length
    if (invalidRows) {
      warnings.push({
        code: 'invalid-keyword-rows',
        field: 'data',
        message: `Ahrefs returned ${invalidRows} keyword row${invalidRows === 1 ? '' : 's'} without a valid keyword.`,
      })
    }
    const observedAt = snapshots
      .map((snapshot) => snapshot.observedAt)
      .sort(compareCodepoints)
      .at(-1) as string
    return {
      schemaVersion: 1,
      provider: 'ahrefs',
      capability: 'keyword-discovery',
      data: ideas,
      observedAt,
      market: input.market,
      coverage: {
        requestedRows: input.limit,
        returnedRows,
        retainedRows: ideas.length,
        invalidRows,
        providerTotalRows: null,
        completeness:
          failedCalls || invalidRows
            ? 'partial'
            : returnedRows >= input.limit || ideas.length < grouped.size
              ? 'capped'
              : 'complete',
        nextCursor: null,
      },
      cache: combinedCache(snapshots),
      cost: combinedCost(snapshots),
      request: {
        operation: 'keyword-discovery',
        endpoint: AHREFS_API_BASE_URL,
        limit: input.limit,
        filters: {
          country,
          selectedFields: SELECT,
          sources: sources.join(','),
          seeds: seeds.length,
          providerRequests: calls.length,
          apiVersion: 3,
        },
        sort: ['keyword:codepoint-ascending'],
      },
      warnings,
    }
  }
}
