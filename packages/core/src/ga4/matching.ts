import type { Ga4DataStream } from './client.js'

export type Ga4WebStreamCandidate = {
  account: string
  property: string
  propertyName: string
  stream: Ga4DataStream
}

export type Ga4WebStreamMatch = Ga4WebStreamCandidate & {
  defaultUri: string
  hostname: string
  match: 'domain' | 'hostname'
}

function hostnameFromUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.hostname.toLowerCase().replace(/\.$/, '') || undefined
  } catch {
    return undefined
  }
}

function domainFromProperty(value: string): string | undefined {
  if (!value.startsWith('sc-domain:')) return undefined
  const domain = value.slice('sc-domain:'.length).trim().toLowerCase()
  if (!domain || /[/:]/.test(domain)) return undefined
  return domain.replace(/\.$/, '') || undefined
}

function matchForSite(
  site: string,
  streamHostname: string,
): Ga4WebStreamMatch['match'] | undefined {
  const domain = domainFromProperty(site)
  if (domain) {
    return streamHostname === domain || streamHostname.endsWith(`.${domain}`)
      ? 'domain'
      : undefined
  }

  return hostnameFromUrl(site) === streamHostname ? 'hostname' : undefined
}

export function matchGa4WebStreams(
  site: string,
  candidates: Ga4WebStreamCandidate[],
): Ga4WebStreamMatch[] {
  return candidates.flatMap((candidate) => {
    const defaultUri = candidate.stream.webStreamData?.defaultUri
    if (!defaultUri) return []
    const hostname = hostnameFromUrl(defaultUri)
    if (!hostname) return []
    const match = matchForSite(site, hostname)
    if (!match) return []

    return [{ ...candidate, defaultUri, hostname, match }]
  })
}

export function ga4MatchReason(match: Ga4WebStreamMatch, site: string): string {
  const stream = match.stream.displayName ?? match.defaultUri
  const location = match.match === 'domain' ? 'is inside' : 'matches'
  return `Matched Google Analytics web stream ${stream} (${match.defaultUri}): its hostname ${location} ${site}.`
}
