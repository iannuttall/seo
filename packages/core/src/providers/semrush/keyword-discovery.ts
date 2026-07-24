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
  SemrushClient,
  type SemrushClientOptions,
  type SemrushReportSnapshot,
} from './client.js'
import {
  compareCodepoints,
  normalizedKeyword,
  type SemrushRecord,
  semrushMetric,
  semrushRecords,
} from './mapping.js'
import {
  SEMRUSH_V3_MARKETS,
  semrushKeywordDeprecationWarning,
  semrushMarket,
  semrushMarketWarnings,
} from './market.js'

const MAX_SEEDS = 5
const MAX_ROWS = 100
const COLUMNS = ['Ph', 'Nq', 'Cp', 'Co', 'Nr', 'Kd'] as const
const REPORTS = {
  ideas: { reportType: 'phrase_fullsearch', unitsPerLine: 20 },
  related: { reportType: 'phrase_related', unitsPerLine: 40 },
  suggestions: { reportType: 'phrase_questions', unitsPerLine: 40 },
} as const satisfies Record<
  KeywordDiscoverySource,
  { reportType: string; unitsPerLine: number }
>

type KeywordDiscoveryClient = Pick<SemrushClient, 'report'>

export type SemrushKeywordDiscoveryProviderOptions = SemrushClientOptions & {
  client?: KeywordDiscoveryClient
}

type DiscoveryCall = {
  seed: string
  source: KeywordDiscoverySource
  limit: number
}

type DiscoveryRow = {
  row: SemrushRecord
  seed: string
  source: KeywordDiscoverySource
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
      provider: 'semrush',
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
  snapshots: SemrushReportSnapshot[],
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
  return { status: 'miss', storedAt: null, expiresAt: null }
}

function sumNullable(values: Array<number | null>): number | null {
  return values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + (value ?? 0), 0)
    : null
}

function combinedCost(
  snapshots: SemrushReportSnapshot[],
): ProviderCostEvidence {
  const natives = snapshots.map((snapshot) => snapshot.cost.native)
  const remaining = natives
    .map((native) => native?.remainingBefore ?? null)
    .filter((value): value is number => value !== null)
  return {
    currency: 'USD',
    estimatedMicros: sumNullable(
      snapshots.map((snapshot) => snapshot.cost.estimatedMicros),
    ),
    actualMicros: sumNullable(
      snapshots.map((snapshot) => snapshot.cost.actualMicros),
    ),
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

function observedVolume(idea: KeywordIdea): number {
  return idea.monthlySearchVolume.state === 'observed'
    ? idea.monthlySearchVolume.value
    : -1
}

export class SemrushKeywordDiscoveryProvider
  implements KeywordDiscoveryProvider
{
  readonly provider = 'semrush' as const
  readonly capabilitySupport = [
    {
      capability: 'keyword-discovery' as const,
      status: 'available' as const,
      markets: SEMRUSH_V3_MARKETS,
    },
  ] as const

  private readonly client: KeywordDiscoveryClient

  constructor(options: SemrushKeywordDiscoveryProviderOptions = {}) {
    this.client = options.client ?? new SemrushClient(options)
  }

  async discoverKeywords(
    input: KeywordDiscoveryRequest,
  ): Promise<ProviderEvidence<KeywordIdea[]>> {
    const { market, database } = semrushMarket(
      input.market,
      'keyword-discovery',
    )
    const seeds = [...new Set(input.seeds.map(normalizedKeyword))]
      .filter(Boolean)
      .sort(compareCodepoints)
    if (
      seeds.length < 1 ||
      seeds.length > MAX_SEEDS ||
      seeds.some(
        (seed) =>
          seed.length > 80 ||
          seed.split(/\s+/u).length > 10 ||
          seed.includes(';'),
      )
    ) {
      throw new ProviderError({
        provider: 'semrush',
        operation: 'keyword-discovery',
        code: 'configuration',
        message:
          'Semrush keyword discovery requires 1 to 5 seeds of at most 80 characters and 10 words.',
      })
    }
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MAX_ROWS
    ) {
      throw new ProviderError({
        provider: 'semrush',
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
        provider: 'semrush',
        operation: 'keyword-discovery',
        code: 'configuration',
        message: 'Choose 1 to 3 keyword discovery sources.',
      })
    }

    const calls = plannedCalls(seeds, sources, input.limit)
    const snapshots: SemrushReportSnapshot[] = []
    const rows: DiscoveryRow[] = []
    const warnings: ProviderWarning[] = [
      ...semrushMarketWarnings(market),
      semrushKeywordDeprecationWarning(),
      ...(sources.includes('suggestions')
        ? [
            {
              code: 'provider-source-is-questions',
              field: 'sources',
              message:
                'Semrush suggestions use its question-keyword report rather than a generic autocomplete source.',
            },
          ]
        : []),
    ]
    let lastError: ProviderError | undefined
    for (const call of calls) {
      const report = REPORTS[call.source]
      try {
        const snapshot = await this.client.report({
          operation: `keyword-discovery-${call.source}`,
          reportType: report.reportType,
          parameters: {
            phrase: call.seed,
            database,
            display_limit: call.limit,
          },
          columns: COLUMNS,
          maximumResponseRows: call.limit,
          unitsPerLine: report.unitsPerLine,
          refresh: input.refresh,
        })
        snapshots.push(snapshot)
        warnings.push(...snapshot.warnings)
        rows.push(
          ...semrushRecords(snapshot.table, COLUMNS).map((row) => ({
            row,
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
          message: `Semrush ${call.source} discovery failed for one seed (${error.code}).`,
        })
      }
    }
    if (!snapshots.length && lastError) throw lastError

    const grouped = new Map<string, DiscoveryRow[]>()
    let invalidRows = 0
    for (const row of rows) {
      const keyword = normalizedKeyword(row.row.Ph ?? '')
      if (!keyword) {
        invalidRows += 1
        continue
      }
      grouped.set(keyword, [...(grouped.get(keyword) ?? []), row])
    }
    const ideas = [...grouped.entries()]
      .map(([keyword, matches]) => ({
        ...semrushMetric(
          keyword,
          matches.map((match) => match.row),
        ),
        sources: [
          ...new Map(
            matches.map((match) => [
              `${match.source}\0${match.seed}`,
              { seed: match.seed, source: match.source },
            ]),
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
    const returnedRows = snapshots.reduce(
      (sum, snapshot) => sum + snapshot.returnedRows,
      0,
    )
    if (invalidRows) {
      warnings.push({
        code: 'invalid-keyword-rows',
        field: 'data',
        message: `Semrush returned ${invalidRows} keyword row${invalidRows === 1 ? '' : 's'} without a keyword.`,
      })
    }
    const observedAt = snapshots
      .map((snapshot) => snapshot.observedAt)
      .sort(compareCodepoints)
      .at(-1)
    return {
      schemaVersion: 1,
      provider: 'semrush',
      capability: 'keyword-discovery',
      data: ideas,
      observedAt: observedAt as string,
      market,
      coverage: {
        requestedRows: calls.reduce((sum, call) => sum + call.limit, 0),
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
        endpoint: 'https://api.semrush.com/',
        limit: input.limit,
        filters: {
          database,
          countryCode: market.countryCode,
          languageCode: market.languageCode,
          sources: sources.join(','),
          seeds: seeds.length,
          providerRequests: calls.length,
          apiVersion: 3,
        },
        sort: ['monthlySearchVolume:descending', 'keyword:codepoint-ascending'],
      },
      warnings,
    }
  }
}
