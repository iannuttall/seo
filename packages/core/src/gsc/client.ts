import type { OAuth2Client } from 'google-auth-library'
import { fetch, type RequestInit } from 'undici'
import { getDb, hashKey } from '../storage/database.js'
import type { GscRow } from '../types.js'
import { createAuthorizedClient } from './auth.js'

export interface SearchAnalyticsRequest {
  startDate: string
  endDate: string
  dimensions?: string[]
  type?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews'
  dataState?: 'final' | 'all'
  rowLimit?: number
  startRow?: number
  aggregationType?: 'auto' | 'byPage' | 'byProperty' | 'byNewsShowcasePanel'
  dimensionFilterGroups?: Array<{
    groupType?: 'and'
    filters: Array<{
      dimension: string
      operator:
        | 'equals'
        | 'contains'
        | 'notContains'
        | 'includingRegex'
        | 'excludingRegex'
        | 'notEquals'
      expression: string
    }>
  }>
}

export interface UrlInspectionRequest {
  siteUrl: string
  inspectionUrl: string
  languageCode?: string
}

export interface UrlInspectionResult {
  inspectionResult?: {
    inspectionResultLink?: string
    indexStatusResult?: {
      verdict?: string
      coverageState?: string
      robotsTxtState?: string
      indexingState?: string
      lastCrawlTime?: string
      pageFetchState?: string
      googleCanonical?: string
      userCanonical?: string
      referringUrls?: string[]
      crawledAs?: string
    }
    mobileUsabilityResult?: unknown
    richResultsResult?: unknown
  }
}

async function authedFetch(
  client: OAuth2Client,
  url: string,
  init?: RequestInit,
) {
  const token = await client.getAccessToken()
  const accessToken = typeof token === 'string' ? token : token.token
  if (!accessToken) {
    throw new Error('Could not obtain Google access token.')
  }

  return fetch(url, {
    method: init?.method,
    body: init?.body,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  })
}

async function getAuthorized(): Promise<{ client: OAuth2Client }> {
  const { client } = await createAuthorizedClient()
  return { client }
}

export async function listSites(
  _refresh = false,
): Promise<
  Array<{ siteUrl: string; permissionLevel?: string; siteType?: string }>
> {
  const { client } = await getAuthorized()
  const response = await authedFetch(
    client,
    'https://www.googleapis.com/webmasters/v3/sites',
  )
  if (!response.ok) {
    throw new Error(`GSC site list failed with ${response.status}.`)
  }

  const json = (await response.json()) as {
    siteEntry?: Array<{
      siteUrl: string
      permissionLevel?: string
      siteType?: string
    }>
  }

  const entries = json.siteEntry ?? []
  const db = getDb()
  const insert = db.prepare(
    'INSERT OR REPLACE INTO sites (site_url, display_name, permission, added_at, is_default) VALUES (?, ?, ?, ?, COALESCE((SELECT is_default FROM sites WHERE site_url = ?), 0))',
  )

  for (const site of entries) {
    insert.run(
      site.siteUrl,
      site.siteUrl,
      site.permissionLevel ?? null,
      Date.now(),
      site.siteUrl,
    )
  }

  return entries
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
  let startRow = 0
  let calls = 0

  while (true) {
    const requestBody = {
      ...body,
      rowLimit: 25_000,
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

export async function inspectUrl(
  input: UrlInspectionRequest,
): Promise<UrlInspectionResult> {
  const { client } = await getAuthorized()
  const response = await authedFetch(
    client,
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
    {
      method: 'POST',
      body: JSON.stringify({
        siteUrl: input.siteUrl,
        inspectionUrl: input.inspectionUrl,
        ...(input.languageCode ? { languageCode: input.languageCode } : {}),
      }),
    },
  )

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        'URL Inspection rate limit hit. Back off before retrying.',
      )
    }
    throw new Error(`URL Inspection failed with ${response.status}.`)
  }

  return (await response.json()) as UrlInspectionResult
}
