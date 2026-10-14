import { matchProperty } from '@seo/core/commands'
import {
  bearerFetch,
  type GoogleFetch,
  inspectSearchConsoleUrl,
  listAnalyticsAccounts,
  listSearchConsoleSites,
  type SearchAnalyticsQuery,
  searchAnalyticsRows,
} from '@seo/core/hosted'
import { ToolError } from './tools/registry.ts'

// The caller's Google token as a fetch for the shared Google API calls.
// Nothing is cached or stored.

export const SIGN_IN = { signIn: 'Reconnect the MCP server and sign in again.' }

// Most rows read per request when a report does not set its own limit.
export const MAX_ROWS = 100_000

export function googleFetch(token: string): GoogleFetch {
  return bearerFetch(() => token)
}

export type Property = { siteUrl: string; permissionLevel: string }

export async function listProperties(token: string): Promise<Property[]> {
  return (await listSearchConsoleSites(googleFetch(token), SIGN_IN))
    .filter((entry) => entry.permissionLevel !== 'siteUnverifiedUser')
    .map((entry) => ({
      siteUrl: entry.siteUrl,
      permissionLevel: entry.permissionLevel ?? '',
    }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl))
}

// The property the caller means: an exact property, else the closest domain
// property, else a URL-prefix property for the same origin.
export async function resolveProperty(
  token: string,
  site: string,
): Promise<string> {
  const found = matchProperty(
    (await listProperties(token)).map((property) => property.siteUrl),
    site,
  )
  if (found) return found
  throw new ToolError(
    'NO_ACCESS',
    `This Google account has no Search Console property for ${site}. Call seo_sites to list the properties it can read.`,
  )
}

export function searchAnalyticsReader(token: string): SearchAnalyticsQuery {
  return (site, body) =>
    searchAnalyticsRows(
      googleFetch(token),
      site,
      { ...body, maxRows: body.maxRows ?? body.rowLimit ?? MAX_ROWS },
      SIGN_IN,
    )
}

export function inspectUrl(token: string, site: string, url: string) {
  return inspectSearchConsoleUrl(googleFetch(token), site, url, {
    ...SIGN_IN,
    languageCode: 'en-US',
  })
}

export type AnalyticsProperty = {
  property: string
  name: string
  account: string
}

export async function listAnalyticsProperties(
  token: string,
): Promise<AnalyticsProperty[]> {
  const accounts = await listAnalyticsAccounts(googleFetch(token), SIGN_IN)
  return accounts.flatMap((account) =>
    account.propertySummaries.map((property) => ({
      property: property.property.replace('properties/', ''),
      name: property.displayName ?? '',
      account: account.displayName ?? '',
    })),
  )
}
