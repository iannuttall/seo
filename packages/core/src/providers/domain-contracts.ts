import type {
  KeywordMetric,
  ProviderAdapter,
  ProviderEvidence,
  ProviderRequestContext,
  ProviderValue,
  SearchMarket,
} from './contracts.js'
import type { ResearchImportColumns } from './imports/research-columns.js'

export type ResearchImportSource = {
  dataset: 'ranked-keywords'
  file: string
  provider: 'dataforseo' | 'semrush' | 'ahrefs'
  exportedAt: string
  format?: 'csv' | 'json' | 'jsonl'
  rowLimit?: number
  columns?: ResearchImportColumns
}

export type RankingDistribution = {
  first: number
  top3: number
  top10: number
  top20: number
  top50: number
  top100: number
}

export type OrganicFootprint = {
  estimatedMonthlyTraffic: ProviderValue<number>
  rankedKeywords: ProviderValue<number>
  estimatedMonthlyTrafficCostUsd: ProviderValue<number>
  rankings: ProviderValue<RankingDistribution>
  newRankings: ProviderValue<number>
  improvedRankings: ProviderValue<number>
  declinedRankings: ProviderValue<number>
  lostRankings: ProviderValue<number>
}

export type DomainOverview = {
  domain: string
  organic: OrganicFootprint
}

export type DomainOverviewRequest = {
  domain: string
  market: SearchMarket
  refresh?: boolean
  context?: ProviderRequestContext
}

export interface DomainOverviewProvider extends ProviderAdapter {
  domainOverview(
    input: DomainOverviewRequest,
  ): Promise<ProviderEvidence<DomainOverview>>
}

export type RankedKeyword = KeywordMetric & {
  url: string
  rankGroup: number
  rankAbsolute: number
  resultType: string
  estimatedMonthlyTraffic: ProviderValue<number>
}

export type RankedKeywordPage = {
  target: string
  rows: RankedKeyword[]
  totalRows: number | null
}

export type RankedKeywordsRequest = {
  target: string
  market: SearchMarket
  includeSubdomains?: boolean
  resultTypes?: string[]
  minSearchVolume?: number
  maxRank?: number
  excludeTerms?: string[]
  limit: number
  offset?: number
  refresh?: boolean
  context?: ProviderRequestContext
}

export interface RankedKeywordsProvider extends ProviderAdapter {
  rankedKeywords(
    input: RankedKeywordsRequest,
  ): Promise<ProviderEvidence<RankedKeywordPage>>
}

export type RankingPage = {
  url: string
  organic: OrganicFootprint
}

export type RankingPagePage = {
  domain: string
  rows: RankingPage[]
  totalRows: number | null
}

export type RankingPagesRequest = {
  domain: string
  market: SearchMarket
  minEstimatedTraffic?: number
  minRankedKeywords?: number
  limit: number
  offset?: number
  refresh?: boolean
  context?: ProviderRequestContext
}

export interface RankingPagesProvider extends ProviderAdapter {
  rankingPages(
    input: RankingPagesRequest,
  ): Promise<ProviderEvidence<RankingPagePage>>
}

export type SerpCompetitorKeywordPosition = {
  keyword: string
  positions: number[]
}

export type SerpCompetitor = {
  domain: string
  matchedKeywords: number
  averagePosition: ProviderValue<number>
  medianPosition: ProviderValue<number>
  visibility: ProviderValue<number>
  estimatedMonthlyTraffic: ProviderValue<number>
  relevantResults: ProviderValue<number>
  keywordPositions: SerpCompetitorKeywordPosition[]
}

export type SerpCompetitorSet = {
  keywords: string[]
  rows: SerpCompetitor[]
  totalRows: number | null
}

export type SerpCompetitorsRequest = {
  keywords: string[]
  market: SearchMarket
  includeSubdomains?: boolean
  resultTypes?: string[]
  limit: number
  offset?: number
  refresh?: boolean
  context?: ProviderRequestContext
}

export interface SerpCompetitorsProvider extends ProviderAdapter {
  serpCompetitors(
    input: SerpCompetitorsRequest,
  ): Promise<ProviderEvidence<SerpCompetitorSet>>
}

export interface DomainResearchProvider
  extends DomainOverviewProvider,
    RankedKeywordsProvider,
    RankingPagesProvider,
    SerpCompetitorsProvider {}
