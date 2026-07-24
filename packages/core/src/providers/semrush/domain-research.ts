import type {
  DomainOverviewRequest,
  DomainResearchProvider,
  RankedKeywordsRequest,
  RankingPagesRequest,
  SerpCompetitorsRequest,
} from '../domain-contracts.js'
import { SemrushClient, type SemrushClientOptions } from './client.js'
import { semrushDomainOverview } from './domain-overview.js'
import { SEMRUSH_V3_MARKETS } from './market.js'
import { semrushRankedKeywords } from './ranked-keywords.js'
import { semrushRankingPages } from './ranking-pages.js'
import { semrushSerpCompetitors } from './serp-competitors.js'

type DomainResearchClient = Pick<SemrushClient, 'report'>

export type SemrushDomainResearchProviderOptions = SemrushClientOptions & {
  client?: DomainResearchClient
}

export class SemrushDomainResearchProvider implements DomainResearchProvider {
  readonly provider = 'semrush' as const
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
    markets: SEMRUSH_V3_MARKETS,
  }))

  private readonly client: DomainResearchClient

  constructor(options: SemrushDomainResearchProviderOptions = {}) {
    this.client = options.client ?? new SemrushClient(options)
  }

  domainOverview(input: DomainOverviewRequest) {
    return semrushDomainOverview(this.client, input)
  }

  rankedKeywords(input: RankedKeywordsRequest) {
    return semrushRankedKeywords(this.client, input)
  }

  rankingPages(input: RankingPagesRequest) {
    return semrushRankingPages(this.client, input)
  }

  serpCompetitors(input: SerpCompetitorsRequest) {
    return semrushSerpCompetitors(this.client, input)
  }
}
