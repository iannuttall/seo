import {
  type GoogleFetch,
  listAnalyticsAccounts,
  listSearchConsoleSites,
} from '../google/api.js'
import { table } from './present.js'
import type { CommandResult } from './types.js'

// What a Google sign-in can read: Search Console properties (unverified ones
// left out) and Google Analytics properties, plus which research keys are set.

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

export async function runSites(
  google: GoogleFetch,
  keys: Headers,
  signIn: string,
): Promise<CommandResult> {
  const [properties, accounts] = await Promise.all([
    readableSites(google, signIn),
    listAnalyticsAccounts(google, { signIn }).catch(() => null),
  ])
  const analytics =
    accounts?.flatMap((account) =>
      account.propertySummaries.map((property) => ({
        property: property.property.replace('properties/', ''),
        name: property.displayName ?? '',
        account: account.displayName ?? '',
      })),
    ) ?? null
  const research = [
    ['dataforseo', 'x-dataforseo-login'],
    ['ahrefs', 'x-ahrefs-key'],
  ]
    .filter(([, name]) => keys.get(name ?? ''))
    .map(([provider]) => provider)
  return {
    text: [
      `Search Console properties (${properties.length}):`,
      properties.length
        ? table(properties, ['siteUrl', 'permissionLevel'], null)
        : 'None. This Google account has no Search Console access, so the reports cannot run.',
      analytics === null
        ? 'Google Analytics: not readable with this sign-in.'
        : `Google Analytics properties (${analytics.length}):\n${table(analytics, ['property', 'name', 'account'], null)}`,
      `Research keys: ${research.length ? research.join(', ') : 'none'}.`,
      'Next: seo_report with a site.',
    ].join('\n\n'),
    data: { searchConsole: properties, googleAnalytics: analytics, research },
  }
}
