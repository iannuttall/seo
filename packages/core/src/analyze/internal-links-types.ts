import type { PageFetchDiagnostics } from '../types.js'
import type { PageTechnicalSignal } from './page-technical-signals.js'

export type InternalLinkMatchKind = 'exact-query' | 'lexical-review'

export interface InternalLinkQueryMatch {
  sourceQuery: string
  targetQuery: string
  kind: InternalLinkMatchKind
  relevanceScore: number
  impressions: number
  sharedTerms: string[]
}

export interface InternalLinkCandidate {
  sourceUrl: string
  matchedQueryImpressions: number
  matchedQueries: number
  exactQueryMatches: number
  bestRelevanceScore: number
  bestMatchKind: InternalLinkMatchKind
  matches: InternalLinkQueryMatch[]
}

export interface InternalLinkOpportunity extends InternalLinkCandidate {
  finalUrl: string
  status: number
  technicalSignals: PageTechnicalSignal[]
  fetchDiagnostics: PageFetchDiagnostics
  pageWarnings: string[]
  actionType: 'review-contextual-link' | 'review-alias-link'
  linkEvidence: {
    status: 'missing' | 'non-contextual-only' | 'alias-contextual'
    observedCount: number
    observedLimit: number
    limitedCount: number
    observed: Array<{
      href: string
      text: string
      rel: string[]
      location: 'main-content' | 'navigation' | 'footer' | 'other'
    }>
  }
  confidence: 'medium' | 'low'
  priority: {
    score: number
    heuristic: true
    components: {
      exactQueryMatches: number
      matchedQueryImpressions: number
      relevanceScore: number
    }
  }
  recommendation: {
    principle: 'C.6'
    evidenceRef: string
    action: string
    effort: 'S'
    confidence: 'medium' | 'low'
  }
}

export interface InternalLinksSelection {
  targetSourceRows: number
  targetValidRows: number
  targetInvalidRows: number
  targetUrlMismatchRows: number
  targetLowImpressionQueries: number
  targetLowActionabilityQueries: number
  targetBrandQueries: number
  targetEligibleQueries: number
  selectedLexicalTargetQueries: number
  sourceRows: number
  sourceValidRows: number
  sourceInvalidRows: number
  sourceTargetAliasRows: number
  sourceLowImpressionQueries: number
  sourceLowActionabilityQueries: number
  sourceBrandQueries: number
  sourceUnmatchedQueries: number
  candidateQueries: number
  candidateUrls: number
  attemptedSources: number
  checkedSources: number
  returnedSources: number
  existingLinkExclusions: number
  technicalExclusions: number
  selfAliasExclusions: number
  failedChecks: number
  uncheckedCandidates: number
}

export interface InternalLinksWarning {
  stage: 'target-fetch' | 'target-extract' | 'source-fetch' | 'source-extract'
  url: string
  code: 'fetch-failed' | 'extract-failed' | 'extractor-warning'
  message: string
}

export interface InternalLinksReport {
  site: string
  targetUrl: string
  generatedAt: string
  range: { startDate: string; endDate: string }
  rangeDays: number
  dataStatus:
    | 'empty'
    | 'source-empty'
    | 'filtered'
    | 'partial'
    | 'complete'
    | 'target-technical-issue'
  source: {
    provider: 'google-search-console'
    dimensions: ['query', 'page']
    searchType: 'web'
    dataState: 'final'
    target: {
      pageFilters: string[]
      requests: Array<{
        pageFilter: string
        rowsFetched: number
        calls: number
        possiblyTruncated: boolean
      }>
      rowsFetched: number
      calls: number
      maxRowsPerRequest: number
      possiblyTruncated: boolean
    }
    candidates: {
      queried: boolean
      rowsFetched: number
      calls: number
      maxRows: number
      possiblyTruncated: boolean
    }
    completeness: 'retained-rows-only' | 'possibly-truncated' | 'not-queried'
  }
  methodology: {
    id: 'gsc_internal_link_candidates'
    version: 3
    lexicalTargetLimit: number
    matchedQueryEvidenceLimit: number
    observedLinkEvidenceLimit: number
    matching: 'pairwise_exact_then_precision_lexical'
    ranking: 'exact_matches_then_matched_query_impressions_then_relevance'
    contextualPlacementVerified: true
  }
  filters: {
    minImpressions: number
    resultLimit: number
    checkLimit: number
    maxGscRowsPerRequest: number
  }
  target: {
    requestedUrl: string
    preferredUrl: string
    finalUrl?: string
    canonical?: string
    status?: number
    aliases: string[]
    verification: 'verified' | 'failed' | 'technical-issue'
    technicalSignals: PageTechnicalSignal[]
    fetchDiagnostics?: PageFetchDiagnostics
    queries: Array<{ query: string; clicks: number; impressions: number }>
  }
  selection: InternalLinksSelection
  summary: {
    targetQueries: number
    candidateSources: number
    attemptedSources: number
    checkedSources: number
    returnedSources: number
    existingLinksObserved: number
    technicalExclusions: number
    failedChecks: number
    uncheckedCandidates: number
    matchedQueryImpressions: number
    brandFiltering: 'included' | 'excluded'
    verdict: string
  }
  items: InternalLinkOpportunity[]
  warnings: InternalLinksWarning[]
  caveats: string[]
  recommendations: string[]
  ledgerSummary: string
}
