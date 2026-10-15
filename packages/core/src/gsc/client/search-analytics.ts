import { searchAnalyticsRows } from '../../google/api.js'
import { getDb, hashKey, noteCacheWrite } from '../../storage/database.js'
import type { GscRow } from '../../types.js'
import { finalGscDateRange } from '../dates.js'
import { getAuthorized, googleFetchFor, LOCAL_SIGN_IN } from './fetch.js'
import type {
  SearchAnalyticsOptions,
  SearchAnalyticsRequest,
  SearchAnalyticsResult,
} from './types.js'

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
  opts: SearchAnalyticsOptions = {},
): Promise<SearchAnalyticsResult> {
  const { client, identity } = await getAuthorized(opts.accountEmail)
  const db = getDb()
  const queryHash = hashKey([site, identity, body])
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

  const result = await searchAnalyticsRows(
    googleFetchFor(client),
    site,
    body,
    LOCAL_SIGN_IN,
  )
  const allRows = result.rows
  const calls = result.calls

  const requestJson = JSON.stringify(body)
  const responseJson = JSON.stringify(allRows)
  db.prepare(
    `INSERT OR REPLACE INTO gsc_cache
    (site_url, query_hash, request_json, response_json, row_count, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    site,
    queryHash,
    requestJson,
    responseJson,
    allRows.length,
    Date.now(),
    Date.now() + 86_400_000,
  )
  noteCacheWrite(
    Buffer.byteLength(requestJson) + Buffer.byteLength(responseJson),
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
