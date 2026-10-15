import { fetch } from 'undici'
import { ProviderError } from '../errors.js'
import { type ProviderFetch, providerRequestJson } from '../transport.js'
import { readAhrefsApiKey } from './credentials.js'
import { ahrefsLimitsAndUsageResponseSchema } from './schema.js'

const DEFAULT_BASE_URL = 'https://api.ahrefs.com/v3/'
const LIMITS_AND_USAGE_PATH = 'subscription-info/limits-and-usage'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_ACCOUNT_RESPONSE_BYTES = 64 * 1_024

export type AhrefsLimitsAndUsage = {
  provider: 'ahrefs'
  apiVersion: 3
  subscription: string
  apiKeyExpiresAt: string
  usageResetsAt: string
  apiKeyUnits: {
    limit: number | null
    used: number
    remaining: number | null
  }
  workspaceUnits: {
    limit: number | null
    used: number | null
    remaining: number | null
  }
  observedAt: string
  requestCostUnits: 0
}

export type AhrefsClientOptions = {
  apiKey?: string
  credentials?: () => string | undefined | Promise<string | undefined>
  fetch?: ProviderFetch
  baseUrl?: string
  timeoutMs?: number
  now?: () => Date
}

function remaining(limit: number | null, used: number | null): number | null {
  if (limit === null || used === null) return null
  return Math.max(0, limit - used)
}

// The free Ahrefs limits endpoint, used to check a saved key. Keyword and
// backlink data come from `seo research`, which calls Ahrefs itself.
export class AhrefsClient {
  private readonly apiKey?: string
  private readonly credentials: AhrefsClientOptions['credentials']
  private readonly fetch: ProviderFetch
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly now: () => Date

  constructor(options: AhrefsClientOptions = {}) {
    this.apiKey = options.apiKey?.trim()
    this.credentials = options.credentials
    this.fetch = options.fetch ?? fetch
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.now = options.now ?? (() => new Date())
  }

  private async getApiKey(operation: string): Promise<string> {
    const apiKey =
      this.apiKey ??
      (await this.credentials?.()) ??
      (await readAhrefsApiKey())?.apiKey
    if (!apiKey?.trim() || apiKey.trim().length > 4_096) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation,
        code: 'configuration',
        message:
          'Ahrefs is not connected. Run `seo providers ahrefs connect`, or set SEO_AHREFS_API_KEY for this process.',
      })
    }
    return apiKey.trim()
  }

  private async limitsAndUsageForKey(
    apiKey: string,
  ): Promise<AhrefsLimitsAndUsage> {
    const operation = 'limits-and-usage'
    const response = await providerRequestJson({
      provider: 'ahrefs',
      operation,
      url: new URL(LIMITS_AND_USAGE_PATH, this.baseUrl),
      fetch: this.fetch,
      maxResponseBytes: MAX_ACCOUNT_RESPONSE_BYTES,
      timeoutMs: this.timeoutMs,
      retry: 'safe',
      schema: ahrefsLimitsAndUsageResponseSchema,
      init: {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
      },
    }).catch((error) => {
      if (error instanceof ProviderError && error.code === 'authentication') {
        throw new ProviderError({
          provider: 'ahrefs',
          operation,
          code: 'authentication',
          status: error.status ?? undefined,
          message:
            'Ahrefs rejected the API v3 key. Create or copy a key from Ahrefs Account settings, then connect again.',
          cause: error,
        })
      }
      throw error
    })

    const usage = response.limits_and_usage
    return {
      provider: 'ahrefs',
      apiVersion: 3,
      subscription: usage.subscription,
      apiKeyExpiresAt: usage.api_key_expiration_date,
      usageResetsAt: usage.usage_reset_date,
      apiKeyUnits: {
        limit: usage.units_limit_api_key,
        used: usage.units_usage_api_key,
        remaining: remaining(
          usage.units_limit_api_key,
          usage.units_usage_api_key,
        ),
      },
      workspaceUnits: {
        limit: usage.units_limit_workspace,
        used: usage.units_usage_workspace,
        remaining: remaining(
          usage.units_limit_workspace,
          usage.units_usage_workspace,
        ),
      },
      observedAt: this.now().toISOString(),
      requestCostUnits: 0,
    }
  }

  async limitsAndUsage(): Promise<AhrefsLimitsAndUsage> {
    return this.limitsAndUsageForKey(await this.getApiKey('limits-and-usage'))
  }
}
