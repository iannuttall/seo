import { fetch } from 'undici'
import { z } from 'zod'
import {
  providerCredentialScope,
  readProviderCache,
  writeProviderCache,
} from '../providers/cache.js'
import { ProviderError } from '../providers/errors.js'
import {
  type ProviderFetch,
  providerRequestJson,
} from '../providers/transport.js'
import { normalizeClickySiteId, readClickySiteKey } from './credentials.js'

const CLICKY_ENDPOINT = 'https://api.clicky.com/api/stats/4'
const CLICKY_MAX_RESPONSE_BYTES = 10 * 1024 * 1024
const CLICKY_TIMEOUT_MS = 15_000
const CLICKY_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CLICKY_PAGE_LIMIT = 1_000
const CLICKY_MAX_RETAINED_ROWS = 5_000

const clickyItemSchema = z
  .object({
    value: z.union([z.string().max(128), z.number()]).optional(),
    value_percent: z.union([z.string().max(128), z.number()]).optional(),
    title: z.string().max(4_096).optional(),
    url: z.string().max(4_096).optional(),
    stats_url: z.string().max(4_096).optional(),
  })
  .passthrough()

const clickyResponseSchema = z.array(
  z
    .object({
      type: z.string().max(64).optional(),
      error: z.string().max(2_000).optional(),
      dates: z
        .array(
          z
            .object({
              date: z.string().max(64).optional(),
              items: z.array(clickyItemSchema).optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough(),
)

export type ClickyItem = z.infer<typeof clickyItemSchema>
export type ClickyResponse = z.infer<typeof clickyResponseSchema>

type ClickyClientOptions = {
  siteId: string
  siteKey?: string
  fetch?: ProviderFetch
}

export type ClickyReportInput = {
  type: string
  startDate?: string
  endDate?: string
  limit?: number
  page?: number
  refresh?: boolean
}

export type ClickyReportResult = {
  siteId: string
  type: string
  range?: { startDate: string; endDate: string }
  rows: ClickyItem[]
  returnedRows: number
  retainedRowLimit: number
  retainedRowLimitReached: boolean
  cache: 'hit' | 'miss' | 'bypass'
}

function clickyError(operation: string, message: string): ProviderError {
  return new ProviderError({
    provider: 'clicky',
    operation,
    code: 'invalid-response',
    message,
  })
}

function boundedLimit(value = CLICKY_PAGE_LIMIT): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw clickyError('report', 'Clicky limit must be a positive whole number.')
  }
  return Math.min(value, CLICKY_MAX_RETAINED_ROWS)
}

function exactDate(
  value: string | undefined,
  label: string,
): string | undefined {
  if (value === undefined) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw clickyError('report', `Clicky ${label} must use YYYY-MM-DD.`)
  }
  return value
}

function clickyDate(input: ClickyReportInput): string | undefined {
  const startDate = exactDate(input.startDate, 'startDate')
  const endDate = exactDate(input.endDate, 'endDate')
  if (Boolean(startDate) !== Boolean(endDate)) {
    throw clickyError(
      'report',
      'Clicky startDate and endDate must be provided together.',
    )
  }
  if (!startDate || !endDate) return undefined
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  const days = Math.floor((end - start) / 86_400_000) + 1
  if (!Number.isFinite(days) || days < 1 || days > 31) {
    throw clickyError(
      'report',
      'Clicky date ranges are limited to 31 days for consistent account support.',
    )
  }
  return `${startDate},${endDate}`
}

function responseItems(response: ClickyResponse, type: string): ClickyItem[] {
  const error = response.find((group) => group.error)?.error
  if (error) {
    const authentication = /sitekey|site id|authentication|permission/iu.test(
      error,
    )
    throw new ProviderError({
      provider: 'clicky',
      operation: type,
      code: authentication ? 'authentication' : 'remote-error',
      message: authentication
        ? 'Clicky rejected the configured site ID or sitekey.'
        : `Clicky could not run the ${type} report: ${error}`,
    })
  }
  return response
    .filter((group) => group.type === type)
    .flatMap((group) => group.dates ?? [])
    .flatMap((date) => date.items ?? [])
}

export class ClickyClient {
  readonly siteId: string
  private readonly suppliedSiteKey?: string
  private readonly fetch: ProviderFetch

  constructor(options: ClickyClientOptions) {
    this.siteId = normalizeClickySiteId(options.siteId)
    this.suppliedSiteKey = options.siteKey
    this.fetch = options.fetch ?? fetch
  }

  private async siteKey(): Promise<string> {
    if (this.suppliedSiteKey) return this.suppliedSiteKey
    const credential = await readClickySiteKey(this.siteId)
    if (!credential) {
      throw new ProviderError({
        provider: 'clicky',
        operation: 'credentials',
        code: 'configuration',
        message: `No Clicky sitekey is saved for site ${this.siteId}. Run seo analytics clicky connect in a terminal or set SEO_CLICKY_SITEKEY.`,
      })
    }
    return credential.siteKey
  }

  private async requestPage(input: {
    type: string
    date?: string
    limit: number
    page: number
  }): Promise<ClickyItem[]> {
    const url = new URL(CLICKY_ENDPOINT)
    url.searchParams.set('site_id', this.siteId)
    url.searchParams.set('sitekey', await this.siteKey())
    url.searchParams.set('type', input.type)
    url.searchParams.set('output', 'json')
    url.searchParams.set('limit', String(input.limit))
    url.searchParams.set('page', String(input.page))
    url.searchParams.set('app', 'seo')
    if (input.date) url.searchParams.set('date', input.date)
    const response = await providerRequestJson({
      provider: 'clicky',
      operation: input.type,
      url,
      fetch: this.fetch,
      maxResponseBytes: CLICKY_MAX_RESPONSE_BYTES,
      timeoutMs: CLICKY_TIMEOUT_MS,
      retry: 'safe',
      schema: clickyResponseSchema,
    })
    return responseItems(response, input.type)
  }

  async report(input: ClickyReportInput): Promise<ClickyReportResult> {
    const type = input.type.trim()
    if (!/^[a-z][a-z0-9-]{0,63}$/u.test(type)) {
      throw clickyError('report', 'Clicky report type is invalid.')
    }
    const retainedRowLimit = boundedLimit(input.limit)
    const date = clickyDate(input)
    const firstPage = input.page ?? 1
    if (!Number.isSafeInteger(firstPage) || firstPage < 1) {
      throw clickyError(
        'report',
        'Clicky page must be a positive whole number.',
      )
    }
    const request = { type, date, retainedRowLimit, firstPage }
    const cacheKey = {
      provider: 'clicky' as const,
      credentialScope: providerCredentialScope('clicky', this.siteId),
      operation: 'report',
      request,
    }
    const cached = input.refresh
      ? null
      : readProviderCache(cacheKey, z.array(clickyItemSchema))
    if (cached) {
      return {
        siteId: this.siteId,
        type,
        ...(input.startDate && input.endDate
          ? {
              range: {
                startDate: input.startDate,
                endDate: input.endDate,
              },
            }
          : {}),
        rows: cached.data,
        returnedRows: cached.data.length,
        retainedRowLimit,
        retainedRowLimitReached: cached.data.length >= retainedRowLimit,
        cache: 'hit',
      }
    }

    const rows: ClickyItem[] = []
    let page = firstPage
    while (rows.length < retainedRowLimit) {
      const requestLimit = Math.min(
        CLICKY_PAGE_LIMIT,
        retainedRowLimit - rows.length,
      )
      const batch = await this.requestPage({
        type,
        date,
        limit: requestLimit,
        page,
      })
      rows.push(...batch.slice(0, requestLimit))
      if (batch.length < requestLimit) break
      page += 1
    }

    writeProviderCache(cacheKey, {
      data: rows,
      ttlMs: CLICKY_CACHE_TTL_MS,
      rowCount: rows.length,
      sourceCostMicros: null,
      taskIds: [],
    })
    return {
      siteId: this.siteId,
      type,
      ...(input.startDate && input.endDate
        ? {
            range: { startDate: input.startDate, endDate: input.endDate },
          }
        : {}),
      rows,
      returnedRows: rows.length,
      retainedRowLimit,
      retainedRowLimitReached: rows.length >= retainedRowLimit,
      cache: input.refresh ? 'bypass' : 'miss',
    }
  }

  async verify(): Promise<void> {
    await this.report({ type: 'visitors', limit: 1, refresh: true })
  }
}
