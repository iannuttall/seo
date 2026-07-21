import type {
  KeywordDiscoverySource,
  KeywordIdea,
  ProviderEvidence,
  ProviderId,
  SearchMarket,
  SerpOrganicResult,
} from '../providers/contracts.js'
import type { QueryCluster } from '../types.js'
import type {
  PseoAuditInput,
  PseoAuditReport,
  PseoAuditTemplate,
} from './pseo/audit.js'

export type PseoOpportunitiesInput = Pick<
  PseoAuditInput,
  | 'site'
  | 'days'
  | 'sitemaps'
  | 'maxSitemapUrls'
  | 'templateLimit'
  | 'minimumTemplateUrls'
  | 'minimumTemplateShare'
  | 'minimumTemplateImpressions'
  | 'brandTerms'
  | 'includeBrand'
  | 'refresh'
> & {
  clusterLimit?: number
  includeExternal?: boolean
  market?: SearchMarket
  provider?: ProviderId
  discoverySources?: KeywordDiscoverySource[]
  discoveryLimit?: number
  candidateLimit?: number
  serpLimit?: number
  serpDepth?: number
  projectId?: string
}

export type PseoOpportunityTemplate = {
  signature: string
  shape: PseoAuditTemplate['shape']
  sampleUrls: string[]
  population: {
    discoveredUrls: number
    gscVisibleUrls: number
    untestedUrls: number
  }
  searchEvidence: {
    clicks: number
    impressions: number
    averagePosition: number
    topQueries: Array<{
      query: string
      clicks: number
      impressions: number
      position: number
    }>
    queryPatterns: PseoAuditTemplate['metrics']['queryPatterns']
  }
  evidenceClass: 'search-evidenced-template' | 'observed-template'
  auditVerdict: PseoAuditTemplate['verdict']
  confidence: PseoAuditTemplate['confidence']
  evidenceRef: string
}

export type PseoOpportunityCluster = Pick<
  QueryCluster,
  'label' | 'intent' | 'totals' | 'template' | 'summary' | 'recommendation'
> & {
  queries: QueryCluster['queries']
  evidenceClass: 'template-mapped' | 'query-cluster'
  templateRef: string | null
  evidenceRef: string
}

export type PseoResearchSeed = {
  keyword: string
  source: 'template' | 'query-cluster'
  evidenceRef: string
  templateRef: string | null
}

export type PseoExternalCandidate = {
  keyword: string
  classification:
    | 'existing-first-party-query'
    | 'search-evidenced-template-expansion'
    | 'new-template-research'
  seedRefs: string[]
  templateRefs: string[]
  sources: KeywordIdea['sources']
  monthlySearchVolume: KeywordIdea['monthlySearchVolume']
  keywordDifficulty: KeywordIdea['keywordDifficulty']
  intent: KeywordIdea['intent']
  resultCount: KeywordIdea['resultCount']
  evidenceRef: string
}

export type PseoExternalAcquisition = Pick<
  ProviderEvidence<never>,
  | 'provider'
  | 'observedAt'
  | 'market'
  | 'coverage'
  | 'cache'
  | 'cost'
  | 'request'
  | 'warnings'
>

export type PseoDiscoveryEvidence = {
  requested: boolean
  status: 'not-requested' | 'skipped' | 'complete' | 'partial' | 'unavailable'
  seeds: PseoResearchSeed[]
  acquisition: PseoExternalAcquisition | null
  availableCandidates: number
  returnedCandidates: number
  omittedCandidates: number
  candidates: PseoExternalCandidate[]
  reason?: string
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

export type PseoSerpObservation = {
  keyword: string
  status: 'complete' | 'partial' | 'unavailable'
  acquisition: PseoExternalAcquisition | null
  features: string[]
  organicResults: SerpOrganicResult[]
  resultCoverage: {
    available: number
    returned: number
    omitted: number
  }
  reason?: string
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

export type PseoSerpEvidence = {
  requested: boolean
  requestedQueries: number
  completedQueries: number
  failedQueries: number
  observations: PseoSerpObservation[]
}

export type PseoCompetitorPattern = {
  domain: string
  queryCount: number
  resultCount: number
  bestRank: number
  queries: string[]
  sampleUrls: string[]
  repeatedTemplates: Array<{
    signature: string
    urlCount: number
    sampleUrls: string[]
  }>
  evidenceRefs: string[]
}

export type PseoDataSourceBrief = {
  candidateRef: string
  proposalType: 'template-expansion' | 'new-template-research'
  instruction: string
  requiredChecks: readonly [
    'entities and required fields',
    'stable identifiers and join keys',
    'geographic and language coverage',
    'update cadence and stale-data handling',
    'source provenance, licensing, and attribution',
    'validation rules and missing-value stop conditions',
    'bounded inventory and duplicate prevention',
    'representative output, crawl, canonical, and internal-link review',
  ]
  evidenceBoundary: string
}

export type PseoOpportunityFinding =
  | {
      code: 'template-expansion-candidate'
      evidenceRefs: [string, string]
      detail: string
      action: string
    }
  | {
      code: 'new-template-research-candidate'
      evidenceRefs: [string]
      detail: string
      action: string
    }
  | {
      code: 'competitor-repeated-pattern'
      evidenceRefs: [string]
      detail: string
      action: string
    }

export type PseoKnownCost = {
  currency: 'USD'
  knownEstimatedMicros: number
  knownActualMicros: number
  unknownEstimatedRequests: number
  unknownActualRequests: number
  taskIds: string[]
}

export type PseoOpportunitiesReport = {
  schemaVersion: 1
  methodology: 'pseo_opportunities_v1'
  site: string
  generatedAt: string
  dataStatus: 'complete' | 'partial' | 'empty' | 'filtered'
  market: SearchMarket | null
  summary: {
    observedTemplates: number
    searchEvidencedTemplates: number
    queryClusters: number
    researchSeeds: number
    discoveredCandidates: number
    templateExpansionCandidates: number
    newTemplateResearchCandidates: number
    serpSnapshots: number
    observedCompetitors: number
    dataSourceBriefs: number
    verdict: string
  }
  source: {
    pseoAudit: {
      range: { startDate: string; endDate: string }
      dataStatus: PseoAuditReport['dataStatus']
      pageRows: number
      queryPageRows: number
      pageRowsPossiblyTruncated: boolean
      queryPageRowsPossiblyTruncated: boolean
      discoveredUrls: number
      returnedTemplates: number
    }
    queryClusters: {
      range: { startDate: string; endDate: string }
      returnedClusters: number
      returnedQueries: number
      completeness: 'returned-clusters-only'
      minImpressions: number
      limit: number
    }
    external: {
      discovery: PseoDiscoveryEvidence
      serps: PseoSerpEvidence
      cost: PseoKnownCost
    }
  }
  selection: {
    templateLimit: number
    clusterLimit: number
    seedLimit: 5
    discoveryLimit: number
    candidateLimit: number
    serpLimit: number
    serpDepth: number
    organicResultsPerSnapshot: 10
    competitorLimit: 10
    dataSourceBriefLimit: 3
    candidateOrder: 'classification-source-count-volume-keyword-v1'
  }
  templates: PseoOpportunityTemplate[]
  queryClusters: PseoOpportunityCluster[]
  competitors: PseoCompetitorPattern[]
  findings: PseoOpportunityFinding[]
  dataSourceBriefs: PseoDataSourceBrief[]
  caveats: string[]
  nextSteps: string[]
}
