import type {
  BacklinksRequest,
  LinkSummaryRequest,
  LiveLinkProvider,
  ReferringDomainsRequest,
} from '../link-contracts.js'
import { dataForSeoBacklinks } from './backlinks.js'
import { DataForSeoClient, type DataForSeoClientOptions } from './client.js'
import type { LinkResearchClient } from './link-research-client.js'
import { dataForSeoLinkSummary } from './link-summary.js'
import { dataForSeoReferringDomains } from './referring-domains.js'

export type DataForSeoLinkProviderOptions = DataForSeoClientOptions & {
  client?: LinkResearchClient
}

export class DataForSeoLinkProvider implements LiveLinkProvider {
  readonly provider = 'dataforseo' as const
  readonly capabilitySupport = [
    'link-summary',
    'referring-domains',
    'backlinks',
  ].map((capability) => ({
    capability: capability as
      | 'link-summary'
      | 'referring-domains'
      | 'backlinks',
    status: 'available' as const,
    markets: 'all' as const,
  }))

  private readonly client: LinkResearchClient

  constructor(options: DataForSeoLinkProviderOptions = {}) {
    this.client = options.client ?? new DataForSeoClient(options)
  }

  linkSummary(input: LinkSummaryRequest) {
    return dataForSeoLinkSummary(this.client, input)
  }

  backlinks(input: BacklinksRequest) {
    return dataForSeoBacklinks(this.client, input)
  }

  referringDomains(input: ReferringDomainsRequest) {
    return dataForSeoReferringDomains(this.client, input)
  }
}
