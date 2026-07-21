import { fetch } from 'undici'
import { readConfig } from '../storage/config.js'
import type {
  KeywordDataProvider,
  KeywordOverview,
  ProviderOpts,
  ProviderResult,
} from '../types.js'
import { ProviderError } from './errors.js'
import {
  dataForSeoKeywordOverviewResponseSchema,
  firstKeywordOverviewItem,
  optionalResultCount,
} from './dataforseo/schema.js'
import { type ProviderFetch, providerRequestJson } from './transport.js'

const ENDPOINT =
  'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live'
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 20_000

type DataForSeoProviderOptions = {
  fetch?: ProviderFetch
  credentials?: () => { login: string; password: string } | undefined
  timeoutMs?: number
  maxResponseBytes?: number
}

export class DataForSeoProvider implements KeywordDataProvider {
  readonly name = 'dataforseo'
  readonly capabilities = {
    overview: true,
  }

  private readonly fetch: ProviderFetch
  private readonly credentials: () =>
    | { login: string; password: string }
    | undefined
  private readonly timeoutMs: number
  private readonly maxResponseBytes: number

  constructor(options: DataForSeoProviderOptions = {}) {
    this.fetch = options.fetch ?? fetch
    this.credentials =
      options.credentials ??
      (() => {
        const config = readConfig()
        const login = config.providers.dataForSeoLogin
        const password = config.providers.dataForSeoPassword
        return login && password ? { login, password } : undefined
      })
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES
  }

  private getAuthHeader(): string {
    const credentials = this.credentials()
    if (!credentials) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'configuration',
        message: 'DataForSEO credentials are not configured.',
      })
    }
    return `Basic ${Buffer.from(
      `${credentials.login}:${credentials.password}`,
    ).toString('base64')}`
  }

  async keywordOverview(
    phrase: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordOverview>> {
    const json = await providerRequestJson({
      provider: 'dataforseo',
      operation: 'keyword-metrics',
      url: ENDPOINT,
      fetch: this.fetch,
      maxResponseBytes: this.maxResponseBytes,
      timeoutMs: this.timeoutMs,
      retry: 'never',
      schema: dataForSeoKeywordOverviewResponseSchema,
      init: {
        method: 'POST',
        headers: {
          authorization: this.getAuthHeader(),
          'content-type': 'application/json',
        },
        body: JSON.stringify([
          {
            keywords: [phrase],
            language_code: 'en',
            location_code: 2840,
          },
        ]),
      },
    })

    const failedTask = json.tasks.find((task) => task.status_code !== 20000)
    if (json.status_code !== 20000 || json.tasks_error > 0 || failedTask) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'remote-error',
        message: `DataForSEO could not complete the keyword metrics task (${failedTask?.status_code ?? json.status_code}).`,
      })
    }

    const row = firstKeywordOverviewItem(json)
    const keywordInfo = row?.keyword_info
    return {
      data: {
        phrase: row?.keyword ?? phrase,
        volume: keywordInfo?.search_volume ?? undefined,
        competition: keywordInfo?.competition ?? undefined,
        cpc: keywordInfo?.cpc ?? undefined,
        difficulty: row?.keyword_properties?.keyword_difficulty ?? undefined,
        intent: row?.search_intent_info?.main_intent ?? undefined,
        results: optionalResultCount(row?.serp_info?.se_results_count),
      },
      usage: {
        provider: 'DataForSEO',
        units: 1,
        unitLabel: 'tasks',
        estimatedUsd: json.cost,
        calls: 1,
      },
      warnings: opts.database
        ? ['DataForSEO overview currently ignores the database option.']
        : row
          ? undefined
          : ['DataForSEO returned no keyword item for the requested phrase.'],
    }
  }
}
