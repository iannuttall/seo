import type {
  DomainOverviewRequest,
  DomainResearchProvider,
  RankedKeywordsRequest,
  RankingPagesRequest,
  SerpCompetitorsRequest,
} from '../domain-contracts.js'
import { AhrefsClient, type AhrefsClientOptions } from './client.js'
import { ahrefsDomainOverview } from './domain-overview.js'
import { ahrefsRankedKeywords } from './ranked-keywords.js'
import { ahrefsRankingPages } from './ranking-pages.js'
import { ahrefsSerpCompetitors } from './serp-competitors.js'
import { AHREFS_MARKETS } from './shared.js'

type DomainResearchClient = Pick<AhrefsClient, 'request'>

export type AhrefsDomainResearchProviderOptions = AhrefsClientOptions & {
  client?: DomainResearchClient
}

export class AhrefsDomainResearchProvider implements DomainResearchProvider {
  readonly provider = 'ahrefs' as const
  readonly capabilitySupport = [
    'domain-overview',
    'ranked-keywords',
    'relevant-pages',
    'serp-competitors',
  ].map((capability) => ({
    capability: capability as
      | 'domain-overview'
      | 'ranked-keywords'
      | 'relevant-pages'
      | 'serp-competitors',
    status: 'available' as const,
    markets: AHREFS_MARKETS,
  }))

  private readonly client: DomainResearchClient
  private readonly now: () => Date

  constructor(options: AhrefsDomainResearchProviderOptions = {}) {
    this.client = options.client ?? new AhrefsClient(options)
    this.now = options.now ?? (() => new Date())
  }

  domainOverview(input: DomainOverviewRequest) {
    return ahrefsDomainOverview(this.client, input, this.now)
  }

  rankedKeywords(input: RankedKeywordsRequest) {
    return ahrefsRankedKeywords(this.client, input, this.now)
  }

  rankingPages(input: RankingPagesRequest) {
    return ahrefsRankingPages(this.client, input, this.now)
  }

  serpCompetitors(input: SerpCompetitorsRequest) {
    return ahrefsSerpCompetitors(this.client, input)
  }
}
