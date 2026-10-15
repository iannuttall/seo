import { fetch } from 'undici'
import { ProviderError } from '../errors.js'
import { type ProviderFetch, providerRequestJson } from '../transport.js'
import {
  type DataForSeoUserDataResponse,
  dataForSeoUserDataResponseSchema,
} from './account-schema.js'
import type {
  DataForSeoAccountSnapshot,
  DataForSeoClientOptions,
} from './client-types.js'
import type { DataForSeoCredentials } from './credentials.js'
import { readDataForSeoCredentials } from './credentials.js'
import { dataForSeoTaskErrorCode, dataForSeoUsdToMicros } from './response.js'

const DEFAULT_BASE_URL = 'https://api.dataforseo.com/'
const USER_DATA_PATH = 'v3/appendix/user_data'
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_USER_DATA_RESPONSE_BYTES = 5 * 1024 * 1024

export type {
  DataForSeoAccountSnapshot,
  DataForSeoClientOptions,
} from './client-types.js'

// The free DataForSEO account endpoint, used to check a saved login. Keyword
// and backlink data come from `seo research`, which calls DataForSEO itself.
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
        code: dataForSeoTaskErrorCode(statusCode),
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
      balanceMicros: dataForSeoUsdToMicros(account.money?.balance),
      depositedMicros: dataForSeoUsdToMicros(account.money?.total),
      apiVersion: response.version ?? null,
      requestCostMicros: dataForSeoUsdToMicros(response.cost) ?? 0,
      taskIds: response.tasks.flatMap((task) => (task.id ? [task.id] : [])),
      observedAt: this.now().toISOString(),
    }
  }

  async userData(): Promise<DataForSeoAccountSnapshot> {
    return this.userDataForCredentials(
      await this.getCredentials('account-status'),
    )
  }
}
