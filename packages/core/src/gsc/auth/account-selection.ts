import { SeoError } from '../../errors.js'
import { readConfig } from '../../storage/config.js'
import { selectedGoogleAccount } from './account-context.js'

function oneAccount(
  values: Array<string | undefined>,
  resource: string,
): string | undefined {
  const accounts = [
    ...new Map(
      values
        .filter((value): value is string => Boolean(value))
        .map((value) => [value.toLowerCase(), value]),
    ).values(),
  ]
  if (accounts.length <= 1) return accounts[0]
  throw new SeoError(
    'INVALID_INPUT',
    `Saved projects use different Google accounts for ${resource}. Select a project-specific account instead of relying on resource matching.`,
  )
}

export function searchConsoleAccountForSite(site: string): string | undefined {
  const selected = selectedGoogleAccount('searchConsole')
  if (selected) return selected
  return oneAccount(
    readConfig()
      .clients.filter((client) => client.siteUrl === site)
      .map((client) => client.googleAccounts?.searchConsole),
    site,
  )
}

export function googleAnalyticsAccountForProperty(
  propertyId: string,
): string | undefined {
  const selected = selectedGoogleAccount('googleAnalytics')
  if (selected) return selected
  return oneAccount(
    readConfig()
      .clients.filter(
        (client) => client.analytics.google?.propertyId === propertyId,
      )
      .map((client) => client.googleAccounts?.googleAnalytics),
    `Google Analytics property ${propertyId}`,
  )
}
