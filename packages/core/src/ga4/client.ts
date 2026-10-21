import {
  type Ga4DataStream,
  googleJson,
  listAnalyticsAccounts,
  runAnalyticsReport,
} from '../google/api.js'
import { createGoogleAccessTokenClient } from '../gsc/auth.js'
import { googleFetchFor, LOCAL_SIGN_IN } from '../gsc/client/fetch.js'
import {
  cacheDb,
  hashKey,
  noteCacheWrite,
  writeToCache,
} from '../storage/database.js'
import type { Ga4AccountSummary } from './account-summaries.js'

export type { Ga4DataStream } from '../google/api.js'
export type {
  Ga4AccountSummary,
  Ga4PropertySummary,
} from './account-summaries.js'

const _GA4_ACCOUNT_SUMMARY_RESPONSE_LIMIT_BYTES = 10 * 1024 * 1024

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

export function ga4RequestCanUseCache(body: Ga4ReportRequest): boolean {
  return body.dateRanges.every(
    (range) =>
      /^\d{4}-\d{2}-\d{2}$/.test(range.startDate) &&
      /^\d{4}-\d{2}-\d{2}$/.test(range.endDate),
  )
}

export async function runGa4Report(
  propertyId: string,
  body: Ga4ReportRequest,
  opts: { refresh?: boolean; accountEmail?: string } = {},
): Promise<Ga4RunReportResult> {
  const { client, identity } = await createGoogleAccessTokenClient(
    opts.accountEmail,
  )
  const db = cacheDb()
  const queryHash = hashKey([propertyId, identity, body])
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

  const result = await runAnalyticsReport<Ga4RunReportResult>(
    googleFetchFor(client),
    propertyId,
    body,
    LOCAL_SIGN_IN,
  )
  if (cacheable) {
    const requestJson = JSON.stringify(body)
    const responseJson = JSON.stringify(result)
    writeToCache((database) => {
      database
        .prepare(
          `INSERT OR REPLACE INTO ga4_cache
          (property_id, query_hash, request_json, response_json, row_count, fetched_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          propertyId,
          queryHash,
          requestJson,
          responseJson,
          result.rowCount ?? result.rows?.length ?? 0,
          Date.now(),
          Date.now() + 86_400_000,
        )
      noteCacheWrite(
        Buffer.byteLength(requestJson) + Buffer.byteLength(responseJson),
        database,
      )
    })
  }
  return result
}

export async function listGa4AccountSummaries(
  accountEmail?: string,
): Promise<Ga4AccountSummary[]> {
  const { client } = await createGoogleAccessTokenClient(accountEmail)
  return listAnalyticsAccounts(googleFetchFor(client), LOCAL_SIGN_IN)
}

export async function listGa4DataStreams(
  propertyId: string,
  accountEmail?: string,
): Promise<Ga4DataStream[]> {
  const { client } = await createGoogleAccessTokenClient(accountEmail)
  const streams: Ga4DataStream[] = []
  let pageToken: string | undefined
  let pageCount = 0

  do {
    if (pageCount >= 20) {
      throw new Error(
        `Google Analytics data stream discovery exceeded 20 pages for property ${propertyId}.`,
      )
    }

    const url = new URL(
      `https://analyticsadmin.googleapis.com/v1beta/properties/${ga4PropertyIdFromName(propertyId)}/dataStreams`,
    )
    url.searchParams.set('pageSize', '200')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const json = await googleJson<{
      dataStreams?: Ga4DataStream[]
      nextPageToken?: string
    }>(googleFetchFor(client), url.toString(), {
      ...LOCAL_SIGN_IN,
      label: 'Google Analytics data streams',
      subject: `property ${propertyId}`,
    })
    streams.push(...(json.dataStreams ?? []))
    pageToken = json.nextPageToken
    pageCount += 1
  } while (pageToken)

  return streams
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
  label = 'Google Analytics report',
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
