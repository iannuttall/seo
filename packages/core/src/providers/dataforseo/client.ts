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
  ProviderWarning,
} from '../contracts.js'
import type { ProviderSpendLimits } from '../cost-limits.js'
import { ProviderError } from '../errors.js'
import { type ProviderFetch, providerRequestJson } from '../transport.js'
import {
  type DataForSeoUserDataResponse,
  dataForSeoUserDataResponseSchema,
} from './account-schema.js'
import type { DataForSeoCredentials } from './credentials.js'
import { readDataForSeoCredentials } from './credentials.js'
import {
  type DataForSeoKeywordOverviewResponse,
  dataForSeoKeywordOverviewResponseSchema,
} from './schema.js'

const DEFAULT_BASE_URL = 'https://api.dataforseo.com/'
const USER_DATA_PATH = 'v3/appendix/user_data'
const KEYWORD_OVERVIEW_PATH = 'v3/dataforseo_labs/google/keyword_overview/live'
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_USER_DATA_RESPONSE_BYTES = 5 * 1024 * 1024
const DEFAULT_KEYWORD_OVERVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_ACCOUNT_PRICING_TTL_MS = 5 * 60 * 1000
const MAX_KEYWORDS_PER_OVERVIEW_REQUEST = 100

export type DataForSeoAccountSnapshot = {
  provider: 'dataforseo'
  login: string
  timezone: string | null
  balanceMicros: number | null
  depositedMicros: number | null
  accountDailySpendMicros: number | null
  accountDailySpendPeriod: string | null
  accountDailyLimitMicros: number | null
  keywordOverviewPrice: {
    perRequestMicros: number | null
    perResultMicros: number | null
  }
  backlinksSubscriptionExpiresAt: string | null
  aiMentionsSubscriptionExpiresAt: string | null
  apiVersion: string | null
  requestCostMicros: number
  taskIds: string[]
  observedAt: string
}

export type DataForSeoClientOptions = {
  fetch?: ProviderFetch
  credentials?: () =>
    | DataForSeoCredentials
    | undefined
    | Promise<DataForSeoCredentials | undefined>
  baseUrl?: string
  timeoutMs?: number
  maxResponseBytes?: number
  now?: () => Date
  database?: Database.Database
  keywordOverviewTtlMs?: number
  accountPricingTtlMs?: number
  spendLimits?: ProviderSpendLimits
}

export type DataForSeoKeywordOverviewRequest = {
  keywords: string[]
  languageCode: string
  locationCode: number
  includeClickstreamData?: boolean
  refresh?: boolean
  projectId?: string
  reportId: string
  reportRunId: string
}

export type DataForSeoKeywordOverviewSnapshot = {
  response: DataForSeoKeywordOverviewResponse
  observedAt: string
  returnedRows: number
  cache: ProviderCacheEvidence
  cost: ProviderCostEvidence
  spendNotice: ProviderSpendNotice | null
  warnings: ProviderWarning[]
}

type UserDataAccount = NonNullable<
  DataForSeoUserDataResponse['tasks'][number]['result']
>[number]

function usdToMicros(value: number | undefined): number | null {
  if (value === undefined) return null
  return Math.round(value * 1_000_000)
}

function keywordOverviewPrice(
  account: UserDataAccount,
): DataForSeoAccountSnapshot['keywordOverviewPrice'] {
  const components =
    account.price?.dataforseo_labs?.keyword_overview?.live?.priority_normal ??
    []
  const total = (type: 'per_request' | 'per_result') => {
    const matching = components.filter((item) => item.cost_type === type)
    return matching.length
      ? matching.reduce(
          (sum, item) => sum + Math.round(item.cost * 1_000_000),
          0,
        )
      : null
  }
  return {
    perRequestMicros: total('per_request'),
    perResultMicros: total('per_result'),
  }
}

function taskErrorCode(
  statusCode: number,
): 'authentication' | 'rate-limit' | 'remote-error' {
  if (statusCode >= 40100 && statusCode < 40200) return 'authentication'
  if (statusCode === 40202) return 'rate-limit'
  return 'remote-error'
}

function responseTaskIds(
  response: DataForSeoKeywordOverviewResponse,
): string[] {
  return [
    ...new Set(response.tasks.flatMap((task) => (task.id ? [task.id] : []))),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

function responseCostMicros(
  response: DataForSeoKeywordOverviewResponse,
): number | null {
  if (response.cost !== undefined) return usdToMicros(response.cost)
  if (response.tasks.some((task) => task.cost === undefined)) return null
  return response.tasks.reduce(
    (sum, task) => sum + (usdToMicros(task.cost) ?? 0),
    0,
  )
}

function responseRows(response: DataForSeoKeywordOverviewResponse): number {
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

export class DataForSeoClient {
  private readonly fetch: ProviderFetch
  private readonly credentials: () =>
    | DataForSeoCredentials
    | undefined
    | Promise<DataForSeoCredentials | undefined>
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxResponseBytes: number
  private readonly now: () => Date
  private readonly database: Database.Database | undefined
  private readonly keywordOverviewTtlMs: number
  private readonly accountPricingTtlMs: number
  private readonly spendLimits: ProviderSpendLimits | undefined
  private accountPricing:
    | {
        credentialScope: string
        expiresAt: number
        snapshot: DataForSeoAccountSnapshot
      }
    | undefined
  private accountPricingRequest:
    | {
        credentialScope: string
        promise: Promise<DataForSeoAccountSnapshot>
      }
    | undefined

  constructor(options: DataForSeoClientOptions = {}) {
    this.fetch = options.fetch ?? fetch
    this.credentials = options.credentials ?? readDataForSeoCredentials
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxResponseBytes =
      options.maxResponseBytes ?? MAX_USER_DATA_RESPONSE_BYTES
    this.now = options.now ?? (() => new Date())
    this.database = options.database
    this.keywordOverviewTtlMs =
      options.keywordOverviewTtlMs ?? DEFAULT_KEYWORD_OVERVIEW_TTL_MS
    this.accountPricingTtlMs =
      options.accountPricingTtlMs ?? DEFAULT_ACCOUNT_PRICING_TTL_MS
    this.spendLimits = options.spendLimits
  }

  private async getCredentials(
    operation: string,
  ): Promise<DataForSeoCredentials> {
    const credentials = await this.credentials()
    if (!credentials) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation,
        code: 'configuration',
        message:
          'DataForSEO is not connected. Run `seo providers dataforseo connect`, or set SEO_DATAFORSEO_LOGIN and SEO_DATAFORSEO_PASSWORD.',
      })
    }
    return credentials
  }

  private authorization(credentials: DataForSeoCredentials): string {
    return `Basic ${Buffer.from(
      `${credentials.login}:${credentials.password}`,
    ).toString('base64')}`
  }

  private async userDataForCredentials(
    credentials: DataForSeoCredentials,
  ): Promise<DataForSeoAccountSnapshot> {
    let response: DataForSeoUserDataResponse
    try {
      response = await providerRequestJson({
        provider: 'dataforseo',
        operation: 'account-status',
        url: new URL(USER_DATA_PATH, this.baseUrl),
        fetch: this.fetch,
        maxResponseBytes: this.maxResponseBytes,
        timeoutMs: this.timeoutMs,
        retry: 'safe',
        schema: dataForSeoUserDataResponseSchema,
        init: {
          method: 'GET',
          headers: { authorization: this.authorization(credentials) },
        },
      })
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'authentication') {
        throw new ProviderError({
          provider: 'dataforseo',
          operation: 'account-status',
          code: 'authentication',
          status: error.status ?? undefined,
          message:
            'DataForSEO rejected the API login or API password. Run `seo providers dataforseo connect` again, or check SEO_DATAFORSEO_LOGIN and SEO_DATAFORSEO_PASSWORD.',
          cause: error,
        })
      }
      throw error
    }

    const failedTask = response.tasks.find((task) => task.status_code !== 20000)
    if (
      response.status_code !== 20000 ||
      response.tasks_error > 0 ||
      failedTask
    ) {
      const statusCode = failedTask?.status_code ?? response.status_code
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'account-status',
        code: taskErrorCode(statusCode),
        message: `DataForSEO could not return account status (${statusCode}).`,
        retryable: statusCode === 40202,
      })
    }

    const account = response.tasks[0]?.result?.[0]
    if (!account) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'account-status',
        code: 'invalid-response',
        message: 'DataForSEO returned account status without an account row.',
      })
    }

    return {
      provider: 'dataforseo',
      login: account.login,
      timezone: account.timezone ?? null,
      balanceMicros: usdToMicros(account.money?.balance),
      depositedMicros: usdToMicros(account.money?.total),
      accountDailySpendMicros: usdToMicros(
        account.money?.statistics?.day?.total,
      ),
      accountDailySpendPeriod: account.money?.statistics?.day?.value ?? null,
      accountDailyLimitMicros: usdToMicros(account.money?.limits?.day?.total),
      keywordOverviewPrice: keywordOverviewPrice(account),
      backlinksSubscriptionExpiresAt:
        account.backlinks_subscription_expiry_date ?? null,
      aiMentionsSubscriptionExpiresAt:
        account.llm_mentions_subscription_expiry_date ?? null,
      apiVersion: response.version ?? null,
      requestCostMicros: usdToMicros(response.cost) ?? 0,
      taskIds: response.tasks.flatMap((task) => (task.id ? [task.id] : [])),
      observedAt: this.now().toISOString(),
    }
  }

  async userData(): Promise<DataForSeoAccountSnapshot> {
    return this.userDataForCredentials(
      await this.getCredentials('account-status'),
    )
  }

  private async pricingForCredentials(
    credentials: DataForSeoCredentials,
    credentialScope: string,
  ): Promise<DataForSeoAccountSnapshot> {
    const now = this.now().getTime()
    if (
      this.accountPricing?.credentialScope === credentialScope &&
      this.accountPricing.expiresAt > now
    ) {
      return this.accountPricing.snapshot
    }
    if (this.accountPricingRequest?.credentialScope === credentialScope) {
      return this.accountPricingRequest.promise
    }
    const promise = this.userDataForCredentials(credentials).then(
      (snapshot) => {
        this.accountPricing = {
          credentialScope,
          expiresAt: this.now().getTime() + this.accountPricingTtlMs,
          snapshot,
        }
        return snapshot
      },
    )
    this.accountPricingRequest = { credentialScope, promise }
    try {
      return await promise
    } finally {
      if (this.accountPricingRequest?.promise === promise) {
        this.accountPricingRequest = undefined
      }
    }
  }

  async keywordOverview(
    input: DataForSeoKeywordOverviewRequest,
  ): Promise<DataForSeoKeywordOverviewSnapshot> {
    const keywords = input.keywords.map((keyword) => keyword.trim())
    if (
      keywords.length < 1 ||
      keywords.length > MAX_KEYWORDS_PER_OVERVIEW_REQUEST ||
      keywords.some((keyword) => keyword.length < 1 || keyword.length > 700)
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'configuration',
        message: `Keyword metrics requires 1 to ${MAX_KEYWORDS_PER_OVERVIEW_REQUEST} non-empty keywords of at most 700 characters.`,
      })
    }
    if (!/^[a-z]{2}$/.test(input.languageCode)) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'configuration',
        message: 'DataForSEO language code must contain two lowercase letters.',
      })
    }
    if (!Number.isSafeInteger(input.locationCode) || input.locationCode <= 0) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'configuration',
        message: 'DataForSEO location code must be a positive integer.',
      })
    }

    const credentials = await this.getCredentials('keyword-metrics')
    const credentialScope = providerCredentialScope(
      'dataforseo',
      credentials.login,
    )
    const request = {
      keywords,
      language_code: input.languageCode,
      location_code: input.locationCode,
      ...(input.includeClickstreamData
        ? { include_clickstream_data: true }
        : {}),
    }
    const cacheKey = {
      provider: 'dataforseo' as const,
      credentialScope,
      operation: 'keyword-metrics',
      request,
    }
    const cached = input.refresh
      ? null
      : readProviderCache(cacheKey, dataForSeoKeywordOverviewResponseSchema, {
          database: this.database,
          now: this.now().getTime(),
        })
    if (cached) {
      return {
        response: cached.data,
        observedAt: cached.storedAt,
        returnedRows: cached.rowCount ?? responseRows(cached.data),
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
        },
        spendNotice: null,
        warnings: [],
      }
    }

    const account = await this.pricingForCredentials(
      credentials,
      credentialScope,
    )
    const { perRequestMicros, perResultMicros } = account.keywordOverviewPrice
    if (perRequestMicros === null || perResultMicros === null) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'invalid-response',
        message:
          'DataForSEO account pricing is unavailable, so the paid request was not started.',
      })
    }
    const multiplier = input.includeClickstreamData ? 2 : 1
    const estimatedCostMicros =
      (perRequestMicros + perResultMicros * keywords.length) * multiplier
    const requestedAt = this.now().getTime()
    const reservation = reserveProviderSpend(
      {
        provider: 'dataforseo',
        capability: 'keyword-metrics',
        endpoint: KEYWORD_OVERVIEW_PATH,
        projectId: input.projectId,
        reportId: input.reportId,
        reportRunId: input.reportRunId,
        requestedRows: keywords.length,
        estimatedCostMicros,
      },
      {
        database: this.database,
        limits: this.spendLimits,
        now: requestedAt,
      },
    )

    let response: DataForSeoKeywordOverviewResponse
    try {
      response = await providerRequestJson({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        url: new URL(KEYWORD_OVERVIEW_PATH, this.baseUrl),
        fetch: this.fetch,
        maxResponseBytes: this.maxResponseBytes,
        timeoutMs: this.timeoutMs,
        retry: 'never',
        schema: dataForSeoKeywordOverviewResponseSchema,
        init: {
          method: 'POST',
          headers: {
            authorization: this.authorization(credentials),
            'content-type': 'application/json',
          },
          body: JSON.stringify([request]),
        },
      })
    } catch (error) {
      finalizeProviderSpend(
        reservation.id,
        {
          provider: 'dataforseo',
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

    const actualCostMicros = responseCostMicros(response)
    const returnedRows = responseRows(response)
    const taskIds = responseTaskIds(response)
    const failedTasks = response.tasks.filter(
      (task) => task.status_code !== 20000,
    )
    const failed =
      response.status_code !== 20000 ||
      response.tasks_error > 0 ||
      failedTasks.length > 0
    const state = failed
      ? failedTasks.length < response.tasks.length
        ? 'partial'
        : 'failed'
      : 'succeeded'
    const spendNotice = finalizeProviderSpend(
      reservation.id,
      {
        provider: 'dataforseo',
        state,
        actualCostMicros,
        returnedRows,
        taskIds,
      },
      {
        database: this.database,
        limits: this.spendLimits,
        now: this.now().getTime(),
      },
    )
    if (failed) {
      const statusCode = failedTasks[0]?.status_code ?? response.status_code
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: taskErrorCode(statusCode),
        message: `DataForSEO could not complete the keyword metrics task (${statusCode}).`,
        retryable: statusCode === 40202,
      })
    }

    const warnings: ProviderWarning[] = []
    try {
      writeProviderCache(
        cacheKey,
        {
          data: response,
          ttlMs: this.keywordOverviewTtlMs,
          rowCount: returnedRows,
          sourceCostMicros: actualCostMicros,
          taskIds,
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
        estimatedMicros: estimatedCostMicros,
        actualMicros: actualCostMicros,
        taskIds,
      },
      spendNotice,
      warnings,
    }
  }
}
