import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  providerCredentialScope,
  readProviderCache,
  writeProviderCache,
} from '../providers/cache.js'
import type {
  ProviderCapabilitySupport,
  ProviderEvidence,
  ProviderRequestContext,
  SerpSnapshot,
  SerpSnapshotProvider,
  SerpSnapshotRequest,
} from '../providers/contracts.js'
import { searchMarketSchema } from '../providers/contracts.js'
import type { ProviderSpendLimits } from '../providers/cost-limits.js'
import { ProviderError, type ProviderErrorCode } from '../providers/errors.js'
import {
  finalizeProviderSpend,
  reserveProviderSpend,
} from '../storage/provider-spend.js'
import type Database from '../storage/sqlite.js'
import { readProviderExtensionAccount } from './connections.js'
import { readProviderExtensionCredentials } from './credentials.js'
import {
  loadProviderExtensions,
  normalizeProviderExtensionAccount,
  type ProviderRuntimeOptions,
  runtimeForProvider,
  safeProviderAdapterError,
} from './runtime.js'
import type {
  SeoProviderConnection,
  SeoSerpSnapshotCapability,
  SeoSerpSnapshotResult,
} from './sdk.js'

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000

async function serpCredentials(input: {
  providerId: string
  account: Readonly<Record<string, string>>
  fields: Parameters<typeof readProviderExtensionCredentials>[0]['fields']
}): Promise<Record<string, string>> {
  return readProviderExtensionCredentials(input)
}

const nullableText = z.string().max(50_000).nullable()
const organicResultSchema = z
  .object({
    rankGroup: z.number().int().positive().safe(),
    rankAbsolute: z.number().int().positive().safe(),
    page: z.number().int().positive().max(100).safe(),
    domain: z.string().trim().min(1).max(253),
    url: z.url().max(8_192),
    title: z.string().max(10_000).nullable(),
    description: nullableText,
    isFeaturedSnippet: z.boolean().nullable(),
  })
  .strict()

const localPackResultSchema = z
  .object({
    rankGroup: z.number().int().positive().safe(),
    rankAbsolute: z.number().int().positive().safe(),
    page: z.number().int().positive().max(100).safe().nullable(),
    title: z.string().trim().min(1).max(10_000),
    domain: z.string().max(253).nullable(),
    url: z.url().max(8_192).nullable(),
    cid: z.string().max(500).nullable(),
    phone: z.string().max(500).nullable(),
    description: nullableText,
    isPaid: z.boolean().nullable(),
    rating: z
      .object({
        type: z.string().max(100).nullable(),
        value: z.number().finite().nullable(),
        votesCount: z.number().int().nonnegative().safe().nullable(),
        maximum: z.number().finite().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()

const serpSnapshotResultSchema = z
  .object({
    observedAt: z.string().datetime(),
    effectiveKeyword: z.string().trim().min(1).max(1_000),
    searchEngineDomain: z.string().max(253).nullable(),
    checkUrl: z.url().max(8_192).nullable(),
    resultCount: z.number().int().nonnegative().safe().nullable(),
    pagesCount: z.number().int().nonnegative().max(100).safe().nullable(),
    features: z.array(z.string().trim().min(1).max(100)).max(100),
    organicResults: z.array(organicResultSchema).max(100),
    localPack: z
      .object({
        present: z.boolean(),
        returnedRows: z.number().int().nonnegative().max(100).safe(),
        retainedRows: z.number().int().nonnegative().max(100).safe(),
        invalidRows: z.number().int().nonnegative().max(100).safe(),
        results: z.array(localPackResultSchema).max(100),
      })
      .strict(),
    coverage: z
      .object({
        returnedRows: z.number().int().nonnegative().max(10_000).safe(),
        retainedRows: z.number().int().nonnegative().max(100).safe(),
        invalidRows: z.number().int().nonnegative().max(10_000).safe(),
        providerTotalRows: z.number().int().nonnegative().safe().nullable(),
        completeness: z.enum(['complete', 'partial', 'capped']),
        nextCursor: z.string().max(500).nullable(),
      })
      .strict(),
    request: z
      .object({
        endpoint: z.string().trim().min(1).max(500),
        filters: z.record(
          z.string().min(1).max(100),
          z.union([z.string().max(1_000), z.number().finite(), z.boolean()]),
        ),
        sort: z.array(z.string().min(1).max(200)).max(20),
      })
      .strict(),
    cost: z
      .object({
        estimatedMicros: z.number().int().nonnegative().safe().nullable(),
        actualMicros: z.number().int().nonnegative().safe().nullable(),
        taskIds: z.array(z.string().min(1).max(500)).max(20),
        native: z
          .object({
            unit: z.string().trim().min(1).max(100),
            estimatedUnits: z.number().finite().nonnegative().nullable(),
            actualUnits: z.number().finite().nonnegative().nullable(),
            remainingBefore: z.number().finite().nonnegative().nullable(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    qualityWarnings: z
      .array(
        z
          .object({
            code: z.string().trim().min(1).max(100),
            message: z.string().trim().min(1).max(500),
            field: z.string().max(200).optional(),
            row: z.number().int().positive().safe().optional(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()

function sortedRecord(value: Readonly<Record<string, string>>) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  )
}

function adapterErrorCode(error: unknown): ProviderErrorCode {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return 'remote-error'
  }
  const code = String(error.code)
  return [
    'configuration',
    'authentication',
    'budget-limit',
    'rate-limit',
    'timeout',
    'response-too-large',
    'invalid-response',
    'remote-error',
  ].includes(code)
    ? (code as ProviderErrorCode)
    : 'remote-error'
}

function cachedCost(result: SeoSerpSnapshotResult) {
  return {
    ...result.cost,
    estimatedMicros: 0,
    actualMicros: 0,
    ...(result.cost.native
      ? {
          native: {
            ...result.cost.native,
            estimatedUnits: 0,
            actualUnits: 0,
          },
        }
      : {}),
  }
}

function evidence(input: {
  providerId: string
  keyword: string
  market: z.infer<typeof searchMarketSchema>
  depth: number
  result: SeoSerpSnapshotResult
  cache: ProviderEvidence<SerpSnapshot>['cache']
  cached?: boolean
}): ProviderEvidence<SerpSnapshot> {
  const { result } = input
  return {
    schemaVersion: 1,
    provider: input.providerId,
    capability: 'serp-snapshot',
    data: {
      keyword: input.keyword,
      effectiveKeyword: result.effectiveKeyword,
      searchEngineDomain: result.searchEngineDomain,
      checkedAt: result.observedAt,
      checkUrl: result.checkUrl,
      resultCount: result.resultCount,
      pagesCount: result.pagesCount,
      features: [...result.features],
      organicResults: [...result.organicResults],
      localPack: {
        ...result.localPack,
        results: [...result.localPack.results],
      },
    },
    observedAt: result.observedAt,
    market: input.market,
    coverage: {
      requestedRows: input.depth,
      ...result.coverage,
    },
    cache: input.cache,
    cost: {
      currency: 'USD',
      ...(input.cached ? cachedCost(result) : result.cost),
      taskIds: [...result.cost.taskIds],
    },
    request: {
      operation: 'serp-snapshot',
      endpoint: result.request.endpoint,
      limit: input.depth,
      filters: { ...result.request.filters },
      sort: [...result.request.sort],
    },
    warnings: [...result.qualityWarnings],
  }
}

export type ProviderSerpRuntimeOptions = ProviderRuntimeOptions & {
  database?: Database.Database
  spendLimits?: ProviderSpendLimits
}

export class ProviderExtensionSerpSnapshotProvider
  implements SerpSnapshotProvider
{
  readonly provider: string
  readonly capabilitySupport: readonly ProviderCapabilitySupport[]
  readonly #account: Readonly<Record<string, string>>
  readonly #runtime: ProviderSerpRuntimeOptions | undefined

  constructor(input: {
    providerId: string
    capability: SeoSerpSnapshotCapability
    account?: Readonly<Record<string, string>>
    runtime?: ProviderSerpRuntimeOptions
  }) {
    this.provider = input.providerId
    this.#account =
      input.account ?? readProviderExtensionAccount(input.providerId)
    this.#runtime = input.runtime
    this.capabilitySupport = [
      {
        capability: 'serp-snapshot',
        status: 'available',
        markets: input.capability.markets,
      },
    ]
  }

  serpSnapshot(input: SerpSnapshotRequest) {
    return runProviderSerpSnapshot({
      providerId: this.provider,
      account: this.#account,
      keyword: input.keyword,
      market: input.market,
      depth: input.depth,
      refresh: input.refresh,
      context: input.context ?? {
        reportId: 'serp-results',
        reportRunId: randomUUID(),
      },
      runtime: this.#runtime,
    })
  }
}

export async function installedSerpSnapshotProviders(): Promise<
  Array<{
    adapter: ProviderExtensionSerpSnapshotProvider
    capability: SeoSerpSnapshotCapability
    displayName: string
    connected: boolean
  }>
> {
  const loaded = await loadProviderExtensions()
  const providers: Array<{
    adapter: ProviderExtensionSerpSnapshotProvider
    capability: SeoSerpSnapshotCapability
    displayName: string
    connected: boolean
  }> = []
  for (const provider of loaded.registry.providersFor('serp-snapshot')) {
    const capability = loaded.registry.capability(provider.id, 'serp-snapshot')
    if (!capability) continue
    const account = readProviderExtensionAccount(provider.id)
    let connected = false
    try {
      await serpCredentials({
        providerId: provider.id,
        account,
        fields: provider.connection.fields,
      })
      connected = true
    } catch {
      connected = false
    }
    providers.push({
      adapter: new ProviderExtensionSerpSnapshotProvider({
        providerId: provider.id,
        capability,
        account,
      }),
      capability,
      displayName: provider.displayName,
      connected,
    })
  }
  return providers
}

export async function runProviderSerpSnapshot(input: {
  providerId: string
  account?: Readonly<Record<string, string>>
  credentials?: Readonly<Record<string, string>>
  keyword: string
  market: z.input<typeof searchMarketSchema>
  depth: number
  refresh?: boolean
  context: ProviderRequestContext
  runtime?: ProviderSerpRuntimeOptions
}): Promise<ProviderEvidence<SerpSnapshot>> {
  const loaded = await loadProviderExtensions()
  const provider = loaded.registry.get(input.providerId)
  const capability = loaded.registry.capability(
    input.providerId,
    'serp-snapshot',
  ) as SeoSerpSnapshotCapability | undefined
  if (!provider || !capability) {
    throw new ProviderError({
      provider: input.providerId,
      operation: 'serp-snapshot',
      code: 'configuration',
      message: `Provider ${input.providerId} is not installed with SERP snapshot support.`,
    })
  }
  const market = searchMarketSchema.parse(input.market)
  const keyword = input.keyword.trim().replace(/\s+/gu, ' ')
  if (!keyword || keyword.length > 80 || keyword.split(/\s+/u).length > 10) {
    throw new ProviderError({
      provider: input.providerId,
      operation: 'serp-snapshot',
      code: 'configuration',
      message:
        'SERP snapshots require a keyword of at most 80 characters and 10 words.',
    })
  }
  if (
    !Number.isSafeInteger(input.depth) ||
    input.depth < 1 ||
    input.depth > 100
  ) {
    throw new ProviderError({
      provider: input.providerId,
      operation: 'serp-snapshot',
      code: 'configuration',
      message: 'SERP snapshot depth must be from 1 to 100.',
    })
  }
  const account = normalizeProviderExtensionAccount(
    provider,
    input.account ?? {},
  )
  let credentials = { ...(input.credentials ?? {}) }
  if (Object.keys(credentials).length === 0) {
    credentials = await serpCredentials({
      providerId: input.providerId,
      account,
      fields: provider.connection.fields,
    })
  }
  const credentialScope = providerCredentialScope(
    input.providerId,
    JSON.stringify({
      account: sortedRecord(account),
      credentials: sortedRecord(credentials),
    }),
  )
  const cacheKey = {
    provider: input.providerId,
    credentialScope,
    operation: 'serp-snapshot',
    request: { keyword, market, depth: input.depth },
  }
  const now = input.runtime?.now ?? (() => new Date())
  const cached = input.refresh
    ? null
    : readProviderCache(cacheKey, serpSnapshotResultSchema, {
        database: input.runtime?.database,
        now: now().getTime(),
      })
  if (cached) {
    return evidence({
      providerId: input.providerId,
      keyword,
      market,
      depth: input.depth,
      result: cached.data,
      cached: true,
      cache: {
        status: 'hit',
        storedAt: cached.storedAt,
        expiresAt: cached.expiresAt,
      },
    })
  }

  const estimatedCostMicros = capability.estimateCostMicros({
    keyword,
    market,
    depth: input.depth,
  })
  if (!Number.isSafeInteger(estimatedCostMicros) || estimatedCostMicros < 0) {
    throw new ProviderError({
      provider: input.providerId,
      operation: 'serp-snapshot',
      code: 'invalid-response',
      message: `${provider.displayName} returned an invalid cost estimate.`,
    })
  }
  const reservation = reserveProviderSpend(
    {
      provider: input.providerId,
      capability: 'serp-snapshot',
      endpoint: 'provider-extension',
      projectId: input.context.projectId,
      reportId: input.context.reportId,
      reportRunId: input.context.reportRunId,
      requestedRows: input.depth,
      estimatedCostMicros,
    },
    {
      database: input.runtime?.database,
      limits: input.runtime?.spendLimits,
      now: now().getTime(),
    },
  )

  const connection: SeoProviderConnection = { account, credentials }
  let result: SeoSerpSnapshotResult
  try {
    const raw = await capability.run(
      { ...connection, keyword, market, depth: input.depth },
      runtimeForProvider(input.providerId, {
        ...input.runtime,
        maxRequests: capability.maxRequests,
      }),
    )
    result = serpSnapshotResultSchema.parse(raw)
  } catch (error) {
    finalizeProviderSpend(
      reservation.id,
      {
        provider: input.providerId,
        state: 'failed',
        actualCostMicros: null,
        returnedRows: null,
        taskIds: [],
      },
      {
        database: input.runtime?.database,
        limits: input.runtime?.spendLimits,
        now: now().getTime(),
      },
    )
    const safe = safeProviderAdapterError(input.providerId, error, credentials)
    throw new ProviderError({
      provider: input.providerId,
      operation: 'serp-snapshot',
      code: adapterErrorCode(error),
      message: safe.message,
      cause: error,
    })
  }

  const spendNotice = finalizeProviderSpend(
    reservation.id,
    {
      provider: input.providerId,
      state:
        result.coverage.completeness === 'complete' ? 'succeeded' : 'partial',
      actualCostMicros: result.cost.actualMicros,
      returnedRows: result.coverage.returnedRows,
      taskIds: [...result.cost.taskIds],
    },
    {
      database: input.runtime?.database,
      limits: input.runtime?.spendLimits,
      now: now().getTime(),
    },
  )
  if (spendNotice) {
    result = {
      ...result,
      qualityWarnings: [
        ...result.qualityWarnings,
        {
          code: 'local-spend-notice',
          message: `Local ${provider.displayName} estimated spend reached ${spendNotice.spentMicros} micros for the UTC day.`,
        },
      ],
    }
  }
  try {
    writeProviderCache(
      cacheKey,
      {
        data: result,
        ttlMs: CACHE_TTL_MS,
        rowCount: result.coverage.returnedRows,
        sourceCostMicros: result.cost.actualMicros,
        taskIds: [...result.cost.taskIds],
      },
      { database: input.runtime?.database, now: now().getTime() },
    )
  } catch {
    result = {
      ...result,
      qualityWarnings: [
        ...result.qualityWarnings,
        {
          code: 'cache-write-failed',
          message:
            'The provider result is valid, but it could not be saved to the local cache.',
        },
      ],
    }
  }
  return evidence({
    providerId: input.providerId,
    keyword,
    market,
    depth: input.depth,
    result,
    cache: {
      status: input.refresh ? 'bypass' : 'miss',
      storedAt: null,
      expiresAt: null,
    },
  })
}
