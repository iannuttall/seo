import type {
  ProviderEvidence,
  ProviderId,
  SearchMarket,
} from '../providers/contracts.js'
import type {
  DomainOverview,
  RankedKeyword,
  RankedKeywordPage,
  RankingPagePage,
  SerpCompetitorSet,
} from '../providers/domain-contracts.js'

export type DomainResearchDataStatus =
  | 'complete'
  | 'partial'
  | 'empty'
  | 'filtered'
  | 'unavailable'

export type DomainReportInput = {
  domain: string
  market: SearchMarket
  provider?: ProviderId
  projectId?: string
  refresh?: boolean
}

export type DomainOverviewReportInput = DomainReportInput & {
  site?: string
  days?: number
}

export type SearchConsoleAggregateEvidence = {
  requested: boolean
  status: 'not-requested' | 'complete' | 'empty' | 'partial'
  provider: 'google-search-console'
  site: string | null
  range: { startDate: string; endDate: string } | null
  clicks: number | null
  impressions: number | null
  averagePosition: number | null
  rowsFetched: number
  calls: number
  maxRows: number
  possiblyTruncated: boolean
}

export type DomainOverviewReport = {
  schemaVersion: 1
  methodology: 'domain_overview_v1'
  generatedAt: string
  dataStatus: DomainResearchDataStatus
  market: SearchMarket
  summary: {
    domain: string
    estimatedMonthlyTraffic: number | null
    rankedKeywords: number | null
    top10Rankings: number | null
    searchConsoleClicks: number | null
    verdict: string
  }
  evidence: ProviderEvidence<DomainOverview>
  firstParty: SearchConsoleAggregateEvidence
  findings: Array<{
    code:
      | 'provider-and-first-party-context'
      | 'ranking-footprint-without-clicks'
    evidenceRefs: string[]
    detail: string
    action: string
  }>
  caveats: string[]
  nextSteps: string[]
}

export type RankedKeywordsReportInput = Omit<DomainReportInput, 'domain'> & {
  target: string
  site?: string
  days?: number
  includeSubdomains?: boolean
  resultTypes?: string[]
  minSearchVolume?: number
  maxRank?: number
  excludeTerms?: string[]
  limit?: number
  offset?: number
}

export type RankedKeywordFirstPartyMatch = {
  keyword: string
  providerRowRef: string
  status: 'observed' | 'not-in-retained-rows' | 'not-requested'
  clicks: number | null
  impressions: number | null
  averagePosition: number | null
  urls: string[]
}

export type RankedKeywordsReport = {
  schemaVersion: 1
  methodology: 'ranked_keywords_v1'
  generatedAt: string
  dataStatus: DomainResearchDataStatus
  market: SearchMarket
  summary: {
    target: string
    providerRows: number
    providerTotalRows: number | null
    matchedSearchConsoleQueries: number
    unmatchedInRetainedSearchConsoleRows: number
    verdict: string
  }
  evidence: ProviderEvidence<RankedKeywordPage>
  firstParty: {
    requested: boolean
    status: 'not-requested' | 'complete' | 'empty' | 'partial'
    site: string | null
    range: { startDate: string; endDate: string } | null
    rowsFetched: number
    calls: number
    maxRows: number
    possiblyTruncated: boolean
    matches: RankedKeywordFirstPartyMatch[]
  }
  findings: Array<{
    code: 'provider-zero-with-first-party-evidence' | 'provider-only-keyword'
    keyword: string
    evidenceRefs: string[]
    detail: string
    action: string
  }>
  caveats: string[]
  nextSteps: string[]
}

export type RankingPagesReportInput = DomainReportInput & {
  site?: string
  days?: number
  minEstimatedTraffic?: number
  minRankedKeywords?: number
  limit?: number
  offset?: number
}

export type RankingPageTemplatePattern = {
  signature: string
  urlCount: number
  sampleUrls: string[]
  evidenceRefs: string[]
}

export type RankingPagesReport = {
  schemaVersion: 1
  methodology: 'ranking_pages_v1'
  generatedAt: string
  dataStatus: DomainResearchDataStatus
  market: SearchMarket
  summary: {
    domain: string
    providerRows: number
    providerTotalRows: number | null
    repeatedPagePatterns: number
    searchConsoleMatchedPages: number
    verdict: string
  }
  evidence: ProviderEvidence<RankingPagePage>
  firstParty: {
    requested: boolean
    status: 'not-requested' | 'complete' | 'empty' | 'partial'
    site: string | null
    range: { startDate: string; endDate: string } | null
    rowsFetched: number
    maxRows: number
    possiblyTruncated: boolean
    matches: Array<{
      pageRef: string
      url: string
      clicks: number
      impressions: number
      averagePosition: number
    }>
  }
  repeatedPatterns: RankingPageTemplatePattern[]
  findings: Array<{
    code:
      | 'repeated-ranking-page-pattern'
      | 'provider-page-with-first-party-evidence'
    evidenceRefs: string[]
    detail: string
    action: string
  }>
  caveats: string[]
  nextSteps: string[]
}

export type CompetitorSiteType =
  | 'business'
  | 'publisher'
  | 'directory'
  | 'community'
  | 'marketplace'
  | 'unknown'

export type DeclaredCompetitor = {
  domain: string
  siteType: CompetitorSiteType
}

export type GapCompetitor = {
  domain: string
  siteType: Exclude<CompetitorSiteType, 'unknown'>
}

export type SerpCompetitorsReportInput = {
  keywords: string[]
  market: SearchMarket
  targetDomain?: string
  declaredCompetitors?: DeclaredCompetitor[]
  resultTypes?: string[]
  limit?: number
  offset?: number
  provider?: ProviderId
  projectId?: string
  refresh?: boolean
}

export type ClassifiedSerpCompetitor = {
  evidenceRef: string
  domain: string
  relationship: 'self' | 'declared-competitor' | 'search-competitor'
  siteType: CompetitorSiteType
  classificationSource: 'target' | 'declared' | 'unclassified'
  matchedKeywords: number
  keywordCoverage: number
  averagePosition: number | null
  visibility: number | null
  sampleKeywords: string[]
}

export type SerpCompetitorsReport = {
  schemaVersion: 1
  methodology: 'serp_competitors_v1'
  generatedAt: string
  dataStatus: DomainResearchDataStatus
  market: SearchMarket
  summary: {
    querySetSize: number
    providerRows: number
    retainedCompetitors: number
    declaredCompetitorsFound: number
    unclassifiedSearchCompetitors: number
    verdict: string
  }
  evidence: ProviderEvidence<SerpCompetitorSet>
  competitors: ClassifiedSerpCompetitor[]
  findings: Array<{
    code: 'repeated-search-competitor' | 'declared-competitor-observed'
    domain: string
    evidenceRefs: string[]
    detail: string
    action: string
  }>
  caveats: string[]
  nextSteps: string[]
}

export type CompetitorKeywordGapReportInput = {
  site: string
  competitors: GapCompetitor[]
  market: SearchMarket
  days?: number
  limitPerDomain?: number
  candidateLimit?: number
  minSearchVolume?: number
  maxRank?: number
  includeSubdomains?: boolean
  provider?: ProviderId
  projectId?: string
  refresh?: boolean
}

export type CompetitorKeywordGapCandidate = {
  keyword: string
  classification:
    | 'already-observed-first-party'
    | 'already-ranked-provider'
    | 'relevant-gap-candidate'
    | 'unverified-competitor-term'
  competitorCount: number
  competitors: Array<{
    domain: string
    rank: number
    url: string
    evidenceRef: string
  }>
  firstParty: {
    observed: boolean
    clicks: number | null
    impressions: number | null
    averagePosition: number | null
    urls: string[]
  }
  ownProviderRank: number | null
  monthlySearchVolume: RankedKeyword['monthlySearchVolume']
  keywordDifficulty: RankedKeyword['keywordDifficulty']
  intent: RankedKeyword['intent']
  relevance: {
    state: 'observed-overlap' | 'weak-overlap' | 'unavailable'
    sharedTokens: string[]
    matchedFirstPartyQueries: string[]
    method: 'bounded-lexical-overlap-v1'
  }
  pseo: {
    repeatedCompetitorPagePatterns: string[]
    proposal: 'existing-template-review' | 'new-template-research' | 'none'
  }
  evidenceRefs: string[]
}

export type CompetitorKeywordGapReport = {
  schemaVersion: 1
  methodology: 'competitor_keyword_gap_v1'
  generatedAt: string
  dataStatus: DomainResearchDataStatus
  market: SearchMarket
  summary: {
    competitorsRequested: number
    competitorsCompleted: number
    sourceRows: number
    uniqueCompetitorKeywords: number
    alreadyObservedFirstParty: number
    alreadyRankedProvider: number
    relevantGapCandidates: number
    unverifiedCompetitorTerms: number
    returnedCandidates: number
    verdict: string
  }
  source: {
    firstParty: {
      provider: 'google-search-console'
      site: string
      range: { startDate: string; endDate: string }
      rowsFetched: number
      calls: number
      maxRows: number
      possiblyTruncated: boolean
    }
    ownDomain: {
      status: 'complete' | 'filtered' | 'partial' | 'unavailable'
      evidence: ProviderEvidence<RankedKeywordPage> | null
      error?: { code: string; message: string }
    }
    competitors: Array<{
      domain: string
      siteType: CompetitorSiteType
      status: 'complete' | 'filtered' | 'partial' | 'unavailable'
      evidence: ProviderEvidence<RankedKeywordPage> | null
      error?: { code: string; message: string }
    }>
  }
  selection: {
    limitPerDomain: number
    candidateLimit: number
    minSearchVolume: number
    maxRank: number
    sourceRowLimit: number
    competitorLimit: number
    tokenRowsPerTermLimit: number
    firstPartyPatternUrlLimit: number
    candidateOrder: 'classification-competitor-count-volume-rank-keyword-v1'
  }
  processing: {
    firstPartyRows: number
    sourceTermVisits: number
    uniqueSourceTerms: number
    retainedTokenPostings: number
    competitorRows: number
    candidateKeywords: number
  }
  candidates: CompetitorKeywordGapCandidate[]
  repeatedCompetitorPatterns: Array<{
    domain: string
    signature: string
    urlCount: number
    sampleUrls: string[]
    evidenceRefs: string[]
  }>
  dataSourceBriefs: Array<{
    candidateRef: string
    instruction: string
    requiredChecks: string[]
    evidenceBoundary: string
  }>
  findings: Array<{
    code:
      | 'relevant-competitor-gap'
      | 'competitor-template-pattern'
      | 'first-party-query-already-covered'
    evidenceRefs: string[]
    detail: string
    action: string
  }>
  caveats: string[]
  nextSteps: string[]
}
