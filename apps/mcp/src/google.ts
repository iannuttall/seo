import { matchProperty } from '@seo/core/commands'
import type { GscRow, SearchAnalyticsRequest } from '@seo/core/hosted'
import { ToolError } from './tools/registry.ts'

// Search Console and Google Analytics calls with the caller's Google access
// token. Nothing is cached or stored.

// Google returns at most 25,000 rows per request.
const PAGE_ROWS = 25_000
export const MAX_ROWS = 100_000

async function google(
  token: string,
  url: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.ok) return response.json()
  const text = (await response.text()).slice(0, 300)
  if (response.status === 401) {
    throw new ToolError(
      'NOT_CONNECTED',
      'Google sign-in expired or was removed. Reconnect the MCP server.',
    )
  }
  if (response.status === 403) {
    throw new ToolError(
      'NO_ACCESS',
      `Google refused access. The account may not have this property, or the scope was not granted. ${text}`,
    )
  }
  if (response.status === 429) {
    throw new ToolError('RATE_LIMITED', `Google quota reached. ${text}`)
  }
  throw new ToolError(
    'GOOGLE_ERROR',
    `Google answered ${response.status}. ${text}`,
  )
}

const GSC = 'https://www.googleapis.com/webmasters/v3'

export type Property = { siteUrl: string; permissionLevel: string }

export async function listProperties(token: string): Promise<Property[]> {
  const data = (await google(token, `${GSC}/sites`)) as {
    siteEntry?: Property[]
  }
  return (data.siteEntry ?? [])
    .filter((entry) => entry.permissionLevel !== 'siteUnverifiedUser')
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl))
}

// The property the caller means: an exact property, else the closest domain
// property, else a URL-prefix property for the same origin.
export async function resolveProperty(
  token: string,
  site: string,
): Promise<string> {
  const properties = await listProperties(token)
  const found = matchProperty(
    properties.map((property) => property.siteUrl),
    site,
  )
  if (found) return found
  throw new ToolError(
    'NO_ACCESS',
    `This Google account has no Search Console property for ${site}. Call seo_sites to list the properties it can read.`,
  )
}

export type SearchQuery = Omit<
  SearchAnalyticsRequest,
  'rowLimit' | 'maxRows' | 'startRow'
>

export type SearchResult = { rows: GscRow[]; truncated: boolean; calls: number }

export async function searchAnalytics(
  token: string,
  property: string,
  query: SearchQuery,
  maxRows = MAX_ROWS,
): Promise<SearchResult> {
  const rows: GscRow[] = []
  let calls = 0
  const url = `${GSC}/sites/${encodeURIComponent(property)}/searchAnalytics/query`
  while (rows.length < maxRows) {
    const rowLimit = Math.min(PAGE_ROWS, maxRows - rows.length)
    const data = (await google(token, url, {
      ...query,
      type: query.type ?? 'web',
      dataState: query.dataState ?? 'final',
      rowLimit,
      startRow: rows.length,
    })) as { rows?: GscRow[] }
    calls++
    const page = data.rows ?? []
    rows.push(...page)
    if (page.length < rowLimit) return { rows, truncated: false, calls }
  }
  return { rows, truncated: true, calls }
}

export async function inspectUrl(
  token: string,
  property: string,
  url: string,
): Promise<unknown> {
  const data = (await google(
    token,
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
    { inspectionUrl: url, siteUrl: property, languageCode: 'en-US' },
  )) as { inspectionResult?: unknown }
  return data.inspectionResult ?? null
}

const GA_ADMIN = 'https://analyticsadmin.googleapis.com/v1beta'
const GA_DATA = 'https://analyticsdata.googleapis.com/v1beta'

export type AnalyticsProperty = {
  property: string
  name: string
  account: string
}

export async function listAnalyticsProperties(
  token: string,
): Promise<AnalyticsProperty[]> {
  const out: AnalyticsProperty[] = []
  let pageToken = ''
  for (let i = 0; i < 10; i++) {
    const data = (await google(
      token,
      `${GA_ADMIN}/accountSummaries?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`,
    )) as {
      accountSummaries?: {
        displayName: string
        propertySummaries?: { property: string; displayName: string }[]
      }[]
      nextPageToken?: string
    }
    for (const account of data.accountSummaries ?? []) {
      for (const property of account.propertySummaries ?? []) {
        out.push({
          property: property.property.replace('properties/', ''),
          name: property.displayName,
          account: account.displayName,
        })
      }
    }
    if (!data.nextPageToken) break
    pageToken = encodeURIComponent(data.nextPageToken)
  }
  return out
}

export async function runAnalyticsReport(
  token: string,
  property: string,
  body: unknown,
): Promise<unknown> {
  if (!/^\d+$/.test(property)) {
    throw new ToolError(
      'INVALID_INPUT',
      'property must be the numeric Google Analytics property id from seo_sites.',
    )
  }
  return google(token, `${GA_DATA}/properties/${property}:runReport`, body)
}
