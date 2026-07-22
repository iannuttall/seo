import type { DataForSeoClient } from './client.js'

export type DomainResearchClient = Pick<
  DataForSeoClient,
  'domainOverview' | 'rankedKeywords' | 'rankingPages' | 'serpCompetitors'
>
