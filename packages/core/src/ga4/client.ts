import { fetch, type RequestInit } from 'undici'
import {
  createGoogleAccessTokenClient,
  type GoogleAccessTokenClient,
} from '../gsc/auth.js'
import { getDb, hashKey } from '../storage/database.js'

export interface Ga4ReportRequest {
  dateRanges: Array<{ startDate: string; endDate: string }>
  dimensions?: Array<{ name: string }>
  metrics: Array<{ name: string }>
  dimensionFilter?: unknown
  metricFilter?: unknown
  orderBys?: unknown[]
  limit?: string | number
  offset?: string | number
}

export interface Ga4RunReportResult {
  dimensionHeaders?: Array<{ name: string }>
  metricHeaders?: Array<{ name: string; type?: string }>
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>
    metricValues?: Array<{ value?: string }>
  }>
  rowCount?: number
  metadata?: {
    dataLossFromOtherRow?: boolean
    subjectToThresholding?: boolean
    timeZone?: string
    currencyCode?: string
    emptyReason?: string
    samplingMetadatas?: Array<{
      samplesReadCount?: string
      samplingSpaceSize?: string
    }>
  }
  propertyQuota?: unknown
}

export interface Ga4PropertySummary {
  property: string
  displayName?: string
  propertyType?: string
  parent?: string
}

export interface Ga4AccountSummary {
  account: string
  displayName?: string
  propertySummaries: Ga4PropertySummary[]
}

export function ga4RequestCanUseCache(body: Ga4ReportRequest): boolean {
  return body.dateRanges.every(
    (range) =>
      /^\d{4}-\d{2}-\d{2}$/.test(range.startDate) &&
      /^\d{4}-\d{2}-\d{2}$/.test(range.endDate),
  )
}

async function authedFetch(
  client: GoogleAccessTokenClient,
  url: string,
  init?: RequestInit,
) {
  const accessToken = await client.getAccessToken()
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

export async function runGa4Report(
  propertyId: string,
  body: Ga4ReportRequest,
  opts: { refresh?: boolean } = {},
): Promise<Ga4RunReportResult> {
  const db = getDb()
  const queryHash = hashKey([propertyId, body])
  const cacheable = ga4RequestCanUseCache(body)
  const cached = cacheable
    ? (db
        .prepare(
          'SELECT response_json FROM ga4_cache WHERE property_id = ? AND query_hash = ? AND expires_at > ?',
        )
        .get(propertyId, queryHash, Date.now()) as
        | { response_json?: string }
        | undefined)
    : undefined

  if (!opts.refresh && cached?.response_json) {
    return JSON.parse(cached.response_json) as Ga4RunReportResult
  }

  const { client } = await createGoogleAccessTokenClient()
  const response = await authedFetch(
    client,
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        `GA4 report failed with 403. Check access to property ${propertyId}.`,
      )
    }
    throw new Error(`GA4 report failed with ${response.status}.`)
  }

  const result = (await response.json()) as Ga4RunReportResult
  if (cacheable) {
    db.prepare(
      `INSERT OR REPLACE INTO ga4_cache
    (property_id, query_hash, request_json, response_json, row_count, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      propertyId,
      queryHash,
      JSON.stringify(body),
      JSON.stringify(result),
      result.rowCount ?? result.rows?.length ?? 0,
      Date.now(),
      Date.now() + 86_400_000,
    )
  }
  return result
}

export async function listGa4AccountSummaries(): Promise<Ga4AccountSummary[]> {
  const { client } = await createGoogleAccessTokenClient()
  const response = await authedFetch(
    client,
    'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
  )

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        'GA4 account summary fetch failed with 403. Enable the Google Analytics Admin API and check Analytics access.',
      )
    }
    throw new Error(`GA4 account summary fetch failed with ${response.status}.`)
  }

  const json = (await response.json()) as {
    accountSummaries?: Ga4AccountSummary[]
  }
  return json.accountSummaries ?? []
}

export function ga4PropertyIdFromName(name: string): string {
  return name.replace(/^properties\//, '')
}

export function ga4RowsToObjects(
  result: Ga4RunReportResult,
): Array<Record<string, string>> {
  const dimensions = result.dimensionHeaders?.map((header) => header.name) ?? []
  const metrics = result.metricHeaders?.map((header) => header.name) ?? []

  return (result.rows ?? []).map((row) => {
    const output: Record<string, string> = {}
    dimensions.forEach((name, index) => {
      output[name] = row.dimensionValues?.[index]?.value ?? ''
    })
    metrics.forEach((name, index) => {
      output[name] = row.metricValues?.[index]?.value ?? ''
    })
    return output
  })
}

export function ga4ReportQualityWarnings(
  result: Ga4RunReportResult,
  label = 'GA4 report',
): string[] {
  const warnings: string[] = []
  if (result.metadata?.dataLossFromOtherRow) {
    warnings.push(`${label} grouped high-cardinality data into (other).`)
  }
  if (result.metadata?.subjectToThresholding) {
    warnings.push(`${label} was subject to Google Analytics thresholding.`)
  }
  const sampled = result.metadata?.samplingMetadatas?.some((sampling) => {
    const read = Number(sampling.samplesReadCount)
    const space = Number(sampling.samplingSpaceSize)
    return Number.isFinite(read) && Number.isFinite(space) && read < space
  })
  if (sampled) warnings.push(`${label} was sampled by Google Analytics.`)
  return warnings
}
