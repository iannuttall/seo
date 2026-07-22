import type {
  MarketIndependentProviderEvidence,
  ProviderAdapter,
  ProviderId,
  ProviderRequestContext,
  ProviderValue,
} from './contracts.js'

export type LinkTargetScope = 'domain' | 'page'

export type ProviderLinkMetric = {
  provider: ProviderId
  id: string
  label: string
  value: number
  scale: { minimum: number; maximum: number } | null
}

export type LinkSummary = {
  target: string
  scope: LinkTargetScope
  backlinks: ProviderValue<number>
  referringDomains: ProviderValue<number>
  referringPages: ProviderValue<number>
  brokenBacklinks: ProviderValue<number>
  brokenPages: ProviderValue<number>
  metrics: ProviderLinkMetric[]
}

export type LinkSummaryRequest = {
  target: string
  scope?: LinkTargetScope
  includeSubdomains?: boolean
  refresh?: boolean
  context?: ProviderRequestContext
}

export interface LinkSummaryProvider extends ProviderAdapter {
  linkSummary(
    input: LinkSummaryRequest,
  ): Promise<MarketIndependentProviderEvidence<LinkSummary>>
}

export type ReferringDomain = {
  domain: string
  backlinks: ProviderValue<number>
  referringPages: ProviderValue<number>
  brokenBacklinks: ProviderValue<number>
  brokenPages: ProviderValue<number>
  firstSeenAt: ProviderValue<string>
  metrics: ProviderLinkMetric[]
}

export type ReferringDomainPage = {
  target: string
  rows: ReferringDomain[]
  totalRows: number | null
}

export type ReferringDomainsRequest = LinkSummaryRequest & {
  limit: number
  offset?: number
}

export interface ReferringDomainsProvider extends ProviderAdapter {
  referringDomains(
    input: ReferringDomainsRequest,
  ): Promise<MarketIndependentProviderEvidence<ReferringDomainPage>>
}

export type ExternalBacklink = {
  sourceUrl: string
  sourceDomain: string
  targetUrl: string
  anchorText: string | null
  linkType: string | null
  dofollow: boolean | null
  attributes: string[]
  firstSeenAt: string | null
  lastSeenAt: string | null
  state: 'live' | 'lost'
  indirect: boolean | null
  linksFromPage: number | null
  linksFromDomain: number | null
  metrics: ProviderLinkMetric[]
}

export type ExternalBacklinkPage = {
  target: string
  mode: 'representative' | 'all'
  rows: ExternalBacklink[]
  totalRows: number | null
}

export type BacklinksRequest = LinkSummaryRequest & {
  mode?: 'representative' | 'all'
  status?: 'live' | 'lost' | 'all'
  limit: number
  offset?: number
}

export interface BacklinksProvider extends ProviderAdapter {
  backlinks(
    input: BacklinksRequest,
  ): Promise<MarketIndependentProviderEvidence<ExternalBacklinkPage>>
}

export interface LiveLinkProvider
  extends LinkSummaryProvider,
    ReferringDomainsProvider,
    BacklinksProvider {}
