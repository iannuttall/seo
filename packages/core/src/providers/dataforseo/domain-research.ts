import type {
  DomainOverviewRequest,
  DomainResearchProvider,
  RankedKeywordsRequest,
  RankingPagesRequest,
  SerpCompetitorsRequest,
} from '../domain-contracts.js'
import { DataForSeoClient, type DataForSeoClientOptions } from './client.js'
import { dataForSeoDomainOverview } from './domain-overview.js'
import type { DomainResearchClient } from './domain-research-client.js'
import { dataForSeoRankedKeywords } from './ranked-keywords.js'
import { dataForSeoRankingPages } from './ranking-pages.js'
import { dataForSeoSerpCompetitors } from './serp-competitors.js'

export type DataForSeoDomainResearchProviderOptions =
  DataForSeoClientOptions & {
    client?: DomainResearchClient
  }

export class DataForSeoDomainResearchProvider
  implements DomainResearchProvider
{
  readonly provider = 'dataforseo' as const
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
    markets: [
      {
        searchEngines: ['google'] as const,
        location: 'country-only' as const,
      },
    ],
  }))

  private readonly client: DomainResearchClient

  constructor(options: DataForSeoDomainResearchProviderOptions = {}) {
    this.client = options.client ?? new DataForSeoClient(options)
  }

  domainOverview(input: DomainOverviewRequest) {
    return dataForSeoDomainOverview(this.client, input)
  }

  rankedKeywords(input: RankedKeywordsRequest) {
    return dataForSeoRankedKeywords(this.client, input)
  }

  rankingPages(input: RankingPagesRequest) {
    return dataForSeoRankingPages(this.client, input)
  }

  serpCompetitors(input: SerpCompetitorsRequest) {
    return dataForSeoSerpCompetitors(this.client, input)
  }
}
