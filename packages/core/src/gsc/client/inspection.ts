import { createHash } from 'node:crypto'
import { SeoError } from '../../errors.js'
import { getClientConfig } from '../auth/client-config.js'
import { assertUrlMatchesGscProperty } from '../property-url.js'
import { authedFetch, getAuthorized } from './fetch.js'
import {
  finalizeUrlInspectionQuota,
  reserveUrlInspectionQuota,
  UrlInspectionQuotaError,
} from './inspection-quota.js'
import type { UrlInspectionRequest, UrlInspectionResult } from './types.js'

function credentialKey(input: { clientId: string; accountEmail: string }) {
  return createHash('sha256')
    .update(`${input.clientId}\n${input.accountEmail.toLowerCase()}`)
    .digest('base64url')
}

function retryAfter(response: Response, now: Date): Date | undefined {
  const value = response.headers.get('retry-after')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return new Date(now.getTime() + seconds * 1_000)
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined
}

function inspectionResponseError(
  response: Response,
  input: UrlInspectionRequest,
): SeoError {
  if (response.status === 401) {
    return new SeoError(
      'AUTH_EXPIRED',
      'Google rejected the access token. Run `seo auth login` again.',
    )
  }
  if (response.status === 403) {
    return new SeoError(
      'ACCESS_DENIED',
      `Google Search Console denied URL Inspection access to ${input.siteUrl}. Check the selected account and property permissions.`,
    )
  }
  if (response.status === 404) {
    return new SeoError(
      'PROPERTY_NOT_FOUND',
      `Google Search Console could not inspect URLs under ${input.siteUrl}. Check the property value and account access.`,
    )
  }
  if (response.status >= 500) {
    return new SeoError(
      'PROVIDER_UNAVAILABLE',
      `Google URL Inspection is unavailable (${response.status}). Try again later.`,
    )
  }
  return new SeoError(
    'PROVIDER_UNAVAILABLE',
    `URL Inspection failed with ${response.status}.`,
  )
}

export async function inspectUrl(
  input: UrlInspectionRequest,
): Promise<UrlInspectionResult> {
  const inspectionUrl = assertUrlMatchesGscProperty(
    input.siteUrl,
    input.inspectionUrl,
  )
  const { client, tokens } = await getAuthorized()
  const clientConfig = getClientConfig()
  if (!clientConfig) {
    throw new SeoError(
      'AUTH_CONFIG_REQUIRED',
      'OAuth client config missing. Re-run `seo auth setup-client`.',
    )
  }
  const reservation = reserveUrlInspectionQuota({
    credentialKey: credentialKey({
      clientId: clientConfig.clientId,
      accountEmail: tokens.account_email,
    }),
    property: input.siteUrl,
    limit: input.quotaLimit,
  })

  let response: Response
  try {
    response = await authedFetch(
      client,
      'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      {
        method: 'POST',
        body: JSON.stringify({
          siteUrl: input.siteUrl,
          inspectionUrl,
          ...(input.languageCode ? { languageCode: input.languageCode } : {}),
        }),
      },
    )
  } catch (error) {
    finalizeUrlInspectionQuota({ reservation, outcome: 'consumed' })
    if (error instanceof SeoError) throw error
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `URL Inspection request failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (response.status === 429) {
    const now = new Date()
    const blockedUntil = retryAfter(response, now)
    finalizeUrlInspectionQuota({
      reservation,
      outcome: 'exhausted',
      blockedUntil,
      now,
    })
    throw new UrlInspectionQuotaError({
      property: input.siteUrl,
      resetAt: (blockedUntil ?? new Date(reservation.resetAt)).toISOString(),
      used: reservation.used + reservation.count,
      limit: reservation.limit,
      reason: 'provider',
      requestSent: true,
    })
  }

  finalizeUrlInspectionQuota({ reservation, outcome: 'consumed' })
  if (!response.ok) throw inspectionResponseError(response, input)
  return (await response.json()) as UrlInspectionResult
}
