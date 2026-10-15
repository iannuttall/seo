import { listSites, SeoError } from '@seo/core'
import { matchProperty } from '@seo/core/commands'

// Every command names its target. Nothing is remembered between runs.

export const SITE_REQUIRED =
  'No site given. Pass --site with a domain, URL or sc-domain: property. Run `seo sites` to list your Search Console properties.'

export function requireSite(site: string | undefined): string {
  if (site) return site
  throw new SeoError('INVALID_INPUT', SITE_REQUIRED)
}

// The Search Console property that covers a domain, URL or property name.
export async function resolveProperty(
  target: string | undefined,
  options: { refresh?: boolean; account?: string } = {},
): Promise<string> {
  const site = requireSite(target)
  const names = (await listSites(options.refresh, options.account)).map(
    (entry) => entry.siteUrl,
  )
  const found = matchProperty(names, site)
  if (!found) {
    throw new SeoError(
      'PROPERTY_NOT_FOUND',
      `This Google login has no Search Console property for ${site}. Run \`seo sites\` to list the properties it can read.`,
    )
  }
  return found
}

export function requireGoogleAnalyticsProperty(
  property: string | undefined,
): string {
  if (property) return property
  throw new SeoError(
    'INVALID_INPUT',
    'No Google Analytics property given. Pass --property with the numeric property id. Run `seo analytics google properties` to list them.',
  )
}
