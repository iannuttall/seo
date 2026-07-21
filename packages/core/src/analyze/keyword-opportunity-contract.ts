import type {
  KeywordMetric,
  ProviderId,
  SearchMarket,
} from '../providers/contracts.js'
import type { QueryCluster } from '../types.js'
import type { KeywordMetricsReport, KeywordTrend } from './keyword-metrics.js'
import type { PseoQueryPattern } from './pseo/query-insights.js'
import type {
  SecondPageAnalysis,
  SecondPageItem,
} from './second-page-analysis.js'
import type { QuickWinAnalysis } from './site-diagnostics/quick-wins-analysis.js'
import type { StrikingDistanceAnalysis } from './striking-distance-analysis.js'

export type KeywordOpportunitySource =
  | 'quick-wins'
  | 'second-page'
  | 'striking-distance'

export type KeywordOpportunitiesInput = {
  site: string
  days?: number
  minImpressions?: number
  limit?: number
  keywordLimit?: number
  queriesPerPage?: number
  clusterLimit?: number
  brandTerms?: string[]
  includeBrand?: boolean
  includeExternal?: boolean
  market?: SearchMarket
  provider?: ProviderId
  projectId?: string
  refresh?: boolean
}

export type BoundedSecondPageItem = Omit<SecondPageItem, 'queries'> & {
  queries: SecondPageItem['queries']
  queryCoverage: {
    available: number
    returned: number
    omitted: number
  }
}

export type QuickWinsSection = Omit<QuickWinAnalysis, 'eligibleItems'>

export type SecondPageSection = Omit<SecondPageAnalysis, 'items'> & {
  items: BoundedSecondPageItem[]
}

export type StrikingDistanceSection = Omit<
  StrikingDistanceAnalysis,
  'groups'
> & {
  groups: StrikingDistanceAnalysis['groups']
  groupCoverage: {
    available: number
    returned: number
    omitted: number
  }
}

export type KeywordOpportunityFirstParty = {
  provider: 'google-search-console'
  dimensions: ['query', 'page']
  searchType: 'web'
  dataState: 'final'
  rowsFetched: number
  calls: number
  maxRows: number
  possiblyTruncated: boolean
  completeness: 'retained-query-rows-only'
  quickWins: QuickWinsSection
  secondPage: SecondPageSection
  strikingDistance: StrikingDistanceSection
}

export type KeywordOpportunityExternal = {
  requested: boolean
  status: 'not-requested' | 'skipped' | 'complete' | 'partial' | 'unavailable'
  selection: {
    availableKeywords: number
    requestedKeywords: number
    omittedKeywords: number
    method: 'round-robin-first-party-sections'
  }
  report: KeywordMetricsReport | null
  reason?: string
  error?: {
    code: 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED'
    message: string
    retryable: boolean
  }
}

export type KeywordOpportunityCombined = {
  keyword: string
  sources: KeywordOpportunitySource[]
  firstParty: {
    clicks: number
    impressions: number
    ctr: number
    averagePosition: number
    urls: Array<{
      url: string
      clicks: number
      impressions: number
      ctr: number
      averagePosition: number
    }>
    urlCoverage: {
      available: number
      returned: number
      omitted: number
    }
  }
  external?: {
    evidenceRef: string
    monthlySearchVolume: KeywordMetric['monthlySearchVolume']
    cpcUsd: KeywordMetric['cpcUsd']
    keywordDifficulty: KeywordMetric['keywordDifficulty']
    intent: KeywordMetric['intent']
    resultCount: KeywordMetric['resultCount']
    trend: KeywordTrend
  }
}

export type KeywordOpportunityCluster = QueryCluster & {
  externalContext: {
    selectedQueries: number
    metricsWithObservedVolume: number
    metricEvidenceRefs: string[]
  }
}

export type KeywordOpportunityFinding =
  | {
      code: 'provider-zero-with-first-party-impressions'
      keyword: string
      evidenceRefs: [string, string]
      detail: string
      action: string
    }
  | {
      code: 'recent-demand-increase'
      keyword: string
      evidenceRefs: [string, string]
      detail: string
      action: string
    }
  | {
      code: 'programmatic-template-cluster'
      keyword: string
      evidenceRefs: [string]
      detail: string
      action: string
    }

export type KeywordOpportunityDataSourcePrompt = {
  clusterRef: string
  queryLabel: string
  instruction: string
  requiredChecks: readonly [
    'stable entity IDs and join keys',
    'required attributes and missing-value rules',
    'source provenance and usage rights',
    'update cadence and freshness checks',
    'page uniqueness and duplicate prevention',
    'representative output and internal-link review',
  ]
  evidenceBoundary: string
}

export type KeywordOpportunitiesReport = {
  schemaVersion: 1
  site: string
  generatedAt: string
  range: { startDate: string; endDate: string }
  rangeDays: number
  dataStatus: 'complete' | 'partial' | 'empty' | 'filtered'
  summary: {
    sourceRows: number
    quickWinCandidates: number
    secondPageCandidates: number
    strikingDistanceCandidates: number
    availableCandidateKeywords: number
    returnedCandidateKeywords: number
    externalMetricsObserved: number
    candidateClusters: number
    programmaticTemplateClusters: number
    verdict: string
  }
  methodology: {
    id: 'gsc_keyword_opportunities_v1'
    sourceAcquisition: 'one-bounded-query-page-acquisition'
    opportunityAnalyses: readonly [
      'gsc_quick_wins_v2',
      'gsc_second_page_v2',
      'gsc_striking_distance_v2',
    ]
    externalSelection: 'round-robin-first-party-sections'
    externalChangesPriorityScore: false
    clustersUse: 'returned-opportunity-keyword-subset'
    clusterMinImpressions: 25
  }
  firstParty: KeywordOpportunityFirstParty
  external: KeywordOpportunityExternal
  combined: KeywordOpportunityCombined[]
  candidateClusters: KeywordOpportunityCluster[]
  programmaticPatterns: PseoQueryPattern[]
  findings: KeywordOpportunityFinding[]
  dataSourcePrompts: KeywordOpportunityDataSourcePrompt[]
  caveats: string[]
  nextSteps: string[]
}
