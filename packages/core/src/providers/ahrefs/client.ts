import { randomUUID } from 'node:crypto'
import { fetch } from 'undici'
import type { ZodType } from 'zod'
import type Database from '../../storage/sqlite.js'
import {
  providerCredentialScope,
  readProviderCache,
  writeProviderCache,
} from '../cache.js'
import type {
  ProviderCacheEvidence,
  ProviderCapability,
  ProviderCostEvidence,
  ProviderRequestContext,
  ProviderWarning,
} from '../contracts.js'
import {
  getProviderSpendLimits,
  type ProviderSpendLimits,
} from '../cost-limits.js'
import { ProviderError } from '../errors.js'
import { type ProviderFetch, providerRequestJson } from '../transport.js'
import { readAhrefsApiKey } from './credentials.js'
import { ahrefsLimitsAndUsageResponseSchema } from './schema.js'

const DEFAULT_BASE_URL = 'https://api.ahrefs.com/v3/'
const LIMITS_AND_USAGE_PATH = 'subscription-info/limits-and-usage'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_ACCOUNT_RESPONSE_BYTES = 64 * 1_024
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1_024 * 1_024
const DEFAULT_RESPONSE_TTL_MS = 7 * 24 * 60 * 60 * 1_000
const MAX_REQUEST_ROWS = 1_000
const MAX_ESTIMATED_UNITS_PER_REQUEST = 25_000
const MAX_ESTIMATED_UNITS_PER_REPORT = 50_000
const QUERY_NAME = /^[a-z][a-z0-9_]*$/u

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
  maxResponseBytes?: number
  now?: () => Date
  database?: Database.Database
  responseTtlMs?: number
  spendLimits?: ProviderSpendLimits
}

type AhrefsQueryValue = string | number | boolean

export type AhrefsApiRequest<T> = {
  operation: string
  capability: ProviderCapability
  path: string
  query: Record<string, AhrefsQueryValue>
  schema: ZodType<T>
  requestedRows: number
  perRowUnits: number
  rowCount: (response: T) => number
  free?: boolean
  refresh?: boolean
  ttlMs?: number
  context?: ProviderRequestContext
}

export type AhrefsApiSnapshot<T> = {
  response: T
  observedAt: string
  returnedRows: number
  cache: ProviderCacheEvidence
  cost: ProviderCostEvidence
  providerCache: 'hit' | 'miss' | 'no_cache' | null
  warnings: ProviderWarning[]
}

type AhrefsResponseMetadata = {
  rows: number
  costPerRow: number
  expectedUnits: number
  actualUnits: number
  cache: 'hit' | 'miss' | 'no_cache'
}

type AhrefsReportUsage = {
  requests: number
  rows: number
  estimatedUnits: number
}

function remaining(limit: number | null, used: number | null): number | null {
  if (limit === null || used === null) return null
  return Math.max(0, limit - used)
}

export class AhrefsClient {
  private readonly apiKey?: string
  private readonly credentials: AhrefsClientOptions['credentials']
  private readonly fetch: ProviderFetch
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxResponseBytes: number
  private readonly now: () => Date
  private readonly database: Database.Database | undefined
  private readonly responseTtlMs: number
  private readonly spendLimits: ProviderSpendLimits
  private readonly reportUsage = new Map<string, AhrefsReportUsage>()

  constructor(options: AhrefsClientOptions = {}) {
    this.apiKey = options.apiKey?.trim()
    this.credentials = options.credentials
    this.fetch = options.fetch ?? fetch
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
    this.now = options.now ?? (() => new Date())
    this.database = options.database
    this.responseTtlMs = options.responseTtlMs ?? DEFAULT_RESPONSE_TTL_MS
    this.spendLimits = options.spendLimits ?? getProviderSpendLimits('ahrefs')
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

  private validateApiRequest<T>(input: AhrefsApiRequest<T>): void {
    const path = input.path.trim()
    if (
      !/^[a-z][a-z0-9/-]{1,127}$/u.test(path) ||
      path.includes('//') ||
      !/^[a-z][a-z0-9-]{1,63}$/u.test(input.operation) ||
      !Number.isSafeInteger(input.requestedRows) ||
      input.requestedRows < 1 ||
      input.requestedRows > MAX_REQUEST_ROWS ||
      !Number.isSafeInteger(input.perRowUnits) ||
      input.perRowUnits < 0 ||
      input.perRowUnits > 1_000
    ) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation: input.operation || 'request',
        code: 'configuration',
        message: 'Ahrefs received an invalid bounded API request.',
      })
    }
    for (const [name, value] of Object.entries(input.query)) {
      if (
        !QUERY_NAME.test(name) ||
        name === 'output' ||
        (typeof value === 'string' &&
          (value.length > 20_000 || value.includes('\0'))) ||
        (typeof value === 'number' &&
          (!Number.isSafeInteger(value) || value < 0))
      ) {
        throw new ProviderError({
          provider: 'ahrefs',
          operation: input.operation,
          code: 'configuration',
          message: 'Ahrefs received an invalid API query parameter.',
        })
      }
    }
  }

  private reserveReportUsage<T>(
    input: AhrefsApiRequest<T>,
    estimatedUnits: number,
  ): void {
    const context = input.context ?? {
      reportId: input.operation,
      reportRunId: randomUUID(),
    }
    const current = this.reportUsage.get(context.reportRunId) ?? {
      requests: 0,
      rows: 0,
      estimatedUnits: 0,
    }
    const next = {
      requests: current.requests + 1,
      rows: current.rows + input.requestedRows,
      estimatedUnits: current.estimatedUnits + estimatedUnits,
    }
    if (next.requests > this.spendLimits.maxRequestsPerReport) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation: input.operation,
        code: 'budget-limit',
        message: `Ahrefs is limited to ${this.spendLimits.maxRequestsPerReport} requests in one report run.`,
      })
    }
    if (next.rows > this.spendLimits.maxRowsPerReport) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation: input.operation,
        code: 'budget-limit',
        message: `Ahrefs is limited to ${this.spendLimits.maxRowsPerReport.toLocaleString('en-US')} requested rows in one report run.`,
      })
    }
    if (
      estimatedUnits > MAX_ESTIMATED_UNITS_PER_REQUEST ||
      next.estimatedUnits > MAX_ESTIMATED_UNITS_PER_REPORT
    ) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation: input.operation,
        code: 'budget-limit',
        message: `Ahrefs would reserve ${estimatedUnits.toLocaleString('en-US')} API units for this request and ${next.estimatedUnits.toLocaleString('en-US')} for the report. Reduce the row limit or selected work.`,
      })
    }
    this.reportUsage.set(context.reportRunId, next)
  }

  private requestUrl<T>(input: AhrefsApiRequest<T>): URL {
    const url = new URL(input.path, this.baseUrl)
    for (const [name, value] of Object.entries(input.query)) {
      url.searchParams.set(name, String(value))
    }
    return url
  }

  private responseMetadata(
    headers: Headers,
    operation: string,
    free: boolean,
  ): AhrefsResponseMetadata | null {
    const integer = (name: string): number | null => {
      const raw = headers.get(name)
      if (raw === null) return null
      const value = Number(raw)
      return Number.isSafeInteger(value) && value >= 0 ? value : null
    }
    const rows = integer('x-api-rows')
    const costPerRow = integer('x-api-units-cost-row')
    const expectedUnits = integer('x-api-units-cost-total')
    const actualUnits = integer('x-api-units-cost-total-actual')
    const cache = headers.get('x-api-cache')
    if (
      rows === null ||
      costPerRow === null ||
      expectedUnits === null ||
      actualUnits === null ||
      !cache ||
      !['hit', 'miss', 'no_cache'].includes(cache)
    ) {
      if (free) return null
      throw new ProviderError({
        provider: 'ahrefs',
        operation,
        code: 'invalid-response',
        message:
          'Ahrefs returned research data without complete API-unit headers.',
      })
    }
    return {
      rows,
      costPerRow,
      expectedUnits,
      actualUnits,
      cache: cache as AhrefsResponseMetadata['cache'],
    }
  }

  async request<T>(input: AhrefsApiRequest<T>): Promise<AhrefsApiSnapshot<T>> {
    this.validateApiRequest(input)
    const apiKey = await this.getApiKey(input.operation)
    const credentialScope = providerCredentialScope('ahrefs', apiKey)
    const cacheKey = {
      provider: 'ahrefs' as const,
      credentialScope,
      operation: input.operation,
      request: {
        path: input.path,
        query: input.query,
      },
    }
    const cached = input.refresh
      ? null
      : readProviderCache(cacheKey, input.schema, {
          database: this.database,
          now: this.now().getTime(),
        })
    if (cached) {
      return {
        response: cached.data,
        observedAt: cached.storedAt,
        returnedRows: cached.rowCount ?? input.rowCount(cached.data),
        cache: {
          status: 'hit',
          storedAt: cached.storedAt,
          expiresAt: cached.expiresAt,
        },
        cost: {
          currency: 'USD',
          estimatedMicros: 0,
          actualMicros: 0,
          taskIds: [],
          native: {
            unit: 'api-unit',
            estimatedUnits: 0,
            actualUnits: 0,
            remainingBefore: null,
          },
        },
        providerCache: null,
        warnings: [],
      }
    }

    const preflightEstimate = input.free
      ? 0
      : Math.max(50, input.perRowUnits * input.requestedRows)
    this.reserveReportUsage(input, preflightEstimate)
    const account = input.free
      ? undefined
      : await this.limitsAndUsageForKey(apiKey)
    const finiteRemaining = account
      ? [
          account.apiKeyUnits.remaining,
          account.workspaceUnits.remaining,
        ].filter((value): value is number => value !== null)
      : []
    const remainingBefore =
      finiteRemaining.length > 0 ? Math.min(...finiteRemaining) : null
    if (
      !input.free &&
      remainingBefore !== null &&
      remainingBefore < preflightEstimate
    ) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation: input.operation,
        code: 'budget-limit',
        message: `Ahrefs has ${remainingBefore.toLocaleString('en-US')} API units available, but this bounded request could use up to ${preflightEstimate.toLocaleString('en-US')}.`,
      })
    }

    let responseHeaders: Headers | undefined
    let response: T
    try {
      response = await providerRequestJson({
        provider: 'ahrefs',
        operation: input.operation,
        url: this.requestUrl(input),
        fetch: this.fetch,
        maxResponseBytes: this.maxResponseBytes,
        timeoutMs: this.timeoutMs,
        retry: input.free ? 'safe' : 'never',
        schema: input.schema,
        onResponse: (providerResponse) => {
          responseHeaders = providerResponse.headers
        },
        init: {
          method: 'GET',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
        },
      })
    } catch (error) {
      if (error instanceof ProviderError && error.status === 400) {
        throw new ProviderError({
          provider: 'ahrefs',
          operation: input.operation,
          code: 'configuration',
          status: error.status,
          message:
            'Ahrefs rejected the requested target or research parameters.',
          cause: error,
        })
      }
      if (error instanceof ProviderError && error.status === 403) {
        throw new ProviderError({
          provider: 'ahrefs',
          operation: input.operation,
          code: 'configuration',
          status: error.status,
          message:
            'The Ahrefs key is valid, but its subscription cannot run this research endpoint.',
          cause: error,
        })
      }
      throw error
    }

    const returnedRows = input.rowCount(response)
    if (
      !Number.isSafeInteger(returnedRows) ||
      returnedRows < 0 ||
      returnedRows > MAX_REQUEST_ROWS
    ) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation: input.operation,
        code: 'invalid-response',
        message: 'Ahrefs returned an invalid number of research rows.',
      })
    }
    const metadata = responseHeaders
      ? this.responseMetadata(
          responseHeaders,
          input.operation,
          Boolean(input.free),
        )
      : null
    if (!metadata && !input.free) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation: input.operation,
        code: 'invalid-response',
        message:
          'Ahrefs returned research data without complete API-unit headers.',
      })
    }

    const warnings: ProviderWarning[] = []
    if (metadata && metadata.rows !== returnedRows) {
      warnings.push({
        code: 'ahrefs-header-row-count-mismatch',
        field: 'coverage.returnedRows',
        message: `Ahrefs reported ${metadata.rows} API rows but the validated response contained ${returnedRows}.`,
      })
    }
    if (metadata?.cache === 'hit') {
      warnings.push({
        code: 'ahrefs-provider-cache-hit',
        message:
          'Ahrefs served this request from its cache and reported the actual API-unit charge separately.',
      })
    }
    try {
      writeProviderCache(
        cacheKey,
        {
          data: response,
          ttlMs: input.ttlMs ?? this.responseTtlMs,
          rowCount: returnedRows,
          sourceCostMicros: null,
          taskIds: [],
        },
        { database: this.database, now: this.now().getTime() },
      )
    } catch {
      warnings.push({
        code: 'cache-write-failed',
        message:
          'The Ahrefs result is valid, but it could not be saved to the local cache.',
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
        estimatedMicros: null,
        actualMicros: null,
        taskIds: [],
        native: {
          unit: 'api-unit',
          estimatedUnits: input.free
            ? 0
            : (metadata?.expectedUnits ?? preflightEstimate),
          actualUnits: input.free ? 0 : (metadata?.actualUnits ?? null),
          remainingBefore,
        },
      },
      providerCache: metadata?.cache ?? null,
      warnings,
    }
  }
}
