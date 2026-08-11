import { fetch } from 'undici'
import {
  finalizeProviderSpend,
  type ProviderSpendNotice,
  reserveProviderSpend,
} from '../../storage/provider-spend.js'
import type Database from '../../storage/sqlite.js'
import {
  providerCredentialScope,
  readProviderCache,
  writeProviderCache,
} from '../cache.js'
import type {
  ProviderCacheEvidence,
  ProviderCostEvidence,
  ProviderRequestContext,
  ProviderWarning,
} from '../contracts.js'
import type { ProviderSpendLimits } from '../cost-limits.js'
import { ProviderError } from '../errors.js'
import { type ProviderFetch, providerRequestJson } from '../transport.js'
import { readSerpBaseApiKey } from './credentials.js'
import {
  type SerpBaseSearchResponse,
  type SerpBaseSearchSuccess,
  serpBaseSearchResponseSchema,
} from './schema.js'

const DEFAULT_BASE_URL = 'https://api.serpbase.dev/'
const SEARCH_ENDPOINT = 'google/search'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const DEFAULT_SEARCH_TTL_MS = 24 * 60 * 60 * 1_000

// SerpBase currently advertises standard Search credits at $0.30 to $0.50
// per 1,000. Use the upper bound until the API reports an account-specific
// monetary cost.
export const SERPBASE_SEARCH_ESTIMATED_COST_MICROS = 500

export type SerpBaseSearchRequest = {
  keyword: string
  countryCode: string
  languageCode: string
  device: 'desktop' | 'mobile'
  requestedRows: number
  refresh?: boolean
  context: ProviderRequestContext
}

export type SerpBaseSearchSnapshot = {
  response: SerpBaseSearchSuccess
  observedAt: string
  returnedRows: number
  cache: ProviderCacheEvidence
  cost: ProviderCostEvidence
  spendNotice: ProviderSpendNotice | null
  warnings: ProviderWarning[]
}

export type SerpBaseClientOptions = {
  apiKey?: string
  credentials?: () =>
    | { apiKey: string }
    | undefined
    | Promise<{ apiKey: string } | undefined>
  baseUrl?: string
  fetch?: ProviderFetch
  timeoutMs?: number
  maxResponseBytes?: number
  searchTtlMs?: number
  now?: () => Date
  database?: Database.Database
  spendLimits?: ProviderSpendLimits
}

function businessError(
  response: Exclude<SerpBaseSearchResponse, { status: 0 }>,
) {
  const code =
    response.status === 1000
      ? 'configuration'
      : response.status === 1001
        ? 'authentication'
        : response.status === 1020
          ? 'budget-limit'
          : response.status === 1029
            ? 'rate-limit'
            : 'remote-error'
  return new ProviderError({
    provider: 'serpbase',
    operation: 'serp-snapshot',
    code,
    message: `SerpBase could not complete the search (${response.status}: ${response.error}).`,
    retryable: [1029, 1500, 1502, 1503, 1504].includes(response.status),
  })
}

export class SerpBaseClient {
  private readonly credentials: () =>
    | { apiKey: string }
    | undefined
    | Promise<{ apiKey: string } | undefined>
  private readonly baseUrl: string
  private readonly fetch: ProviderFetch
  private readonly timeoutMs: number
  private readonly maxResponseBytes: number
  private readonly searchTtlMs: number
  private readonly now: () => Date
  private readonly database: Database.Database | undefined
  private readonly spendLimits: ProviderSpendLimits | undefined

  constructor(options: SerpBaseClientOptions = {}) {
    this.credentials = options.apiKey
      ? () => ({ apiKey: options.apiKey as string })
      : (options.credentials ?? readSerpBaseApiKey)
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.fetch = options.fetch ?? fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
    this.searchTtlMs = options.searchTtlMs ?? DEFAULT_SEARCH_TTL_MS
    this.now = options.now ?? (() => new Date())
    this.database = options.database
    this.spendLimits = options.spendLimits
  }

  private async apiKey(): Promise<string> {
    const credential = await this.credentials()
    const apiKey = credential?.apiKey.trim()
    if (!apiKey || apiKey.length > 4_096) {
      throw new ProviderError({
        provider: 'serpbase',
        operation: 'serp-snapshot',
        code: 'configuration',
        message:
          'SerpBase is not connected. Run `seo providers serpbase connect`, or set SEO_SERPBASE_API_KEY.',
      })
    }
    return apiKey
  }

  async search(input: SerpBaseSearchRequest): Promise<SerpBaseSearchSnapshot> {
    const apiKey = await this.apiKey()
    const keyword = input.keyword.trim().replace(/\s+/gu, ' ')
    if (!keyword || keyword.length > 80 || keyword.split(/\s+/u).length > 10) {
      throw new ProviderError({
        provider: 'serpbase',
        operation: 'serp-snapshot',
        code: 'configuration',
        message:
          'SerpBase Search requires a keyword of at most 80 characters and 10 words.',
      })
    }
    if (!/^[A-Z]{2}$/u.test(input.countryCode)) {
      throw new ProviderError({
        provider: 'serpbase',
        operation: 'serp-snapshot',
        code: 'configuration',
        message:
          'SerpBase Search requires a two-letter uppercase country code.',
      })
    }
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/u.test(input.languageCode)) {
      throw new ProviderError({
        provider: 'serpbase',
        operation: 'serp-snapshot',
        code: 'configuration',
        message: 'SerpBase Search requires a valid lowercase language code.',
      })
    }
    if (
      !Number.isSafeInteger(input.requestedRows) ||
      input.requestedRows < 1 ||
      input.requestedRows > 10
    ) {
      throw new ProviderError({
        provider: 'serpbase',
        operation: 'serp-snapshot',
        code: 'configuration',
        message: 'SerpBase Search requested rows must be from 1 to 10.',
      })
    }
    const request = {
      q: keyword,
      hl: input.languageCode,
      gl: input.countryCode.toLowerCase(),
      page: 1,
      device: input.device === 'desktop' ? 'pc' : 'mobile',
    }
    const credentialScope = providerCredentialScope('serpbase', apiKey)
    const cacheKey = {
      provider: 'serpbase' as const,
      credentialScope,
      operation: 'serp-snapshot',
      request,
    }
    const cached = input.refresh
      ? null
      : readProviderCache(cacheKey, serpBaseSearchResponseSchema, {
          database: this.database,
          now: this.now().getTime(),
        })
    if (cached?.data.status === 0) {
      return {
        response: cached.data,
        observedAt: cached.storedAt,
        returnedRows: cached.rowCount ?? cached.data.organic?.length ?? 0,
        cache: {
          status: 'hit',
          storedAt: cached.storedAt,
          expiresAt: cached.expiresAt,
        },
        cost: {
          currency: 'USD',
          estimatedMicros: 0,
          actualMicros: 0,
          taskIds: cached.taskIds,
          native: {
            unit: 'credit',
            estimatedUnits: 0,
            actualUnits: 0,
            remainingBefore: null,
          },
        },
        spendNotice: null,
        warnings: [],
      }
    }

    const reservation = reserveProviderSpend(
      {
        provider: 'serpbase',
        capability: 'serp-snapshot',
        endpoint: SEARCH_ENDPOINT,
        projectId: input.context.projectId,
        reportId: input.context.reportId,
        reportRunId: input.context.reportRunId,
        requestedRows: input.requestedRows,
        estimatedCostMicros: SERPBASE_SEARCH_ESTIMATED_COST_MICROS,
      },
      {
        database: this.database,
        limits: this.spendLimits,
        now: this.now().getTime(),
      },
    )

    let response: SerpBaseSearchResponse
    try {
      response = await providerRequestJson({
        provider: 'serpbase',
        operation: 'serp-snapshot',
        url: new URL(SEARCH_ENDPOINT, this.baseUrl),
        fetch: this.fetch,
        maxResponseBytes: this.maxResponseBytes,
        timeoutMs: this.timeoutMs,
        retry: 'never',
        schema: serpBaseSearchResponseSchema,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'x-serpbase-source': 'seo',
          },
          body: JSON.stringify(request),
        },
      })
    } catch (error) {
      finalizeProviderSpend(
        reservation.id,
        {
          provider: 'serpbase',
          state: 'failed',
          actualCostMicros: null,
          returnedRows: null,
          taskIds: [],
        },
        {
          database: this.database,
          limits: this.spendLimits,
          now: this.now().getTime(),
        },
      )
      throw error
    }

    if (response.status !== 0) {
      finalizeProviderSpend(
        reservation.id,
        {
          provider: 'serpbase',
          state: 'failed',
          actualCostMicros: response.credits_charged === 0 ? 0 : null,
          returnedRows: 0,
          taskIds: response.request_id ? [response.request_id] : [],
        },
        {
          database: this.database,
          limits: this.spendLimits,
          now: this.now().getTime(),
        },
      )
      throw businessError(response)
    }

    const returnedRows = response.organic?.length ?? 0
    const spendNotice = finalizeProviderSpend(
      reservation.id,
      {
        provider: 'serpbase',
        state: 'succeeded',
        actualCostMicros: response.credits_charged === 0 ? 0 : null,
        returnedRows,
        taskIds: [response.request_id],
      },
      {
        database: this.database,
        limits: this.spendLimits,
        now: this.now().getTime(),
      },
    )
    const warnings: ProviderWarning[] = []
    if (spendNotice) {
      warnings.push({
        code: 'local-spend-notice',
        message: `Local SerpBase estimated spend reached ${spendNotice.spentMicros} micros for the UTC day.`,
      })
    }
    try {
      writeProviderCache(
        cacheKey,
        {
          data: response,
          ttlMs: this.searchTtlMs,
          rowCount: returnedRows,
          sourceCostMicros: null,
          taskIds: [response.request_id],
        },
        { database: this.database, now: this.now().getTime() },
      )
    } catch {
      warnings.push({
        code: 'cache-write-failed',
        message:
          'The provider result is valid, but it could not be saved to the local cache.',
      })
    }

    return {
      response,
      observedAt: this.now().toISOString(),
      returnedRows,
      cache: {
        status: input.refresh ? 'bypass' : 'miss',
        storedAt: null,
        expiresAt: null,
      },
      cost: {
        currency: 'USD',
        estimatedMicros: SERPBASE_SEARCH_ESTIMATED_COST_MICROS,
        actualMicros: response.credits_charged === 0 ? 0 : null,
        taskIds: [response.request_id],
        native: {
          unit: 'credit',
          estimatedUnits: 1,
          actualUnits: response.credits_charged,
          remainingBefore: null,
        },
      },
      spendNotice,
      warnings,
    }
  }
}
