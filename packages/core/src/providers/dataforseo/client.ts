import { fetch } from 'undici'
import { ProviderError } from '../errors.js'
import { type ProviderFetch, providerRequestJson } from '../transport.js'
import {
  type DataForSeoUserDataResponse,
  dataForSeoUserDataResponseSchema,
} from './account-schema.js'
import type { DataForSeoCredentials } from './credentials.js'
import { readDataForSeoCredentials } from './credentials.js'

const DEFAULT_BASE_URL = 'https://api.dataforseo.com/'
const USER_DATA_PATH = 'v3/appendix/user_data'
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_USER_DATA_RESPONSE_BYTES = 5 * 1024 * 1024

export type DataForSeoAccountSnapshot = {
  provider: 'dataforseo'
  login: string
  timezone: string | null
  balanceMicros: number | null
  depositedMicros: number | null
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
}

function usdToMicros(value: number | undefined): number | null {
  if (value === undefined) return null
  return Math.round(value * 1_000_000)
}

function taskErrorCode(
  statusCode: number,
): 'authentication' | 'rate-limit' | 'remote-error' {
  if (statusCode >= 40100 && statusCode < 40200) return 'authentication'
  if (statusCode === 40202) return 'rate-limit'
  return 'remote-error'
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

  constructor(options: DataForSeoClientOptions = {}) {
    this.fetch = options.fetch ?? fetch
    this.credentials = options.credentials ?? readDataForSeoCredentials
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxResponseBytes =
      options.maxResponseBytes ?? MAX_USER_DATA_RESPONSE_BYTES
    this.now = options.now ?? (() => new Date())
  }

  private async authorization(): Promise<string> {
    const credentials = await this.credentials()
    if (!credentials) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'account-status',
        code: 'configuration',
        message:
          'DataForSEO is not connected. Run `seo providers dataforseo connect`, or set SEO_DATAFORSEO_LOGIN and SEO_DATAFORSEO_PASSWORD.',
      })
    }
    return `Basic ${Buffer.from(
      `${credentials.login}:${credentials.password}`,
    ).toString('base64')}`
  }

  async userData(): Promise<DataForSeoAccountSnapshot> {
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
          headers: { authorization: await this.authorization() },
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
}
