import { type BingCall, type BingSite, listBingSites } from '../bing/api.js'
import {
  type GoogleFetch,
  listAnalyticsAccounts,
  listSearchConsoleSites,
} from '../google/api.js'
import { table } from './present.js'
import type { CommandResult } from './types.js'

// What the sign-ins on a surface can read: Search Console properties
// (unverified ones left out), Google Analytics properties and Bing Webmaster
// sites, plus which research keys are set.

// One Google sign-in. The email names it when a surface has several.
export type GoogleAccount = { email: string | null; google: GoogleFetch }

export async function readableSites(
  google: GoogleFetch,
  signIn: string,
): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  return (await listSearchConsoleSites(google, { signIn }))
    .filter((entry) => entry.permissionLevel !== 'siteUnverifiedUser')
    .map((entry) => ({
      siteUrl: entry.siteUrl,
      permissionLevel: entry.permissionLevel ?? '',
    }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl))
}

const hostOf = (value: string) => {
  try {
    return new URL(
      value.includes('://')
        ? value
        : `https://${value.replace(/^sc-domain:/, '')}`,
    ).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

export async function runSites(input: {
  accounts: GoogleAccount[]
  keys: Headers
  signIn: string
  bing?: BingCall | null
  // Where to add a Google account, Bing or keys on this surface.
  connect: string
}): Promise<CommandResult> {
  const named = input.accounts.length > 1
  const [google, bing] = await Promise.all([
    Promise.all(
      input.accounts.map(async (account) => {
        const [properties, analytics] = await Promise.all([
          readableSites(account.google, input.signIn).catch((error: unknown) =>
            error instanceof Error ? error : new Error(String(error)),
          ),
          listAnalyticsAccounts(account.google, {
            signIn: input.signIn,
          }).catch(() => null),
        ])
        return { email: account.email, properties, analytics }
      }),
    ),
    input.bing
      ? listBingSites(input.bing).catch((error: unknown) =>
          error instanceof Error ? error : new Error(String(error)),
        )
      : Promise.resolve(null),
  ])
  const bingSites = Array.isArray(bing)
    ? bing.filter((site: BingSite) => site.verified)
    : []
  const bingByHost = new Map(bingSites.map((site) => [hostOf(site.url), site]))
  const properties = google.flatMap((account) =>
    account.properties instanceof Error
      ? []
      : account.properties.map((property) => ({
          ...property,
          ...(named ? { account: account.email ?? '' } : {}),
          ...(Array.isArray(bing)
            ? { bing: bingByHost.get(hostOf(property.siteUrl))?.url ?? '' }
            : {}),
        })),
  )
  const googleHosts = new Set(
    properties.map((property) => hostOf(property.siteUrl)),
  )
  const bingOnly = bingSites.filter(
    (site) => !googleHosts.has(hostOf(site.url)),
  )
  const failed = google.filter((account) => account.properties instanceof Error)
  const analytics = google.flatMap((account) =>
    (account.analytics ?? []).flatMap((summary) =>
      summary.propertySummaries.map((property) => ({
        property: property.property.replace('properties/', ''),
        name: property.displayName ?? '',
        account: summary.displayName ?? '',
        ...(named ? { signIn: account.email ?? '' } : {}),
      })),
    ),
  )
  const research = [
    ['dataforseo', 'x-dataforseo-login'],
    ['ahrefs', 'x-ahrefs-key'],
  ]
    .filter(([, name]) => input.keys.get(name ?? ''))
    .map(([provider]) => provider)
  const columns = [
    'siteUrl',
    'permissionLevel',
    ...(named ? ['account'] : []),
    ...(Array.isArray(bing) ? ['bing'] : []),
  ]
  const parts = [
    named
      ? `Google accounts: ${input.accounts.map((account) => account.email).join(', ')}.`
      : null,
    `Search Console properties (${properties.length}):`,
    properties.length
      ? table(properties, columns, null)
      : 'None. These Google sign-ins have no Search Console access, so the reports cannot run.',
    ...failed.map(
      (account) =>
        `${account.email ?? 'Google'}: could not list properties. ${(account.properties as Error).message}`,
    ),
    analytics.length
      ? `Google Analytics properties (${analytics.length}):\n${table(analytics, ['property', 'name', 'account', ...(named ? ['signIn'] : [])], null)}`
      : 'Google Analytics: no properties readable with these sign-ins.',
    bing === null
      ? 'Bing Webmaster: not connected.'
      : bing instanceof Error
        ? `Bing Webmaster: could not list sites. ${bing.message}`
        : bingOnly.length
          ? `Bing Webmaster sites with no Search Console property here (${bingOnly.length}): ${bingOnly.map((site) => site.url).join(', ')}.`
          : `Bing Webmaster: ${bingSites.length} verified sites; the bing column shows each one.`,
    `Research keys: ${research.length ? research.join(', ') : 'none'}.`,
    `Add a Google account, Bing or a key: ${input.connect}`,
    'Next: seo_report with a site.',
  ]
  return {
    text: parts.filter(Boolean).join('\n\n'),
    data: {
      searchConsole: properties,
      googleAnalytics: analytics,
      bing: Array.isArray(bing) ? bingSites : null,
      research,
    },
  }
}
