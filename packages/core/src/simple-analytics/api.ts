import { readJson } from '../http/read-json.js'

// Every Simple Analytics Stats API call, shared by the CLI, both MCP servers
// and any other host. Worker-safe: fetch only. One API key belongs to a
// Simple Analytics user and reads every website that user can see; a
// website is its hostname.

const ORIGIN = 'https://simpleanalytics.com'
const MAX_BYTES = 5_000_000
const TIMEOUT_MS = 20_000
// The most rows Simple Analytics returns in one list. It does not page or
// say when a list was cut, so a list this long may be missing rows.
export const SIMPLE_ANALYTICS_LIMIT = 1000

export type SimpleAnalyticsRow = {
  value: string
  pageviews: number
  visitors: number
}

export type SimpleAnalyticsStats = {
  hostname: string
  timezone: string | null
  pageviews: number | null
  visitors: number | null
  pages: SimpleAnalyticsRow[]
  referrers: SimpleAnalyticsRow[]
  utm_sources: SimpleAnalyticsRow[]
}

export class SimpleAnalyticsError extends Error {
  constructor(
    // not_found: no website with this hostname for this key.
    readonly code: 'not_found' | 'auth' | 'remote',
    message: string,
  ) {
    super(message)
  }
}

export function isSimpleAnalyticsKey(value: string): boolean {
  return /^sa_api_key_[A-Za-z0-9_-]{8,120}$/u.test(value.trim())
}

const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null

const rows = (value: unknown): SimpleAnalyticsRow[] =>
  Array.isArray(value)
    ? value.flatMap((row: Record<string, unknown>) =>
        row && typeof row.value === 'string'
          ? [
              {
                value: row.value,
                pageviews: number(row.pageviews) ?? 0,
                visitors: number(row.visitors) ?? 0,
              },
            ]
          : [],
      )
    : []

// One website's stats for a date range (YYYY-MM-DD, in the website's own
// time zone). fields names the totals and lists to return; filters narrow
// every number, such as { pages: '/blog*' } or { referrer: 'chatgpt.com' }.
export async function simpleAnalyticsStats(
  key: string,
  hostname: string,
  range: { startDate: string; endDate: string },
  fields: string[],
  filters: Record<string, string> = {},
): Promise<SimpleAnalyticsStats> {
  const url = new URL(`${ORIGIN}/${encodeURIComponent(hostname)}.json`)
  url.searchParams.set('version', '6')
  url.searchParams.set('info', 'false')
  url.searchParams.set('start', range.startDate)
  url.searchParams.set('end', range.endDate)
  url.searchParams.set('fields', fields.join(','))
  url.searchParams.set('limit', String(SIMPLE_ANALYTICS_LIMIT))
  for (const [name, value] of Object.entries(filters)) {
    url.searchParams.set(name, value)
  }
  const response = await fetch(url, {
    headers: { 'Api-Key': key, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => {
    throw new SimpleAnalyticsError(
      'remote',
      'Could not reach Simple Analytics. Try again.',
    )
  })
  if (response.status === 404) {
    throw new SimpleAnalyticsError(
      'not_found',
      `Simple Analytics has no website ${hostname} for this key.`,
    )
  }
  if (response.status === 401 || response.status === 403) {
    throw new SimpleAnalyticsError(
      'auth',
      `Simple Analytics rejected the API key for ${hostname}.`,
    )
  }
  if (response.status === 423) {
    throw new SimpleAnalyticsError(
      'auth',
      `Simple Analytics has no API access for ${hostname} on its plan.`,
    )
  }
  if (response.status === 400) {
    // A private website answers a missing or wrong key with 400 and its
    // reason in the body.
    const reason = await readJson<{ error?: unknown }>(
      response,
      'Simple Analytics',
      { maxBytes: 10_000 },
    ).catch(() => null)
    const error = String(reason?.error ?? '')
    throw /api-key|authori[sz]/iu.test(error)
      ? new SimpleAnalyticsError(
          'auth',
          `Simple Analytics rejected the API key for ${hostname}.`,
        )
      : new SimpleAnalyticsError(
          'remote',
          `Simple Analytics: ${error.slice(0, 200) || 'returned 400'}.`,
        )
  }
  if (!response.ok) {
    throw new SimpleAnalyticsError(
      'remote',
      `Simple Analytics returned ${response.status}.`,
    )
  }
  const body = await readJson<Record<string, unknown>>(
    response,
    'Simple Analytics',
    { maxBytes: MAX_BYTES },
  )
  if (body?.ok !== true) {
    throw new SimpleAnalyticsError(
      'remote',
      `Simple Analytics: ${String(body?.error ?? 'invalid data').slice(0, 200)}`,
    )
  }
  return {
    hostname: typeof body.hostname === 'string' ? body.hostname : hostname,
    timezone: typeof body.timezone === 'string' ? body.timezone : null,
    pageviews: number(body.pageviews),
    visitors: number(body.visitors),
    pages: rows(body.pages),
    referrers: rows(body.referrers),
    utm_sources: rows(body.utm_sources),
  }
}
