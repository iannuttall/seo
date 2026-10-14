import { runAnalyticsReport } from '../google.ts'
import { ToolError } from '../tools/registry.ts'

// Page traffic from the caller's analytics. Google Analytics uses the Google
// sign-in. Clicky, Fathom, Simple Analytics and Plausible use keys sent as
// request headers for this one call. Each provider keeps its own metric
// names: a Clicky visitor is not a Google Analytics user.

export type AnalyticsProvider =
  | 'google'
  | 'clicky'
  | 'fathom'
  | 'simple_analytics'
  | 'plausible'

export type AnalyticsInput = {
  site: string
  startDate: string
  endDate: string
  searchOnly: boolean
  limit: number
}

export const ANALYTICS_HEADERS: Record<AnalyticsProvider, string> = {
  google: 'none (Google sign-in)',
  clicky: 'X-Clicky-Sitekey',
  fathom: 'X-Fathom-Key',
  simple_analytics: 'X-Simple-Analytics-Key (and X-Simple-Analytics-User-Id)',
  plausible: 'X-Plausible-Key',
}

type Row = Record<string, string | number | null>
export type AnalyticsResult = { rows: Row[]; notes: string[] }

function header(
  headers: Headers,
  provider: AnalyticsProvider,
  name: string,
): string {
  const value = headers.get(name)
  if (!value) {
    throw new ToolError(
      'NO_KEY',
      `No ${provider} key on this connection. Add the ${ANALYTICS_HEADERS[provider]} header to this MCP server in the client config. See https://github.com/iannuttall/seo/tree/main/apps/mcp#keys`,
    )
  }
  return value
}

async function read(provider: string, request: Request): Promise<unknown> {
  const response = await fetch(request)
  if (!response.ok) {
    throw new ToolError(
      response.status === 401 || response.status === 403
        ? 'NO_KEY'
        : 'PROVIDER_ERROR',
      `${provider} answered ${response.status}. ${(await response.text()).slice(0, 300)}`,
    )
  }
  return response.json()
}

export async function landingPages(
  provider: AnalyticsProvider,
  context: { google: string; headers: Headers },
  input: AnalyticsInput,
): Promise<AnalyticsResult> {
  if (provider === 'google') return google(context.google, input)
  if (provider === 'clicky') return clicky(context.headers, input)
  if (provider === 'fathom') return fathom(context.headers, input)
  if (provider === 'simple_analytics') return simple(context.headers, input)
  return plausible(context.headers, input)
}

async function google(token: string, input: AnalyticsInput) {
  const data = (await runAnalyticsReport(token, input.site, {
    dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
    dimensions: [{ name: 'landingPage' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'engagedSessions' },
      { name: 'keyEvents' },
    ],
    dimensionFilter: input.searchOnly
      ? {
          filter: {
            fieldName: 'sessionDefaultChannelGroup',
            stringFilter: { value: 'Organic Search' },
          },
        }
      : undefined,
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: input.limit,
  })) as {
    rows?: {
      dimensionValues: { value: string }[]
      metricValues: { value: string }[]
    }[]
    rowCount?: number
    metadata?: {
      subjectToThresholding?: boolean
      dataLossFromOtherRow?: boolean
    }
  }
  const notes = [
    input.searchOnly
      ? 'Sessions in the Organic Search default channel group.'
      : 'All sessions.',
  ]
  if (data.metadata?.subjectToThresholding) {
    notes.push(
      'Google Analytics applied thresholding; small rows can be hidden.',
    )
  }
  if (data.metadata?.dataLossFromOtherRow) {
    notes.push('Some rows were grouped into (other) by Google Analytics.')
  }
  if ((data.rowCount ?? 0) > input.limit) {
    notes.push(`${data.rowCount} landing pages in total; ${input.limit} shown.`)
  }
  return {
    notes,
    rows: (data.rows ?? []).map((row) => ({
      page: row.dimensionValues[0]?.value ?? '',
      sessions: Number(row.metricValues[0]?.value ?? 0),
      users: Number(row.metricValues[1]?.value ?? 0),
      engaged_sessions: Number(row.metricValues[2]?.value ?? 0),
      key_events: Number(row.metricValues[3]?.value ?? 0),
    })),
  }
}

async function clicky(headers: Headers, input: AnalyticsInput) {
  const sitekey = header(headers, 'clicky', 'x-clicky-sitekey')
  const url = new URL('https://api.clicky.com/api/stats/4')
  url.searchParams.set('site_id', input.site)
  url.searchParams.set('sitekey', sitekey)
  url.searchParams.set('type', 'landing-pages')
  url.searchParams.set('date', `${input.startDate},${input.endDate}`)
  url.searchParams.set('limit', String(input.limit))
  url.searchParams.set('output', 'json')
  if (input.searchOnly) url.searchParams.set('filter', 'source:search')
  const data = (await read('clicky', new Request(url))) as {
    error?: string
    dates?: { items?: { value: string; title?: string; url?: string }[] }[]
  }[]
  const first = data[0]
  if (first?.error)
    throw new ToolError('PROVIDER_ERROR', `clicky: ${first.error}`)
  return {
    notes: [
      'Clicky landing pages: the count is visitors who entered on the page.',
      input.searchOnly
        ? 'Filtered to visits from search engines.'
        : 'All visits.',
    ],
    rows: (first?.dates?.[0]?.items ?? []).map((item) => ({
      page: item.url ?? item.title ?? '',
      visitors: Number(item.value),
    })),
  }
}

async function fathom(headers: Headers, input: AnalyticsInput) {
  const key = header(headers, 'fathom', 'x-fathom-key')
  const url = new URL('https://api.usefathom.com/v1/aggregations')
  url.searchParams.set('entity', 'pageview')
  url.searchParams.set('entity_id', input.site)
  url.searchParams.set('aggregates', 'visits,uniques,pageviews')
  url.searchParams.set('field_grouping', 'pathname')
  url.searchParams.set('date_from', `${input.startDate} 00:00:00`)
  url.searchParams.set('date_to', `${input.endDate} 23:59:59`)
  url.searchParams.set('sort_by', 'visits:desc')
  url.searchParams.set('limit', String(input.limit))
  if (input.searchOnly) {
    url.searchParams.set(
      'filters',
      JSON.stringify([
        { property: 'referrer_hostname', operator: 'is like', value: 'google' },
      ]),
    )
  }
  const data = (await read(
    'fathom',
    new Request(url, { headers: { authorization: `Bearer ${key}` } }),
  )) as Record<string, string | number>[]
  return {
    notes: [
      'Fathom pageview aggregates by path. visits counts entries on the page.',
      input.searchOnly
        ? 'Filtered to referrer hostnames like "google".'
        : 'All visits.',
    ],
    rows: data.map((row) => ({
      page: String(row.pathname ?? ''),
      visits: Number(row.visits ?? 0),
      uniques: Number(row.uniques ?? 0),
      pageviews: Number(row.pageviews ?? 0),
    })),
  }
}

async function simple(headers: Headers, input: AnalyticsInput) {
  const key = header(headers, 'simple_analytics', 'x-simple-analytics-key')
  const userId = headers.get('x-simple-analytics-user-id')
  const domain = input.site.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const url = new URL(`https://simpleanalytics.com/${domain}.json`)
  url.searchParams.set('version', '6')
  url.searchParams.set('start', input.startDate)
  url.searchParams.set('end', input.endDate)
  url.searchParams.set('fields', 'pages')
  url.searchParams.set('limit', String(input.limit))
  if (input.searchOnly) url.searchParams.set('referrer', 'google.com')
  const data = (await read(
    'simple_analytics',
    new Request(url, {
      headers: { 'api-key': key, ...(userId ? { 'user-id': userId } : {}) },
    }),
  )) as { pages?: { value: string; pageviews: number; visitors: number }[] }
  return {
    notes: [
      'Simple Analytics pages: pageviews and visitors per path.',
      input.searchOnly ? 'Filtered to the referrer google.com.' : 'All visits.',
    ],
    rows: (data.pages ?? []).slice(0, input.limit).map((row) => ({
      page: row.value,
      visitors: row.visitors,
      pageviews: row.pageviews,
    })),
  }
}

async function plausible(headers: Headers, input: AnalyticsInput) {
  const key = header(headers, 'plausible', 'x-plausible-key')
  const domain = input.site.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const data = (await read(
    'plausible',
    new Request('https://plausible.io/api/v2/query', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        site_id: domain,
        metrics: ['visitors', 'visits'],
        date_range: [input.startDate, input.endDate],
        dimensions: ['visit:entry_page'],
        filters: input.searchOnly
          ? [['is', 'visit:channel', ['Organic Search']]]
          : undefined,
        order_by: [['visits', 'desc']],
        pagination: { limit: input.limit },
      }),
    }),
  )) as { results?: { dimensions: string[]; metrics: number[] }[] }
  return {
    notes: [
      'Plausible entry pages: visitors and visits that started on the page.',
      input.searchOnly
        ? 'Filtered to the Organic Search channel.'
        : 'All visits.',
    ],
    rows: (data.results ?? []).map((row) => ({
      page: row.dimensions[0] ?? '',
      visitors: row.metrics[0] ?? 0,
      visits: row.metrics[1] ?? 0,
    })),
  }
}
