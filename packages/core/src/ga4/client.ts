import type { OAuth2Client } from 'google-auth-library'
import { fetch, type RequestInit } from 'undici'
import { createAuthorizedClient } from '../gsc/auth.js'

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
  metadata?: unknown
  propertyQuota?: unknown
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

export async function runGa4Report(
  propertyId: string,
  body: Ga4ReportRequest,
): Promise<Ga4RunReportResult> {
  const { client } = await createAuthorizedClient()
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

  return (await response.json()) as Ga4RunReportResult
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
