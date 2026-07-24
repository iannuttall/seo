import type {
  BacklinksRequest,
  LinkSummaryRequest,
  LiveLinkProvider,
  ReferringDomainsRequest,
} from '../link-contracts.js'
import { ahrefsBacklinks } from './backlinks.js'
import { AhrefsClient, type AhrefsClientOptions } from './client.js'
import { ahrefsLinkSummary } from './link-summary.js'
import { ahrefsReferringDomains } from './referring-domains.js'

type LinkResearchClient = Pick<AhrefsClient, 'request'>

export type AhrefsLinkProviderOptions = AhrefsClientOptions & {
  client?: LinkResearchClient
}

export class AhrefsLinkProvider implements LiveLinkProvider {
  readonly provider = 'ahrefs' as const
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
  private readonly now: () => Date

  constructor(options: AhrefsLinkProviderOptions = {}) {
    this.client = options.client ?? new AhrefsClient(options)
    this.now = options.now ?? (() => new Date())
  }

  linkSummary(input: LinkSummaryRequest) {
    return ahrefsLinkSummary(this.client, input, this.now)
  }

  backlinks(input: BacklinksRequest) {
    return ahrefsBacklinks(this.client, input)
  }

  referringDomains(input: ReferringDomainsRequest) {
    return ahrefsReferringDomains(this.client, input)
  }
}
