import { SeoError } from '../errors.js'
import { readJson } from '../http/read-json.js'

// Bing Webmaster Tools API calls shared by every surface. The CLI signs
// requests with an API key; the hosted MCP with a Bing OAuth access token.
// Works in Node and in Workers.

const BASE = 'https://ssl.bing.com/webmaster/api.svc/json'
const MAX_BYTES = 8_000_000

export type BingAuth =
  | { apiKey: string }
  | { accessToken: () => Promise<string> | string }

// One Bing Webmaster API method with its query parameters. Returns the
// response's "d" value.
export type BingCall = (
  method: string,
  params?: Record<string, string>,
) => Promise<unknown>

export function bingCall(
  auth: BingAuth,
  options: { signIn: string },
): BingCall {
  return async (method, params = {}) => {
    const url = new URL(`${BASE}/${method}`)
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value)
    }
    const headers: Record<string, string> = { accept: 'application/json' }
    if ('apiKey' in auth) url.searchParams.set('apikey', auth.apiKey)
    else headers.authorization = `Bearer ${await auth.accessToken()}`
    let response: Response | undefined
    let detail = ''
    // Bing throttles busy networks with HTTP 400 "ThrottleIP"; one retry
    // after a short wait often gets through.
    for (const wait of [0, 2000]) {
      if (wait) await new Promise((done) => setTimeout(done, wait))
      try {
        response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(30_000),
        })
      } catch (error) {
        throw new SeoError(
          'OPTIONAL_PROVIDER_UNAVAILABLE',
          `Bing Webmaster did not respond: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      if (response.ok) break
      detail = (await response.text().catch(() => '')).slice(0, 200)
      if (!/throttle/i.test(detail)) break
    }
    if (!response)
      throw new SeoError(
        'OPTIONAL_PROVIDER_UNAVAILABLE',
        'Bing Webmaster did not respond.',
      )
    if (!response.ok) {
      if (response.status === 401 || /invalidapikey/i.test(detail)) {
        throw new SeoError(
          'AUTH_REQUIRED',
          `Bing Webmaster rejected the sign-in. ${options.signIn}`,
        )
      }
      if (response.status === 403 || /notauthorized/i.test(detail)) {
        throw new SeoError(
          'ACCESS_DENIED',
          'Bing Webmaster denied access to this site. It must be verified in the connected Bing account.',
        )
      }
      if (response.status === 429 || /throttle/i.test(detail)) {
        throw new SeoError(
          'RATE_LIMITED',
          'Bing Webmaster is limiting requests from this network. Try again in a few minutes.',
        )
      }
      throw new SeoError(
        'OPTIONAL_PROVIDER_UNAVAILABLE',
        `Bing Webmaster answered ${response.status}. ${detail}`.trim(),
      )
    }
    const json = await readJson<{ d?: unknown }>(response, 'Bing Webmaster', {
      maxBytes: MAX_BYTES,
    })
    return json.d
  }
}

// "/Date(1700000000000)/" or an ISO date, as YYYY-MM-DD.
function day(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const legacy = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value)
  const date = legacy ? new Date(Number(legacy[1])) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null

function list(data: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(data)) {
    throw new SeoError(
      'OPTIONAL_PROVIDER_UNAVAILABLE',
      `Bing Webmaster returned an invalid ${label}.`,
    )
  }
  return data.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object',
  )
}

export type BingSite = { url: string; verified: boolean }

export async function listBingSites(call: BingCall): Promise<BingSite[]> {
  return list(await call('GetUserSites'), 'site list')
    .filter((row) => typeof row.Url === 'string')
    .map((row) => ({
      url: row.Url as string,
      verified: row.IsVerified === true,
    }))
    .sort((a, b) => a.url.localeCompare(b.url, 'en'))
}

export type BingRows<T> = { rows: T[]; invalidRows: number }

// Daily clicks and impressions for the whole site.
export type BingDay = { date: string; clicks: number; impressions: number }

export async function bingTraffic(
  call: BingCall,
  site: string,
): Promise<BingRows<BingDay>> {
  const rows: BingDay[] = []
  let invalidRows = 0
  for (const row of list(
    await call('GetRankAndTrafficStats', { siteUrl: site }),
    'traffic list',
  )) {
    const date = day(row.Date)
    const clicks = count(row.Clicks)
    const impressions = count(row.Impressions)
    if (!date || clicks === null || impressions === null) {
      invalidRows += 1
      continue
    }
    rows.push({ date, clicks, impressions })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date, 'en'))
  return { rows, invalidRows }
}

// A query or page row. Bing groups these rows by week; the date names the
// week. Position is Bing's average impression position, null when unknown.
export type BingRow = {
  date: string
  key: string
  clicks: number
  impressions: number
  position: number | null
}

async function keyed(
  call: BingCall,
  method: string,
  params: Record<string, string>,
): Promise<BingRows<BingRow>> {
  const rows: BingRow[] = []
  let invalidRows = 0
  for (const row of list(await call(method, params), 'row list')) {
    const date = day(row.Date)
    const key = typeof row.Query === 'string' ? row.Query.trim() : ''
    const clicks = count(row.Clicks)
    const impressions = count(row.Impressions)
    const position = count(row.AvgImpressionPosition)
    if (!date || !key || clicks === null || impressions === null) {
      invalidRows += 1
      continue
    }
    rows.push({ date, key, clicks, impressions, position })
  }
  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date, 'en') || a.key.localeCompare(b.key, 'en'),
  )
  return { rows, invalidRows }
}

export const bingQueries = (call: BingCall, site: string) =>
  keyed(call, 'GetQueryStats', { siteUrl: site })

// GetPageStats names the page in its Query field.
export const bingPages = (call: BingCall, site: string) =>
  keyed(call, 'GetPageStats', { siteUrl: site })

export const bingPageQueries = (call: BingCall, site: string, page: string) =>
  keyed(call, 'GetPageQueryStats', { siteUrl: site, page })

// The Bing site that covers a Search Console property or URL: the same host,
// with or without www.
export function bingSiteFor(sites: BingSite[], target: string): string | null {
  const host = (value: string) => {
    try {
      return new URL(
        value.includes('://')
          ? value
          : `https://${value.replace(/^sc-domain:/, '')}`,
      ).hostname.replace(/^www\./, '')
    } catch {
      return null
    }
  }
  const wanted = host(target)
  if (!wanted) return null
  const found = sites
    .filter((site) => site.verified && host(site.url) === wanted)
    .sort(
      (a, b) =>
        Number(b.url.startsWith('https://')) -
          Number(a.url.startsWith('https://')) ||
        a.url.localeCompare(b.url, 'en'),
    )[0]
  return found?.url ?? null
}
