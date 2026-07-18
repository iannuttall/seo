import type { RequestInit, Response } from 'undici'
import { SeoError } from '../errors.js'
import {
  publicHttpFetch,
  readBoundedResponseText,
} from '../fetch/http-client.js'

const DEFAULT_BASE_URL = 'https://ssl.bing.com/webmaster/api.svc/json'
const MAX_RESPONSE_BYTES = 2_000_000
const MAX_STAT_ROWS = 400

export type BingWebmasterCredentials =
  | { apiKey: string; accessToken?: never }
  | { accessToken: string; apiKey?: never }

export type BingWebmasterSite = {
  url: string
  isVerified: boolean
}

export type BingTrafficRow = {
  date: string
  clicks: number
  impressions: number
}

export type BingCrawlRow = {
  date: string
  crawledPages?: number
  inIndex?: number
  inLinks?: number
  code2xx?: number
  code301?: number
  code302?: number
  code4xx?: number
  code5xx?: number
  blockedByRobotsTxt?: number
  crawlErrors?: number
  connectionTimeout?: number
  dnsFailures?: number
  containsMalware?: number
  allOtherCodes?: number
}

export type BingRows<T> = {
  rows: T[]
  invalidRows: number
  capped: boolean
  returnedRows: number
}

type BingFetch = (url: string, init?: RequestInit) => Promise<Response>

type BingClientOptions = {
  baseUrl?: string
  fetchImpl?: BingFetch
  timeoutMs?: number
}

function bingDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const legacy = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value)
  const date = legacy ? new Date(Number(legacy[1])) : new Date(value)
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString().slice(0, 10)
}

function nonnegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function boundedRows<T>(rows: T[], invalidRows: number): BingRows<T> {
  const capped = rows.length > MAX_STAT_ROWS
  return {
    rows: capped ? rows.slice(-MAX_STAT_ROWS) : rows,
    invalidRows,
    capped,
    returnedRows: rows.length,
  }
}

function errorMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { Message?: unknown }
    return typeof parsed.Message === 'string' ? parsed.Message : undefined
  } catch {
    return undefined
  }
}

export class BingWebmasterClient {
  readonly authentication: 'api-key' | 'oauth'
  private readonly baseUrl: string
  private readonly fetchImpl: BingFetch
  private readonly timeoutMs: number

  constructor(
    private readonly credentials: BingWebmasterCredentials,
    options: BingClientOptions = {},
  ) {
    if (!(credentials.apiKey?.trim() || credentials.accessToken?.trim())) {
      throw new SeoError(
        'AUTH_REQUIRED',
        'Bing Webmaster credentials are empty.',
      )
    }
    this.authentication = credentials.apiKey ? 'api-key' : 'oauth'
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.fetchImpl = options.fetchImpl ?? publicHttpFetch
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  private async request(method: string, params: Record<string, string> = {}) {
    const url = new URL(`${this.baseUrl}/${method}`)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    if (this.credentials.apiKey) {
      url.searchParams.set('apikey', this.credentials.apiKey)
    }

    let response: Response
    try {
      response = await this.fetchImpl(url.toString(), {
        headers: {
          accept: 'application/json',
          ...(this.credentials.accessToken
            ? { authorization: `Bearer ${this.credentials.accessToken}` }
            : {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      if (error instanceof SeoError) throw error
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        `Bing Webmaster did not respond: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    const body = await readBoundedResponseText(
      response,
      MAX_RESPONSE_BYTES,
      'Bing Webmaster response',
    )
    if (!response.ok) {
      const message = errorMessage(body)
      if (
        response.status === 401 ||
        /invalidapikey|unauthorized/i.test(message ?? '')
      ) {
        throw new SeoError(
          'AUTH_REQUIRED',
          'Bing Webmaster rejected the saved credential. Run `seo providers bing connect` again.',
        )
      }
      if (response.status === 403) {
        throw new SeoError(
          'ACCESS_DENIED',
          'Bing Webmaster denied access to this site. Check that it is verified for the connected account.',
        )
      }
      if (response.status === 429) {
        throw new SeoError(
          'RATE_LIMITED',
          'Bing Webmaster rate limited this request. Try again later.',
        )
      }
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        `Bing Webmaster request failed with HTTP ${response.status}${message ? ` (${message})` : ''}.`,
      )
    }

    try {
      return (JSON.parse(body) as { d?: unknown }).d
    } catch {
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        'Bing Webmaster returned invalid JSON.',
      )
    }
  }

  async listSites(): Promise<{
    sites: BingWebmasterSite[]
    invalidRows: number
  }> {
    const data = await this.request('GetUserSites')
    if (!Array.isArray(data)) {
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        'Bing Webmaster returned an invalid site list.',
      )
    }
    const sites: BingWebmasterSite[] = []
    let invalidRows = 0
    for (const item of data) {
      if (!item || typeof item !== 'object') {
        invalidRows += 1
        continue
      }
      const row = item as Record<string, unknown>
      if (typeof row.Url !== 'string' || typeof row.IsVerified !== 'boolean') {
        invalidRows += 1
        continue
      }
      sites.push({ url: row.Url, isVerified: row.IsVerified })
    }
    sites.sort((a, b) => a.url.localeCompare(b.url, 'en'))
    return { sites, invalidRows }
  }

  async getTraffic(siteUrl: string): Promise<BingRows<BingTrafficRow>> {
    const data = await this.request('GetRankAndTrafficStats', { siteUrl })
    if (!Array.isArray(data)) {
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        'Bing Webmaster returned invalid traffic statistics.',
      )
    }
    const rows: BingTrafficRow[] = []
    let invalidRows = 0
    for (const item of data) {
      if (!item || typeof item !== 'object') {
        invalidRows += 1
        continue
      }
      const row = item as Record<string, unknown>
      const date = bingDate(row.Date)
      const clicks = nonnegativeNumber(row.Clicks)
      const impressions = nonnegativeNumber(row.Impressions)
      if (!date || clicks === undefined || impressions === undefined) {
        invalidRows += 1
        continue
      }
      rows.push({ date, clicks, impressions })
    }
    rows.sort(
      (a, b) =>
        a.date.localeCompare(b.date, 'en') ||
        a.clicks - b.clicks ||
        a.impressions - b.impressions,
    )
    return boundedRows(rows, invalidRows)
  }

  async getCrawlStats(siteUrl: string): Promise<BingRows<BingCrawlRow>> {
    const data = await this.request('GetCrawlStats', { siteUrl })
    if (!Array.isArray(data)) {
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        'Bing Webmaster returned invalid crawl statistics.',
      )
    }
    const fieldMap = {
      AllOtherCodes: 'allOtherCodes',
      BlockedByRobotsTxt: 'blockedByRobotsTxt',
      Code2xx: 'code2xx',
      Code301: 'code301',
      Code302: 'code302',
      Code4xx: 'code4xx',
      Code5xx: 'code5xx',
      ConnectionTimeout: 'connectionTimeout',
      ContainsMalware: 'containsMalware',
      CrawledPages: 'crawledPages',
      CrawlErrors: 'crawlErrors',
      DnsFailures: 'dnsFailures',
      InIndex: 'inIndex',
      InLinks: 'inLinks',
    } as const
    const rows: BingCrawlRow[] = []
    let invalidRows = 0
    for (const item of data) {
      if (!item || typeof item !== 'object') {
        invalidRows += 1
        continue
      }
      const source = item as Record<string, unknown>
      const date = bingDate(source.Date)
      if (!date) {
        invalidRows += 1
        continue
      }
      const row: BingCrawlRow = { date }
      let invalid = false
      for (const [providerField, field] of Object.entries(fieldMap)) {
        const value = source[providerField]
        if (value === undefined || value === null) continue
        const number = nonnegativeNumber(value)
        if (number === undefined) {
          invalid = true
          break
        }
        row[field as keyof Omit<BingCrawlRow, 'date'>] = number
      }
      if (invalid) {
        invalidRows += 1
        continue
      }
      rows.push(row)
    }
    rows.sort((a, b) => a.date.localeCompare(b.date, 'en'))
    return boundedRows(rows, invalidRows)
  }
}
