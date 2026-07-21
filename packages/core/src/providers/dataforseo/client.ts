import { fetch } from 'undici'
import type { ZodType } from 'zod'
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
  KeywordDiscoverySource,
  ProviderCacheEvidence,
  ProviderCapability,
  ProviderCostEvidence,
  ProviderRequestContext,
  ProviderWarning,
} from '../contracts.js'
import type { ProviderSpendLimits } from '../cost-limits.js'
import { ProviderError } from '../errors.js'
import { type ProviderFetch, providerRequestJson } from '../transport.js'
import {
  type DataForSeoUserDataResponse,
  dataForSeoUserDataResponseSchema,
} from './account-schema.js'
import type {
  DataForSeoAccountSnapshot,
  DataForSeoClientOptions,
  DataForSeoKeywordDiscoveryRequest,
  DataForSeoKeywordDiscoverySnapshot,
  DataForSeoKeywordOverviewRequest,
  DataForSeoKeywordOverviewSnapshot,
  DataForSeoSerpRequest,
  DataForSeoSerpSnapshot,
  DataForSeoSerpTaskInput,
  DataForSeoSerpTaskPostSnapshot,
  DataForSeoSerpReadyTask,
} from './client-types.js'
import type { DataForSeoCredentials } from './credentials.js'
import { readDataForSeoCredentials } from './credentials.js'
import {
  type DataForSeoDiscoveryResponse,
  dataForSeoDiscoveryResponseSchema,
} from './discovery-schema.js'
import {
  type DataForSeoPaidResponse,
  type DataForSeoUnitPrice,
  dataForSeoPaidPost,
} from './paid-request.js'
import {
  type DataForSeoKeywordOverviewResponse,
  dataForSeoKeywordOverviewResponseSchema,
} from './schema.js'
import {
  type DataForSeoSerpResponse,
  dataForSeoSerpResponseSchema,
} from './serp-schema.js'
import {
  dataForSeoSerpTaskPostResponseSchema,
  dataForSeoSerpTasksReadyResponseSchema,
} from './serp-task-schema.js'

const DEFAULT_BASE_URL = 'https://api.dataforseo.com/'
const USER_DATA_PATH = 'v3/appendix/user_data'
const KEYWORD_OVERVIEW_PATH = 'v3/dataforseo_labs/google/keyword_overview/live'
const KEYWORD_DISCOVERY_PATHS = {
  ideas: 'v3/dataforseo_labs/google/keyword_ideas/live',
  related: 'v3/dataforseo_labs/google/related_keywords/live',
  suggestions: 'v3/dataforseo_labs/google/keyword_suggestions/live',
} as const satisfies Record<KeywordDiscoverySource, string>
const SERP_LIVE_ADVANCED_PATH = 'v3/serp/google/organic/live/advanced'
const SERP_TASK_POST_PATH = 'v3/serp/google/organic/task_post'
const SERP_TASKS_READY_PATH = 'v3/serp/google/organic/tasks_ready'
const SERP_TASK_GET_ADVANCED_PATH = 'v3/serp/google/organic/task_get/advanced/'
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_USER_DATA_RESPONSE_BYTES = 5 * 1024 * 1024
const DEFAULT_KEYWORD_OVERVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_KEYWORD_DISCOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_SERP_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_ACCOUNT_PRICING_TTL_MS = 5 * 60 * 1000
const MAX_KEYWORDS_PER_OVERVIEW_REQUEST = 100
const MAX_KEYWORD_CHARACTERS = 80
const MAX_KEYWORD_WORDS = 10
const MAX_DISCOVERY_SEEDS = 5
const MAX_DISCOVERY_ROWS = 100
const MAX_SERP_DEPTH = 100
const MAX_SERP_TASKS_PER_POST = 100

function validateSerpInput(
  input: Omit<DataForSeoSerpRequest, 'refresh' | 'context'>,
): { keyword: string; locationName: string | undefined } {
  const keyword = input.keyword.trim().replace(/\s+/gu, ' ')
  if (
    keyword.length < 1 ||
    keyword.length > MAX_KEYWORD_CHARACTERS ||
    keyword.split(/\s+/u).length > MAX_KEYWORD_WORDS
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-snapshot',
      code: 'configuration',
      message: `SERP snapshots require a keyword of at most ${MAX_KEYWORD_CHARACTERS} characters and ${MAX_KEYWORD_WORDS} words.`,
    })
  }
  if (
    /(?:^|\s)(?:allinanchor|allintext|allintitle|allinurl|cache|define|definition|filetype|id|inanchor|info|intext|intitle|inurl|link|site):/iu.test(
      keyword,
    )
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-snapshot',
      code: 'configuration',
      message:
        'SERP snapshot keywords cannot contain search operators with multiplied provider pricing.',
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
      message: `SERP depth must be from 1 to ${MAX_SERP_DEPTH}.`,
    })
  }
  if (!/^[a-z]{2}$/.test(input.languageCode)) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-snapshot',
      code: 'configuration',
      message: 'DataForSEO language code must contain two lowercase letters.',
    })
  }
  const locationName = input.locationName?.trim()
  if ((input.locationCode !== undefined) === Boolean(locationName)) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-snapshot',
      code: 'configuration',
      message:
        'DataForSEO SERP snapshots require exactly one location code or location name.',
    })
  }
  return { keyword, locationName }
}

export type {
  DataForSeoAccountSnapshot,
  DataForSeoClientOptions,
  DataForSeoKeywordDiscoveryRequest,
  DataForSeoKeywordDiscoverySnapshot,
  DataForSeoKeywordOverviewRequest,
  DataForSeoKeywordOverviewSnapshot,
  DataForSeoSerpRequest,
  DataForSeoSerpSnapshot,
} from './client-types.js'

type UserDataAccount = NonNullable<
  DataForSeoUserDataResponse['tasks'][number]['result']
>[number]

function usdToMicros(value: number | undefined): number | null {
  if (value === undefined) return null
  return Math.round(value * 1_000_000)
}

function unitPrice(
  components: Array<{ cost_type: string; cost: number }> | null | undefined,
): DataForSeoUnitPrice {
  const prices = components ?? []
  const total = (type: 'per_request' | 'per_result') => {
    const matching = prices.filter((item) => item.cost_type === type)
    return matching.length
      ? matching.reduce(
          (sum, item) => sum + Math.round(item.cost * 1_000_000),
          0,
        )
      : prices.length
        ? 0
        : null
  }
  return {
    perRequestMicros: total('per_request'),
    perResultMicros: total('per_result'),
  }
}

function keywordOverviewPrice(account: UserDataAccount): DataForSeoUnitPrice {
  return unitPrice(
    account.price?.dataforseo_labs?.keyword_overview?.live?.priority_normal,
  )
}

function keywordDiscoveryPrices(
  account: UserDataAccount,
): DataForSeoAccountSnapshot['keywordDiscoveryPrices'] {
  return {
    ideas: unitPrice(
      account.price?.dataforseo_labs?.keyword_ideas?.live?.priority_normal,
    ),
    related: unitPrice(
      account.price?.dataforseo_labs?.related_keywords?.live?.priority_normal,
    ),
    suggestions: unitPrice(
      account.price?.dataforseo_labs?.keyword_suggestions?.live
        ?.priority_normal,
    ),
  }
}

function serpLiveAdvancedPrice(account: UserDataAccount): DataForSeoUnitPrice {
  return unitPrice(account.price?.serp?.live?.advanced?.priority_normal)
}

function serpTaskPostPrice(account: UserDataAccount): DataForSeoUnitPrice {
  return unitPrice(account.price?.serp?.task_post?.priority_normal)
}

function taskErrorCode(
  statusCode: number,
): 'authentication' | 'rate-limit' | 'remote-error' {
  if (statusCode >= 40100 && statusCode < 40200) return 'authentication'
  if (statusCode === 40202) return 'rate-limit'
  return 'remote-error'
}

function responseTaskIds(response: DataForSeoPaidResponse): string[] {
  return [
    ...new Set(response.tasks.flatMap((task) => (task.id ? [task.id] : []))),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

function responseCostMicros(response: DataForSeoPaidResponse): number | null {
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

function discoveryRows(response: DataForSeoDiscoveryResponse): number {
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

function discoveryTotalRows(
  response: DataForSeoDiscoveryResponse,
): number | null {
  const totals = response.tasks.flatMap((task) =>
    (task.result ?? []).flatMap((result) =>
      typeof result.total_count === 'number' ? [result.total_count] : [],
    ),
  )
  return totals.length ? totals.reduce((sum, value) => sum + value, 0) : null
}

function discoveryNextCursor(
  response: DataForSeoDiscoveryResponse,
): string | null {
  const cursors = response.tasks.flatMap((task) =>
    (task.result ?? []).flatMap((result) =>
      result.offset_token ? [result.offset_token] : [],
    ),
  )
  return cursors.length === 1 ? (cursors[0] ?? null) : null
}

function serpRows(response: DataForSeoSerpResponse): number {
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
  private readonly keywordDiscoveryTtlMs: number
  private readonly serpTtlMs: number
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
    this.keywordDiscoveryTtlMs =
      options.keywordDiscoveryTtlMs ?? DEFAULT_KEYWORD_DISCOVERY_TTL_MS
    this.serpTtlMs = options.serpTtlMs ?? DEFAULT_SERP_TTL_MS
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
      keywordDiscoveryPrices: keywordDiscoveryPrices(account),
      serpLiveAdvancedPrice: serpLiveAdvancedPrice(account),
      serpTaskPostPrice: serpTaskPostPrice(account),
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

  private async paidPost<T extends DataForSeoPaidResponse>(input: {
    operation: string
    capability: ProviderCapability
    endpoint: string
    request: unknown
    schema: ZodType<T>
    requestedRows: number
    estimatedRequestUnits?: number
    price: (account: DataForSeoAccountSnapshot) => DataForSeoUnitPrice
    context: ProviderRequestContext
    ttlMs: number
    refresh?: boolean
    rowCount: (response: T) => number
  }): Promise<{
    response: T
    observedAt: string
    returnedRows: number
    cache: ProviderCacheEvidence
    cost: ProviderCostEvidence
    spendNotice: ProviderSpendNotice | null
    warnings: ProviderWarning[]
  }> {
    const credentials = await this.getCredentials(input.operation)
    const credentialScope = providerCredentialScope(
      'dataforseo',
      credentials.login,
    )
    return dataForSeoPaidPost({
      ...input,
      credentials,
      credentialScope,
      price: async () =>
        input.price(
          await this.pricingForCredentials(credentials, credentialScope),
        ),
      baseUrl: this.baseUrl,
      fetch: this.fetch,
      maxResponseBytes: this.maxResponseBytes,
      timeoutMs: this.timeoutMs,
      now: this.now,
      database: this.database,
      spendLimits: this.spendLimits,
    })
  }

  async keywordOverview(
    input: DataForSeoKeywordOverviewRequest,
  ): Promise<DataForSeoKeywordOverviewSnapshot> {
    const keywords = input.keywords.map((keyword) => keyword.trim())
    if (
      keywords.length < 1 ||
      keywords.length > MAX_KEYWORDS_PER_OVERVIEW_REQUEST ||
      keywords.some(
        (keyword) =>
          keyword.length < 1 ||
          keyword.length > MAX_KEYWORD_CHARACTERS ||
          keyword.split(/\s+/u).length > MAX_KEYWORD_WORDS,
      )
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'configuration',
        message: `Keyword metrics requires 1 to ${MAX_KEYWORDS_PER_OVERVIEW_REQUEST} non-empty keywords of at most ${MAX_KEYWORD_CHARACTERS} characters and ${MAX_KEYWORD_WORDS} words.`,
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
    const hasLocationCode = input.locationCode !== undefined
    const locationName = input.locationName?.trim()
    const hasLocationName = Boolean(locationName)
    if (hasLocationCode === hasLocationName) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'configuration',
        message:
          'DataForSEO keyword metrics requires exactly one location code or location name.',
      })
    }
    if (
      hasLocationCode &&
      (!Number.isSafeInteger(input.locationCode) ||
        (input.locationCode ?? 0) <= 0)
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'configuration',
        message: 'DataForSEO location code must be a positive integer.',
      })
    }
    if (locationName && locationName.length > 500) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'configuration',
        message: 'DataForSEO location name must be at most 500 characters.',
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
      ...(input.locationCode !== undefined
        ? { location_code: input.locationCode }
        : { location_name: locationName }),
      ...(input.includeSerpInfo ? { include_serp_info: true } : {}),
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

  async keywordDiscovery(
    input: DataForSeoKeywordDiscoveryRequest,
  ): Promise<DataForSeoKeywordDiscoverySnapshot> {
    const seeds = input.seeds.map((seed) => seed.trim())
    if (
      seeds.length < 1 ||
      seeds.length > MAX_DISCOVERY_SEEDS ||
      seeds.some(
        (seed) =>
          seed.length < 1 ||
          seed.length > MAX_KEYWORD_CHARACTERS ||
          seed.split(/\s+/u).length > MAX_KEYWORD_WORDS,
      )
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-discovery',
        code: 'configuration',
        message: `Keyword discovery requires 1 to ${MAX_DISCOVERY_SEEDS} seeds of at most ${MAX_KEYWORD_CHARACTERS} characters and ${MAX_KEYWORD_WORDS} words.`,
      })
    }
    if (
      input.source !== 'ideas' &&
      (seeds.length !== 1 || seeds[0] === undefined)
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-discovery',
        code: 'configuration',
        message: `${input.source} discovery requires exactly one seed per provider request.`,
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
        message: `Keyword discovery limit must be from 1 to ${MAX_DISCOVERY_ROWS}.`,
      })
    }
    if (!/^[a-z]{2}$/.test(input.languageCode)) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-discovery',
        code: 'configuration',
        message: 'DataForSEO language code must contain two lowercase letters.',
      })
    }
    const locationName = input.locationName?.trim()
    if ((input.locationCode !== undefined) === Boolean(locationName)) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-discovery',
        code: 'configuration',
        message:
          'DataForSEO keyword discovery requires exactly one location code or location name.',
      })
    }

    const location =
      input.locationCode !== undefined
        ? { location_code: input.locationCode }
        : { location_name: locationName }
    const request =
      input.source === 'ideas'
        ? {
            keywords: seeds,
            language_code: input.languageCode,
            ...location,
            include_serp_info: true,
            limit: input.limit,
          }
        : {
            keyword: seeds[0],
            language_code: input.languageCode,
            ...location,
            include_serp_info: true,
            include_seed_keyword: false,
            ...(input.source === 'related' ? { depth: 3 } : {}),
            limit: input.limit,
            order_by: [
              `${input.source === 'related' ? 'keyword_data.' : ''}keyword_info.search_volume,desc`,
            ],
          }
    const snapshot = await this.paidPost({
      operation: `keyword-discovery-${input.source}`,
      capability: 'keyword-discovery',
      endpoint: KEYWORD_DISCOVERY_PATHS[input.source],
      request,
      schema: dataForSeoDiscoveryResponseSchema,
      requestedRows: input.limit,
      price: (account) => account.keywordDiscoveryPrices[input.source],
      context: input.context,
      ttlMs: this.keywordDiscoveryTtlMs,
      refresh: input.refresh,
      rowCount: discoveryRows,
    })
    return {
      ...snapshot,
      providerTotalRows: discoveryTotalRows(snapshot.response),
      nextCursor: discoveryNextCursor(snapshot.response),
    }
  }

  async serpLive(
    input: DataForSeoSerpRequest,
  ): Promise<DataForSeoSerpSnapshot> {
    const { keyword, locationName } = validateSerpInput(input)
    const request = {
      keyword,
      language_code: input.languageCode,
      ...(input.locationCode !== undefined
        ? { location_code: input.locationCode }
        : { location_name: locationName }),
      device: input.device,
      depth: input.depth,
      remove_from_url: ['srsltid'],
    }
    return this.paidPost({
      operation: 'serp-snapshot',
      capability: 'serp-snapshot',
      endpoint: SERP_LIVE_ADVANCED_PATH,
      request,
      schema: dataForSeoSerpResponseSchema,
      requestedRows: input.depth,
      estimatedRequestUnits: Math.ceil(input.depth / 10),
      price: (account) => account.serpLiveAdvancedPrice,
      context: input.context,
      ttlMs: this.serpTtlMs,
      refresh: input.refresh,
      rowCount: serpRows,
    })
  }

  async serpTaskPost(input: {
    tasks: DataForSeoSerpTaskInput[]
    context: ProviderRequestContext
  }): Promise<DataForSeoSerpTaskPostSnapshot> {
    if (
      input.tasks.length < 1 ||
      input.tasks.length > MAX_SERP_TASKS_PER_POST
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'serp-task-post',
        code: 'configuration',
        message: `A queued SERP post requires 1 to ${MAX_SERP_TASKS_PER_POST} tasks.`,
      })
    }
    const requests = input.tasks.map((task) => {
      const validated = validateSerpInput(task)
      return {
        keyword: validated.keyword,
        language_code: task.languageCode,
        ...(task.locationCode !== undefined
          ? { location_code: task.locationCode }
          : { location_name: validated.locationName }),
        device: task.device,
        depth: task.depth,
        tag: task.tag,
        priority: 1,
        remove_from_url: ['srsltid'],
      }
    })
    const credentials = await this.getCredentials('serp-task-post')
    const credentialScope = providerCredentialScope(
      'dataforseo',
      credentials.login,
    )
    const price = (
      await this.pricingForCredentials(credentials, credentialScope)
    ).serpTaskPostPrice
    if (price.perRequestMicros === null || price.perResultMicros === null) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'serp-task-post',
        code: 'invalid-response',
        message:
          'DataForSEO Standard SERP pricing is unavailable, so queued tasks were not posted.',
      })
    }
    const requestUnits = input.tasks.reduce(
      (total, task) => total + Math.ceil(task.depth / 10),
      0,
    )
    const estimatedCostMicros =
      price.perRequestMicros * requestUnits +
      price.perResultMicros * input.tasks.length
    const reservation = reserveProviderSpend(
      {
        provider: 'dataforseo',
        capability: 'serp-snapshot',
        endpoint: SERP_TASK_POST_PATH,
        projectId: input.context.projectId,
        reportId: input.context.reportId,
        reportRunId: input.context.reportRunId,
        requestedRows: input.tasks.length,
        estimatedCostMicros,
      },
      {
        database: this.database,
        limits: this.spendLimits,
        now: this.now().getTime(),
      },
    )
    let response
    try {
      response = await providerRequestJson({
        provider: 'dataforseo',
        operation: 'serp-task-post',
        url: new URL(SERP_TASK_POST_PATH, this.baseUrl),
        fetch: this.fetch,
        maxResponseBytes: this.maxResponseBytes,
        timeoutMs: this.timeoutMs,
        retry: 'never',
        schema: dataForSeoSerpTaskPostResponseSchema,
        init: {
          method: 'POST',
          headers: {
            authorization: this.authorization(credentials),
            'content-type': 'application/json',
          },
          body: JSON.stringify(requests),
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
    const taskReceipts = response.tasks.flatMap((task) =>
      task.id && task.data?.tag
        ? [{ providerTaskId: task.id, tag: task.data.tag }]
        : [],
    )
    const taskIds = taskReceipts.map((receipt) => receipt.providerTaskId)
    const expectedTags = new Set(input.tasks.map((task) => task.tag))
    const returnedTags = new Set(taskReceipts.map((receipt) => receipt.tag))
    const receiptsMatch =
      expectedTags.size === input.tasks.length &&
      returnedTags.size === expectedTags.size &&
      [...expectedTags].every((tag) => returnedTags.has(tag))
    const failedTasks = response.tasks.filter(
      (task) => task.status_code !== 20100 || !task.id || !task.data?.tag,
    )
    const actualCostMicros = responseCostMicros(response)
    const state =
      failedTasks.length === 0 && response.tasks_error === 0
        ? 'succeeded'
        : failedTasks.length < response.tasks.length
          ? 'partial'
          : 'failed'
    const spendNotice = finalizeProviderSpend(
      reservation.id,
      {
        provider: 'dataforseo',
        state,
        actualCostMicros,
        returnedRows: taskIds.length,
        taskIds,
      },
      {
        database: this.database,
        limits: this.spendLimits,
        now: this.now().getTime(),
      },
    )
    if (
      response.status_code !== 20000 ||
      failedTasks.length > 0 ||
      taskIds.length !== input.tasks.length ||
      !receiptsMatch
    ) {
      const statusCode = failedTasks[0]?.status_code ?? response.status_code
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'serp-task-post',
        code: taskErrorCode(statusCode),
        message: `DataForSEO accepted ${taskIds.length} of ${input.tasks.length} queued SERP tasks (${statusCode}).`,
      })
    }
    return {
      taskIds,
      taskReceipts,
      estimatedCostMicros,
      actualCostMicros,
      spendNotice,
      warnings: [],
      observedAt: this.now().toISOString(),
    }
  }

  async serpTasksReady(): Promise<DataForSeoSerpReadyTask[]> {
    const credentials = await this.getCredentials('serp-tasks-ready')
    const response = await providerRequestJson({
      provider: 'dataforseo',
      operation: 'serp-tasks-ready',
      url: new URL(SERP_TASKS_READY_PATH, this.baseUrl),
      fetch: this.fetch,
      maxResponseBytes: this.maxResponseBytes,
      timeoutMs: this.timeoutMs,
      retry: 'safe',
      schema: dataForSeoSerpTasksReadyResponseSchema,
      init: {
        method: 'GET',
        headers: { authorization: this.authorization(credentials) },
      },
    })
    const failedTask = response.tasks.find((task) => task.status_code !== 20000)
    if (response.status_code !== 20000 || failedTask) {
      const statusCode = failedTask?.status_code ?? response.status_code
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'serp-tasks-ready',
        code: taskErrorCode(statusCode),
        message: `DataForSEO could not list ready SERP tasks (${statusCode}).`,
        retryable: statusCode === 40202,
      })
    }
    return response.tasks.flatMap((task) =>
      (task.result ?? []).map((result) => ({
        providerTaskId: result.id,
        tag: result.tag ?? null,
      })),
    )
  }

  async serpTaskGet(providerTaskId: string): Promise<DataForSeoSerpSnapshot> {
    if (!/^[a-zA-Z0-9-]{1,100}$/u.test(providerTaskId)) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'serp-task-get',
        code: 'configuration',
        message: 'Use a valid queued SERP task id.',
      })
    }
    const credentials = await this.getCredentials('serp-task-get')
    const response = await providerRequestJson({
      provider: 'dataforseo',
      operation: 'serp-task-get',
      url: new URL(
        `${SERP_TASK_GET_ADVANCED_PATH}${providerTaskId}`,
        this.baseUrl,
      ),
      fetch: this.fetch,
      maxResponseBytes: this.maxResponseBytes,
      timeoutMs: this.timeoutMs,
      retry: 'safe',
      schema: dataForSeoSerpResponseSchema,
      init: {
        method: 'GET',
        headers: { authorization: this.authorization(credentials) },
      },
    })
    const failedTask = response.tasks.find((task) => task.status_code !== 20000)
    if (response.status_code !== 20000 || failedTask) {
      const statusCode = failedTask?.status_code ?? response.status_code
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'serp-task-get',
        code: taskErrorCode(statusCode),
        message: `DataForSEO could not collect queued SERP task ${providerTaskId} (${statusCode}).`,
        retryable: statusCode === 40202,
      })
    }
    return {
      response,
      observedAt: this.now().toISOString(),
      returnedRows: serpRows(response),
      cache: {
        status: 'bypass',
        storedAt: null,
        expiresAt: null,
      },
      cost: {
        currency: 'USD',
        estimatedMicros: 0,
        actualMicros: responseCostMicros(response) ?? 0,
        taskIds: [providerTaskId],
      },
      spendNotice: null,
      warnings: [],
    }
  }
}
