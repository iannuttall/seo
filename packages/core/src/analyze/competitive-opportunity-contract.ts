import type {
  KeywordDiscoverySource,
  KeywordIdea,
  MarketIndependentProviderEvidence,
  ProviderId,
  SearchMarket,
} from '../providers/contracts.js'
import type { LinkSummary } from '../providers/link-contracts.js'
import type { DomainRatingReport } from './domain-rating.js'
import type { KeywordResearchReport } from './keyword-research.js'
import type { SerpResultsReport } from './serp-results.js'

export type CompetitiveOpportunityEvidence =
  | 'serp'
  | 'domain-rating'
  | 'link-summary'

export type CompetitiveOpportunitiesInput = {
  target: string
  seeds: string[]
  market: SearchMarket
  keywordProvider?: ProviderId
  discoverySources?: KeywordDiscoverySource[]
  discoveryLimit?: number
  keywordLimit?: number
  serpProvider?: ProviderId
  serpDepth?: number
  competitorLimit?: number
  competitionEvidence?: CompetitiveOpportunityEvidence
  linkProvider?: 'ahrefs' | 'dataforseo'
  projectId?: string
  refresh?: boolean
}

export type CompetitiveKeywordCandidate = {
  keyword: string
  origin: 'seed' | 'discovered' | 'seed-and-discovered'
  discoverySources: KeywordIdea['sources']
  metrics: Omit<KeywordIdea, 'keyword' | 'sources'> | null
  sourceCount: number
  seedCount: number
}

export type CompetitiveSerpObservation = {
  keyword: string
  status: SerpResultsReport['dataStatus'] | 'unavailable'
  report: SerpResultsReport | null
  reason: string | null
}

export type CompetitiveDomainRatingObservation = {
  domain: string
  status: DomainRatingReport['dataStatus'] | 'unavailable'
  report: DomainRatingReport | null
  reason: string | null
}

export type CompetitiveLinkSummaryObservation = {
  domain: string
  status: 'complete' | 'partial' | 'unavailable'
  evidence: MarketIndependentProviderEvidence<LinkSummary> | null
  reason: string | null
}

export type CompetitiveDomainSummary = {
  domain: string
  appearances: number
  keywordCoverage: number
  bestAbsoluteRank: number
  keywords: string[]
  representativeUrls: string[]
  evidenceRefs: string[]
}

export type CompetitiveDomainComparison = {
  domain: string
  bestAbsoluteRank: number
  rankingUrl: string
  domainRating: number | null
  domainRatingComparedWithTarget: 'lower' | 'equal' | 'higher' | 'unknown'
  referringDomains: number | null
  referringDomainsComparedWithTarget: 'lower' | 'equal' | 'higher' | 'unknown'
  evidenceRefs: string[]
}

export type CompetitiveReviewReason = {
  code:
    | 'target-already-observed'
    | 'observed-search-volume'
    | 'several-discovery-sources'
    | 'lower-domain-rating-result'
    | 'fewer-referring-domains-result'
  evidenceRefs: string[]
  detail: string
}

export type CompetitiveKeywordOpportunity = {
  reviewOrder: number
  keyword: string
  candidate: CompetitiveKeywordCandidate
  serpStatus: CompetitiveSerpObservation['status']
  targetRanks: number[]
  competitors: CompetitiveDomainComparison[]
  reviewReasons: CompetitiveReviewReason[]
}

export type CompetitiveOpportunityFinding = {
  code: CompetitiveReviewReason['code']
  keyword: string
  evidenceRefs: string[]
  principle: string
  detail: string
}

export type CompetitiveOpportunitiesReport = {
  schemaVersion: 1
  methodology: 'competitive_opportunities_v1'
  generatedAt: string
  dataStatus: 'complete' | 'partial' | 'empty' | 'unavailable'
  target: string
  market: SearchMarket
  summary: {
    requestedSeeds: number
    discoveredKeywords: number
    researchedKeywords: number
    completedSerps: number
    failedSerps: number
    recurringCompetitors: number
    targetObservedKeywords: number
    keywordsWithLowerDomainRatingResult: number
    keywordsWithFewerReferringDomainsResult: number
    verdict: string
  }
  selection: {
    discoveryLimit: number
    keywordLimit: number
    serpDepth: number
    competitorLimit: number
    competitionEvidence: CompetitiveOpportunityEvidence
    candidateOrder: string
    competitorOrder: string
    reviewOrder: string
  }
  source: {
    keywordResearch: KeywordResearchReport
    serps: {
      requested: number
      completed: number
      failed: number
      observations: CompetitiveSerpObservation[]
    }
    domainRatings: {
      requested: boolean
      provider: 'ahrefs'
      observations: CompetitiveDomainRatingObservation[]
    }
    linkSummaries: {
      requested: boolean
      provider: 'ahrefs' | 'dataforseo'
      observations: CompetitiveLinkSummaryObservation[]
    }
  }
  processing: {
    discoveryRowsRead: number
    organicRowsRead: number
    candidateDomainComparisons: number
  }
  detailBudget: {
    unit: 'competitive-synthesis-rows'
    limit: number
    returned: number
    sections: {
      candidates: number
      competitors: number
      opportunities: number
      competitorComparisons: number
      reviewReasons: number
      findings: number
    }
  }
  candidates: CompetitiveKeywordCandidate[]
  competitors: CompetitiveDomainSummary[]
  opportunities: CompetitiveKeywordOpportunity[]
  findings: CompetitiveOpportunityFinding[]
  caveats: string[]
  nextSteps: string[]
}
