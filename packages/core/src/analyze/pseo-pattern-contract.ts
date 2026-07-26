import type {
  KeywordMetric,
  ProviderId,
  SearchMarket,
} from '../providers/contracts.js'
import type { PseoAuditInput, PseoAuditTemplate } from './pseo/audit.js'
import type {
  PseoExternalAcquisition,
  PseoKnownCost,
} from './pseo-opportunity-contract.js'

export const PSEO_PATTERN_KINDS = [
  'alternatives',
  'comparison',
  'conversion',
  'count-statistic',
  'curation',
  'directory',
  'docs-how-to',
  'examples',
  'glossary',
  'integration',
  'list-facet',
  'location',
  'meaning-origin',
  'no-login',
  'persona',
  'pricing',
  'profile',
  'rarity-popularity',
  'reviews-community',
  'template',
  'utility',
  'workflow-action',
  'custom',
] as const

export type PseoPatternKind = (typeof PSEO_PATTERN_KINDS)[number]
export type PseoObservedPatternKind =
  | PseoPatternKind
  | 'learned-theme'
  | 'general'

export type PseoPatternShape = 'terms' | 'pairs' | 'matrix'
export type PseoPatternCoveragePolicy = 'evidence-led' | 'complete-set'

export type PseoPatternValueInput =
  | string
  | {
      id: string
      label: string
    }

export type PseoPatternValue = {
  id: string
  label: string
}

type PseoPatternSetBaseInput = {
  id: string
  kind: PseoPatternKind
  coveragePolicy?: PseoPatternCoveragePolicy
  queryTemplates: string[]
  pathTemplate?: string
}

export type PseoTermPatternSetInput = PseoPatternSetBaseInput & {
  shape: 'terms'
  values: PseoPatternValueInput[]
}

export type PseoPairPatternSetInput = PseoPatternSetBaseInput & {
  shape: 'pairs'
  values: PseoPatternValueInput[]
  pairing: 'anchor' | 'all-pairs' | 'explicit'
  anchor?: string
  pairs?: Array<{ left: string; right: string }>
}

export type PseoMatrixPatternSetInput = PseoPatternSetBaseInput & {
  shape: 'matrix'
  axes: Array<{
    id: string
    values: PseoPatternValueInput[]
  }>
}

export type PseoPatternSetInput =
  | PseoTermPatternSetInput
  | PseoPairPatternSetInput
  | PseoMatrixPatternSetInput

export type PseoPatternsInput = Pick<
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
  | 'refresh'
> & {
  includeBrand?: boolean
  patternSets?: PseoPatternSetInput[]
  candidateLimit?: number
  observedQueryLimit?: number
  includeExternal?: boolean
  market?: SearchMarket
  provider?: ProviderId
  keywordLimit?: number
  serpLimit?: number
  serpDepth?: number
  projectId?: string
}

export type PseoPatternCatalogEntry = {
  kind: PseoPatternKind
  label: string
  description: string
  shapes: PseoPatternShape[]
  automaticDetection: 'direct' | 'heuristic' | 'declared-only'
  queryExamples: string[]
  requirements: string[]
}

export type PseoPatternMetrics = {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export type PseoObservedPattern = PseoPatternMetrics & {
  kind: PseoObservedPatternKind
  label: string
  heuristic: true
  queryCount: number
  pageCount: number
  examples: string[]
  evidenceRef: string
}

export type PseoObservedPatternQuery = PseoPatternMetrics & {
  query: string
  kind: PseoObservedPatternKind
  patternLabel: string
  heuristic: true
  pageCount: number
  samplePages: string[]
  evidenceRef: string
}

export type PseoPatternTemplateSummary = {
  signature: string
  urlCount: number
  sampleUrls: string[]
  population: PseoAuditTemplate['population']
  searchEvidence: {
    clicks: number
    impressions: number
    position: number
    queryPatterns: PseoAuditTemplate['metrics']['queryPatterns']
    topQueries: PseoAuditTemplate['metrics']['topQueries']
  }
  verdict: PseoAuditTemplate['verdict']
  evidenceRef: string
}

export type PseoPatternQueryEvidence = PseoPatternMetrics & {
  query: string
  state: 'retained' | 'not-retained'
  pageCount: number
  samplePages: string[]
}

export type PseoPatternCandidate = {
  id: string
  patternSetId: string
  kind: PseoPatternKind
  shape: PseoPatternShape
  coveragePolicy: PseoPatternCoveragePolicy
  variables: Record<string, PseoPatternValue>
  suggestedPath: string | null
  queryVariants: PseoPatternQueryEvidence[]
  firstParty: PseoPatternMetrics & {
    state: 'retained' | 'not-retained'
    matchedQueries: number
    pageCount: number
    samplePages: string[]
  }
  inventory: {
    state: 'existing' | 'missing' | 'several-existing' | 'unknown'
    matchedUrls: number
    sampleUrls: string[]
  }
  external: {
    keywordMetricRefs: string[]
    serpRefs: string[]
  }
  review: {
    state:
      | 'existing-topic'
      | 'possible-overlap'
      | 'strategic-gap'
      | 'search-evidenced-gap'
      | 'research-only'
      | 'inventory-unknown'
    reason: string
    evidenceRefs: string[]
  }
}

export type PseoPatternSetSummary = {
  id: string
  kind: PseoPatternKind
  shape: PseoPatternShape
  coveragePolicy: PseoPatternCoveragePolicy
  plannedTopics: number
  returnedTopics: number
  omittedTopics: number
  plannedQueryVariants: number
  returnedQueryVariants: number
  existingTopics: number
  strategicGaps: number
  searchEvidencedGaps: number
}

export type PseoPatternKeywordMetric = Pick<
  KeywordMetric,
  | 'keyword'
  | 'monthlySearchVolume'
  | 'keywordDifficulty'
  | 'intent'
  | 'resultCount'
>

export type PseoPatternKeywordEvidence = {
  requested: boolean
  status: 'not-requested' | 'skipped' | 'complete' | 'partial' | 'unavailable'
  acquisition: PseoExternalAcquisition | null
  availableKeywords: number
  selectedKeywords: number
  omittedKeywords: number
  rows: PseoPatternKeywordMetric[]
  reason?: string
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

export type PseoPatternSerpObservation = {
  keyword: string
  status: 'complete' | 'partial' | 'unavailable' | 'not-attempted'
  acquisition: PseoExternalAcquisition | null
  features: string[]
  organicResults: Array<{
    rankGroup: number
    rankAbsolute: number
    domain: string
    url: string
    title: string | null
  }>
  reason?: string
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

export type PseoPatternFinding = {
  code:
    | 'observed-pattern'
    | 'strategic-gap'
    | 'search-evidenced-gap'
    | 'possible-overlap'
  evidenceRefs: string[]
  principle: string
  detail: string
}

export type PseoPatternsReport = {
  schemaVersion: 1
  methodology: 'pseo_patterns_v1'
  site: string
  generatedAt: string
  range: { startDate: string; endDate: string }
  dataStatus: 'complete' | 'partial' | 'empty' | 'filtered'
  market: SearchMarket | null
  summary: {
    observedPatterns: number
    availableObservedPatterns: number
    observedPatternQueries: number
    availableObservedPatternQueries: number
    declaredPatternSets: number
    plannedTopics: number
    returnedTopics: number
    existingTopics: number
    strategicGaps: number
    searchEvidencedGaps: number
    keywordMetrics: number
    serpSnapshots: number
    verdict: string
  }
  source: {
    searchConsole: {
      pageRows: number
      queryPageRows: number
      maxRowsPerRequest: number
      pageRowsPossiblyTruncated: boolean
      queryPageRowsPossiblyTruncated: boolean
      retainedQueryPageRows: number
      dimensions: { page: ['page']; queryPage: ['query', 'page'] }
      searchType: 'web'
      dataState: 'final'
      aggregation: 'auto'
    }
    inventory: {
      sitemapUrls: number
      discoveredUrls: number
      sitemapsRequested: number
      maxUrlsPerSitemap: number
    }
    external: {
      keywordMetrics: PseoPatternKeywordEvidence
      serps: {
        requested: boolean
        requestedQueries: number
        completedQueries: number
        failedQueries: number
        notAttemptedQueries: number
        observations: PseoPatternSerpObservation[]
      }
      cost: PseoKnownCost
    }
  }
  selection: {
    patternSetLimit: number
    candidateLimit: number
    observedPatternLimit: number
    observedQueryLimit: number
    keywordLimit: number
    serpLimit: number
    serpDepth: number
    returnedObservedPatterns: number
    availableObservedPatterns: number
    omittedObservedPatterns: number
    returnedObservedQueries: number
    availableObservedQueries: number
    omittedObservedQueries: number
    candidateOrder: string
    observedPatternOrder: string
    observedQueryOrder: string
  }
  detailBudget: {
    unit: 'pseo-pattern-synthesis-rows'
    limit: number
    returned: number
    sections: {
      catalog: number
      observedPatterns: number
      observedQueries: number
      templates: number
      patternSets: number
      candidates: number
      queryVariants: number
      keywordMetrics: number
      serpObservations: number
      findings: number
    }
  }
  catalog: PseoPatternCatalogEntry[]
  observedPatterns: PseoObservedPattern[]
  observedQueries: PseoObservedPatternQuery[]
  templates: PseoPatternTemplateSummary[]
  patternSets: PseoPatternSetSummary[]
  candidates: PseoPatternCandidate[]
  findings: PseoPatternFinding[]
  warnings: string[]
  caveats: string[]
  nextSteps: string[]
}
