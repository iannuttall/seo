import { getDb, hashKey } from '../../storage/database.js'
import type { GscRow } from '../../types.js'
import { authedFetch, getAuthorized } from './fetch.js'
import type { SearchAnalyticsRequest } from './types.js'

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
  let startRow = 0
  let calls = 0

  while (true) {
    const requestBody = {
      ...body,
      rowLimit: body.rowLimit ?? 25_000,
      startRow,
      dataState: body.dataState ?? 'final',
      dimensions: body.dimensions ?? ['query', 'page'],
      type: body.type ?? 'web',
      aggregationType: body.aggregationType ?? 'auto',
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
        throw new Error('GSC rate limit hit. Back off for 15 minutes.')
      }
      throw new Error(`GSC query failed with ${response.status}.`)
    }

    const json = (await response.json()) as { rows?: GscRow[] }
    const rows = json.rows ?? []
    allRows.push(...rows)
    if (rows.length < 25_000) {
      break
    }
    startRow += 25_000
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
): Promise<
  | { clicks: number; impressions: number; ctr: number; position: number }
  | undefined
> {
  const endDate = new Date()
  endDate.setUTCDate(endDate.getUTCDate() - 4)
  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1))

  const result = await querySearchAnalytics(site, {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
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

export async function queryPageTopQuery(
  site: string,
  pageUrl: string,
  days = 28,
): Promise<
  | {
      query: string
      clicks: number
      impressions: number
      ctr: number
      position: number
    }
  | undefined
> {
  const endDate = new Date()
  endDate.setUTCDate(endDate.getUTCDate() - 4)
  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1))

  const result = await querySearchAnalytics(site, {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
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
