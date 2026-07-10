import { SeoError } from '../../errors.js'
import { getDb, hashKey } from '../../storage/database.js'
import type { GscRow } from '../../types.js'
import { finalGscDateRange } from '../dates.js'
import { authedFetch, getAuthorized } from './fetch.js'
import type { SearchAnalyticsRequest } from './types.js'

export type PageSearchMetrics = {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type PageTopQuery = PageSearchMetrics & {
  query: string
}

export type SearchDateWindow = { startDate: string; endDate: string }

export type SearchPageBatch<T> = {
  values: Map<string, T>
  returnedRows: number
  retainedRowLimit: number
  retainedRowLimitReached: boolean
}

function searchDateRange(days: number): SearchDateWindow {
  return finalGscDateRange(days)
}

function resolveSearchDateWindow(
  input: number | SearchDateWindow = 28,
): SearchDateWindow {
  return typeof input === 'number' ? searchDateRange(input) : input
}

export async function querySearchAnalytics(
  site: string,
  body: SearchAnalyticsRequest,
  opts: { refresh?: boolean } = {},
): Promise<{ rows: GscRow[]; calls: number; rowsFetched: number }> {
  const { client } = await getAuthorized()
  const db = getDb()
  const queryHash = hashKey([site, body])
  const cached = db
    .prepare(
      'SELECT response_json, row_count FROM gsc_cache WHERE site_url = ? AND query_hash = ? AND expires_at > ?',
    )
    .get(site, queryHash, Date.now()) as
    | { response_json?: string; row_count?: number }
    | undefined

  if (!opts.refresh && cached?.response_json) {
    const rows = JSON.parse(cached.response_json) as GscRow[]
    return { rows, calls: 0, rowsFetched: cached.row_count ?? rows.length }
  }

  const encodedSite = encodeURIComponent(site)
  const allRows: GscRow[] = []
  const { maxRows: requestedMaxRows, ...apiBody } = body
  const maxRows = requestedMaxRows ?? body.rowLimit
  let startRow = 0
  let calls = 0

  while (true) {
    const remainingRows =
      typeof maxRows === 'number' ? maxRows - allRows.length : undefined
    if (typeof remainingRows === 'number' && remainingRows <= 0) {
      break
    }
    const rowLimit = Math.min(
      apiBody.rowLimit ?? 25_000,
      remainingRows ?? 25_000,
      25_000,
    )
    const requestBody = {
      ...apiBody,
      rowLimit,
      startRow,
      dataState: apiBody.dataState ?? 'final',
      dimensions: apiBody.dimensions ?? ['query', 'page'],
      type: apiBody.type ?? 'web',
      aggregationType: apiBody.aggregationType ?? 'auto',
    }

    const response = await authedFetch(
      client,
      `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
      {
        method: 'POST',
        body: JSON.stringify(requestBody),
      },
    )

    calls += 1
    if (!response.ok) {
      if (response.status === 429) {
        throw new SeoError(
          'RATE_LIMITED',
          'GSC rate limit hit. Back off for 15 minutes.',
        )
      }
      if (response.status === 401) {
        throw new SeoError(
          'AUTH_EXPIRED',
          'Google rejected the access token. Run `seo auth login` again.',
        )
      }
      if (response.status === 403) {
        throw new SeoError(
          'ACCESS_DENIED',
          `Google Search Console denied access to ${site}. Check the selected Google account and property permissions.`,
        )
      }
      if (response.status === 404) {
        throw new SeoError(
          'PROPERTY_NOT_FOUND',
          `Google Search Console could not find ${site}. Check the property value and account access.`,
        )
      }
      if (response.status >= 500) {
        throw new SeoError(
          'PROVIDER_UNAVAILABLE',
          `Google Search Console is unavailable (${response.status}). Try again later.`,
        )
      }
      throw new SeoError(
        'PROVIDER_UNAVAILABLE',
        `GSC query failed with ${response.status}.`,
      )
    }

    const json = (await response.json()) as { rows?: GscRow[] }
    const rows = json.rows ?? []
    allRows.push(...rows)
    if (
      rows.length < rowLimit ||
      (typeof maxRows === 'number' && allRows.length >= maxRows)
    ) {
      break
    }
    startRow += rowLimit
  }

  db.prepare(
    `INSERT OR REPLACE INTO gsc_cache
    (site_url, query_hash, request_json, response_json, row_count, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    site,
    queryHash,
    JSON.stringify(body),
    JSON.stringify(allRows),
    allRows.length,
    Date.now(),
    Date.now() + 86_400_000,
  )

  return { rows: allRows, calls, rowsFetched: allRows.length }
}

export async function queryPageMetrics(
  site: string,
  pageUrl: string,
  days = 28,
): Promise<PageSearchMetrics | undefined> {
  const { startDate, endDate } = searchDateRange(days)

  const result = await querySearchAnalytics(site, {
    startDate,
    endDate,
    dimensions: ['page'],
    dimensionFilterGroups: [
      {
        groupType: 'and',
        filters: [
          { dimension: 'page', operator: 'equals', expression: pageUrl },
        ],
      },
    ],
  })

  return result.rows[0]
    ? {
        clicks: result.rows[0].clicks,
        impressions: result.rows[0].impressions,
        ctr: result.rows[0].ctr,
        position: result.rows[0].position,
      }
    : undefined
}

export async function queryPagesMetrics(
  site: string,
  pageUrls: string[],
  days = 28,
): Promise<Map<string, PageSearchMetrics>> {
  return (await queryPagesMetricsBatch(site, pageUrls, days)).values
}

export async function queryPagesMetricsBatch(
  site: string,
  pageUrls: string[],
  range: number | SearchDateWindow = 28,
): Promise<SearchPageBatch<PageSearchMetrics>> {
  const wanted = new Set(pageUrls)
  const retainedRowLimit = 25_000
  if (!wanted.size) {
    return {
      values: new Map(),
      returnedRows: 0,
      retainedRowLimit,
      retainedRowLimitReached: false,
    }
  }
  const { startDate, endDate } = resolveSearchDateWindow(range)
  const result = await querySearchAnalytics(site, {
    startDate,
    endDate,
    dimensions: ['page'],
    rowLimit: retainedRowLimit,
    maxRows: retainedRowLimit,
  })

  const metrics = new Map<string, PageSearchMetrics>()
  for (const row of result.rows) {
    const pageUrl = row.keys[0]
    if (!pageUrl || !wanted.has(pageUrl)) continue
    metrics.set(pageUrl, {
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    })
  }
  return {
    values: metrics,
    returnedRows: result.rowsFetched,
    retainedRowLimit,
    retainedRowLimitReached: result.rowsFetched >= retainedRowLimit,
  }
}

export async function queryPageTopQuery(
  site: string,
  pageUrl: string,
  days = 28,
): Promise<PageTopQuery | undefined> {
  const { startDate, endDate } = searchDateRange(days)

  const result = await querySearchAnalytics(site, {
    startDate,
    endDate,
    dimensions: ['query'],
    dimensionFilterGroups: [
      {
        groupType: 'and',
        filters: [
          { dimension: 'page', operator: 'equals', expression: pageUrl },
        ],
      },
    ],
    rowLimit: 10,
  })
  const row = result.rows[0]
  const query = row?.keys[0]
  return row && query
    ? {
        query,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      }
    : undefined
}

export async function queryPagesTopQueries(
  site: string,
  pageUrls: string[],
  days = 28,
): Promise<Map<string, PageTopQuery>> {
  return (await queryPagesTopQueriesBatch(site, pageUrls, days)).values
}

export async function queryPagesTopQueriesBatch(
  site: string,
  pageUrls: string[],
  range: number | SearchDateWindow = 28,
): Promise<SearchPageBatch<PageTopQuery>> {
  const wanted = new Set(pageUrls)
  const retainedRowLimit = 25_000
  if (!wanted.size) {
    return {
      values: new Map(),
      returnedRows: 0,
      retainedRowLimit,
      retainedRowLimitReached: false,
    }
  }
  const { startDate, endDate } = resolveSearchDateWindow(range)
  const result = await querySearchAnalytics(site, {
    startDate,
    endDate,
    dimensions: ['page', 'query'],
    rowLimit: retainedRowLimit,
    maxRows: retainedRowLimit,
  })

  const topQueries = new Map<string, PageTopQuery>()
  for (const row of result.rows) {
    const pageUrl = row.keys[0]
    const query = row.keys[1]
    if (!pageUrl || !query || !wanted.has(pageUrl) || topQueries.has(pageUrl)) {
      continue
    }
    topQueries.set(pageUrl, {
      query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    })
  }
  return {
    values: topQueries,
    returnedRows: result.rowsFetched,
    retainedRowLimit,
    retainedRowLimitReached: result.rowsFetched >= retainedRowLimit,
  }
}
