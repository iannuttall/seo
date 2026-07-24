import { fetch } from 'undici'
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
import { ProviderError, type ProviderErrorCode } from '../errors.js'
import { type ProviderFetch, providerRequestText } from '../transport.js'
import { readSemrushApiKey } from './credentials.js'
import {
  parseSemrushCsv,
  type SemrushCsvTable,
  semrushCsvTableSchema,
} from './csv.js'
import type { SemrushColumn } from './mapping.js'

const API_BASE_URL = 'https://api.semrush.com/'
const API_UNIT_BALANCE_URL = 'https://www.semrush.com/users/countapiunits.html'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_BALANCE_RESPONSE_BYTES = 1_024
const MAX_REPORT_RESPONSE_BYTES = 5 * 1024 * 1024
const DEFAULT_REPORT_TTL_MS = 7 * 24 * 60 * 60 * 1_000
const PARAMETER_NAME = /^[a-z][a-z0-9_]*$/u
const RESERVED_PARAMETERS = new Set([
  'export_columns',
  'export_decode',
  'export_escape',
  'key',
  'type',
])

export type SemrushBalance = {
  remainingUnits: number
  observedAt: string
}

export type SemrushReportRequest = {
  operation: string
  reportType: string
  parameters: Record<string, string | number>
  columns: readonly SemrushColumn[]
  maximumResponseRows: number
  unitsPerLine: number
  ttlMs?: number
  refresh?: boolean
}

export type SemrushReportSnapshot = {
  table: SemrushCsvTable
  observedAt: string
  returnedRows: number
  cache: ProviderCacheEvidence
  cost: ProviderCostEvidence
  warnings: ProviderWarning[]
}

export type SemrushClientOptions = {
  apiKey?: string
  credentials?: () => string | undefined | Promise<string | undefined>
  fetch?: ProviderFetch
  baseUrl?: string
  balanceUrl?: string
  timeoutMs?: number
  maxReportResponseBytes?: number
  now?: () => Date
  database?: Database.Database
  reportTtlMs?: number
}

function providerError(input: {
  operation: string
  code: ProviderErrorCode
  message: string
  status?: number
  retryable?: boolean
}): ProviderError {
  return new ProviderError({
    provider: 'semrush',
    ...input,
  })
}

function redactedError(error: unknown, operation: string): ProviderError {
  if (error instanceof ProviderError) {
    if (operation === 'api-unit-balance' && error.status === 400) {
      return providerError({
        operation,
        code: 'authentication',
        message:
          'Semrush rejected this key. Use the permanent Version 3 API Key; Version 4 keys are not supported.',
        status: error.status,
      })
    }
    return providerError({
      operation,
      code: error.code,
      message: error.message,
      ...(error.status === null ? {} : { status: error.status }),
      retryable: error.retryable,
    })
  }
  return providerError({
    operation,
    code: 'remote-error',
    message: 'Semrush request failed before a valid response arrived.',
    retryable: true,
  })
}

function responseErrorCode(text: string): number | null {
  const match =
    /^\s*ERROR\s*::\s*(\d+)\s*::/iu.exec(text) ??
    /^\s*ERROR\s+(\d+)\s*::/iu.exec(text)
  return match?.[1] ? Number(match[1]) : null
}

function semrushResponseError(code: number, operation: string): ProviderError {
  if ([110, 120, 130].includes(code)) {
    return providerError({
      operation,
      code: 'authentication',
      message: 'Semrush rejected the configured API key or API access.',
    })
  }
  if ([131, 134, 429].includes(code)) {
    return providerError({
      operation,
      code: 'rate-limit',
      message: 'Semrush rate limited the request.',
      retryable: true,
    })
  }
  if (code === 132) {
    return providerError({
      operation,
      code: 'budget-limit',
      message: 'Semrush has no API units remaining for this request.',
    })
  }
  if (
    (code >= 40 && code <= 48) ||
    [133, 135, 402, 605, 613].includes(code) ||
    code >= 10_000
  ) {
    return providerError({
      operation,
      code: 'configuration',
      message: `Semrush rejected the report parameters (error ${code}).`,
    })
  }
  return providerError({
    operation,
    code: 'remote-error',
    message: `Semrush could not complete the report (error ${code}).`,
  })
}

function validateReport(input: SemrushReportRequest): void {
  if (
    !/^[a-z][a-z0-9-]{1,63}$/u.test(input.operation) ||
    !/^[a-z][a-z0-9_]{1,63}$/u.test(input.reportType) ||
    input.columns.length < 1 ||
    new Set(input.columns).size !== input.columns.length ||
    !Number.isSafeInteger(input.maximumResponseRows) ||
    input.maximumResponseRows < 1 ||
    input.maximumResponseRows > 1_000 ||
    !Number.isSafeInteger(input.unitsPerLine) ||
    input.unitsPerLine < 1 ||
    input.unitsPerLine > 1_000
  ) {
    throw providerError({
      operation: input.operation || 'report',
      code: 'configuration',
      message: 'Semrush received an invalid bounded report request.',
    })
  }
  for (const [name, value] of Object.entries(input.parameters)) {
    if (
      !PARAMETER_NAME.test(name) ||
      RESERVED_PARAMETERS.has(name) ||
      (typeof value === 'string' &&
        (value.length > 10_000 || value.includes('\0'))) ||
      (typeof value === 'number' && !Number.isSafeInteger(value))
    ) {
      throw providerError({
        operation: input.operation,
        code: 'configuration',
        message: 'Semrush received an invalid report parameter.',
      })
    }
  }
}

export class SemrushClient {
  private readonly apiKey?: string
  private readonly credentials: SemrushClientOptions['credentials']
  private readonly fetch: ProviderFetch
  private readonly baseUrl: string
  private readonly balanceUrl: string
  private readonly timeoutMs: number
  private readonly maxReportResponseBytes: number
  private readonly now: () => Date
  private readonly database: Database.Database | undefined
  private readonly reportTtlMs: number

  constructor(options: SemrushClientOptions = {}) {
    this.apiKey = options.apiKey?.trim()
    this.credentials = options.credentials
    this.fetch = options.fetch ?? fetch
    this.baseUrl = options.baseUrl ?? API_BASE_URL
    this.balanceUrl = options.balanceUrl ?? API_UNIT_BALANCE_URL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxReportResponseBytes =
      options.maxReportResponseBytes ?? MAX_REPORT_RESPONSE_BYTES
    this.now = options.now ?? (() => new Date())
    this.database = options.database
    this.reportTtlMs = options.reportTtlMs ?? DEFAULT_REPORT_TTL_MS
  }

  private async getApiKey(operation: string): Promise<string> {
    const apiKey =
      this.apiKey ??
      (await this.credentials?.()) ??
      (await readSemrushApiKey())?.apiKey
    if (!apiKey?.trim() || apiKey.trim().length > 4_096) {
      throw providerError({
        operation,
        code: 'configuration',
        message:
          'Semrush is not connected. Run `seo providers semrush connect`, or set SEO_SEMRUSH_API_KEY for this process.',
      })
    }
    return apiKey.trim()
  }

  private async balanceForKey(apiKey: string): Promise<SemrushBalance> {
    const url = new URL(this.balanceUrl)
    url.searchParams.set('key', apiKey)
    let text: string
    try {
      text = await providerRequestText({
        provider: 'semrush',
        operation: 'api-unit-balance',
        url,
        fetch: this.fetch,
        maxResponseBytes: MAX_BALANCE_RESPONSE_BYTES,
        timeoutMs: this.timeoutMs,
        retry: 'safe',
      })
    } catch (error) {
      throw redactedError(error, 'api-unit-balance')
    }

    const errorCode = responseErrorCode(text)
    if (errorCode !== null) {
      throw semrushResponseError(errorCode, 'api-unit-balance')
    }
    const normalized = text.trim().replaceAll(',', '')
    const remainingUnits = Number(normalized)
    if (
      !/^\d+$/u.test(normalized) ||
      !Number.isSafeInteger(remainingUnits) ||
      remainingUnits < 0
    ) {
      throw providerError({
        operation: 'api-unit-balance',
        code: 'invalid-response',
        message: 'Semrush returned an invalid API unit balance.',
      })
    }
    return {
      remainingUnits,
      observedAt: this.now().toISOString(),
    }
  }

  async apiUnitBalance(): Promise<SemrushBalance> {
    return this.balanceForKey(await this.getApiKey('api-unit-balance'))
  }

  async report(input: SemrushReportRequest): Promise<SemrushReportSnapshot> {
    validateReport(input)
    const apiKey = await this.getApiKey(input.operation)
    const credentialScope = providerCredentialScope('semrush', apiKey)
    const cacheRequest = {
      reportType: input.reportType,
      parameters: input.parameters,
      columns: input.columns,
      maximumResponseRows: input.maximumResponseRows,
      unitsPerLine: input.unitsPerLine,
    }
    const cacheKey = {
      provider: 'semrush' as const,
      credentialScope,
      operation: input.operation,
      request: cacheRequest,
    }
    const cached = input.refresh
      ? null
      : readProviderCache(cacheKey, semrushCsvTableSchema, {
          database: this.database,
          now: this.now().getTime(),
        })
    if (cached) {
      return {
        table: cached.data,
        observedAt: cached.storedAt,
        returnedRows: cached.rowCount ?? cached.data.rows.length,
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
        warnings: [],
      }
    }

    const estimatedUnits = input.maximumResponseRows * input.unitsPerLine
    const balance = await this.balanceForKey(apiKey)
    if (balance.remainingUnits < estimatedUnits) {
      throw providerError({
        operation: input.operation,
        code: 'budget-limit',
        message: `Semrush needs up to ${estimatedUnits} API units for this bounded report, but ${balance.remainingUnits} remain.`,
      })
    }

    const url = new URL(this.baseUrl)
    url.searchParams.set('type', input.reportType)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('export_columns', input.columns.join(','))
    url.searchParams.set('export_escape', '1')
    url.searchParams.set('export_decode', '1')
    for (const [name, value] of Object.entries(input.parameters)) {
      url.searchParams.set(name, String(value))
    }

    let text: string
    try {
      text = await providerRequestText({
        provider: 'semrush',
        operation: input.operation,
        url,
        fetch: this.fetch,
        maxResponseBytes: this.maxReportResponseBytes,
        timeoutMs: this.timeoutMs,
        retry: 'never',
      })
    } catch (error) {
      throw redactedError(error, input.operation)
    }

    const errorCode = responseErrorCode(text)
    const table =
      errorCode === 50
        ? { headers: [...input.columns], rows: [] }
        : (() => {
            if (errorCode !== null) {
              throw semrushResponseError(errorCode, input.operation)
            }
            return parseSemrushCsv(text, input.maximumResponseRows)
          })()
    const returnedRows = table.rows.length
    const stored = writeProviderCache(
      cacheKey,
      {
        data: table,
        ttlMs: input.ttlMs ?? this.reportTtlMs,
        rowCount: returnedRows,
        sourceCostMicros: null,
        taskIds: [],
      },
      { database: this.database, now: this.now().getTime() },
    )
    return {
      table,
      observedAt: stored.storedAt,
      returnedRows,
      cache: {
        status: 'miss',
        storedAt: stored.storedAt,
        expiresAt: stored.expiresAt,
      },
      cost: {
        currency: 'USD',
        estimatedMicros: null,
        actualMicros: null,
        taskIds: [],
        native: {
          unit: 'api-unit',
          estimatedUnits,
          actualUnits: returnedRows * input.unitsPerLine,
          remainingBefore: balance.remainingUnits,
        },
      },
      warnings: [
        {
          code: 'provider-cost-not-denominated-usd',
          field: 'cost',
          message:
            'Semrush bills this report in API units; no USD conversion was inferred.',
        },
      ],
    }
  }
}
