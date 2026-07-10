import type {
  ContentExtractionDiagnostics,
  PageFetchDiagnostics,
} from '../../types.js'

export type CrawlPageSnapshot = {
  url: string
  finalUrl: string
  status: number
  contentType?: string
  responseHeaders?: Record<string, string>
  responseTimeMs?: number
  sizeBytes?: number
  usedJs?: boolean
  fetchSource?: 'cache' | 'network' | 'rendered'
  cacheState?: 'hit' | 'miss' | 'bypass'
  fetchDiagnostics?: PageFetchDiagnostics
  blocked?: boolean
  contentAuditAllowed?: boolean
  crawlDepth?: number
  error?: string
  robotsTxt?: {
    url: string
    allowed: boolean | null
    availability:
      | 'available'
      | 'absent'
      | 'access-blocked'
      | 'rate-limited'
      | 'unreachable'
    status?: number
    error?: string
    matchedLine?: string
  }
  title?: string
  metaDescription?: string
  canonical?: string
  canonicalRaw?: string
  canonicalStatus?:
    | 'missing'
    | 'single'
    | 'duplicate'
    | 'conflicting'
    | 'outside-head-only'
    | 'invalid'
  canonicalCandidates?: import('../../extract/canonical.js').CanonicalCandidate[]
  metaRobots?: string
  xRobotsTag?: string
  h1?: string
  h1Count?: number
  h2Count?: number
  h3Count?: number
  indexable: boolean
  indexability?: string
  declaredIndexability?:
    | 'indexable-candidate'
    | 'noindex'
    | 'robots-blocked'
    | 'canonical-conflict'
    | 'canonical-hint-other'
    | 'not-html'
    | 'unknown'
  extractionStatus?:
    | 'complete'
    | 'failed'
    | 'not-applicable'
    | 'unknown-media-type'
  extractionError?: string
  wordCount: number
  contentExtraction?: ContentExtractionDiagnostics
  warnings?: string[]
  contentHash: string
  mainContentHash?: string
  textRatio?: number
  contentSample?: string
  lang?: string
  hasViewport?: boolean
  isHttps?: boolean
  hasHsts?: boolean
  compression?: string
  hreflang?: Array<{ hreflang: string; href: string }>
  mixedContentCount?: number
  mixedContentSamples?: string[]
  imagesTotal?: number
  imagesMissingAlt?: number
  oversizedImageCandidates?: Array<{
    src: string
    width?: number
    height?: number
    detectedFrom: string
  }>
  outgoingInternalCount: number
  outgoingExternalCount?: number
  internalInlinkCount?: number
  internalLinkAuthorityScore?: number
  sampleInternalLinks?: string[]
  sampleExternalLinks?: string[]
  internalAnchorSamples?: Array<{ href: string; text: string }>
  externalAnchorSamples?: Array<{ href: string; text: string }>
  externalLinkChecks?: Array<{ url: string; status?: number; error?: string }>
  schemaTypes?: string[]
  structuredDataFormats?: Array<'json-ld' | 'microdata' | 'rdfa'>
  googleRichResults?: import('../../types.js').GoogleRichResultAssessment[]
  googleRichResultsSelection?: import('../../types.js').GoogleRichResultAssessmentSelection
  schemaSameAs?: string[]
  schemaSameAsEvidence?: Array<{
    url: string
    block: number
    path: string
    subjectId?: string
    subjectTypes: string[]
  }>
  invalidSchemaSameAs?: Array<{
    block: number
    path: string
    value: string
  }>
  socialProfileLinks?: string[]
  invalidJsonLdCount?: number
  invalidJsonLdSamples?: Array<{ snippet: string; error: string }>
  unrecognizedJsonLdTypes?: Array<{
    block: number
    path: string
    value: string
    reason:
      | 'missing-schema-context'
      | 'unresolved-context'
      | 'unsupported-vocabulary'
  }>
  openGraphTitle?: string
  openGraphDescription?: string
  openGraphImage?: string
  twitterCard?: string
  author?: string
  hasDate?: boolean
  geo?: {
    semanticHtml: boolean
    structuredData: boolean
    hasAuthor: boolean
    hasDate: boolean
    questionHeadings: number
    listCount?: number
    tableCount?: number
    structuredBlocks: number
    answerable: boolean
    hasFaqSchema?: boolean
    hasQapageSchema?: boolean
    hasLlmsTxt?: boolean
    llmsTxtUrl?: string
    llmsTxtStatus?: number
  }
  searchMetrics?: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  topQuery?: {
    query: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  seoScore?: number
  geoScore?: number
  analytics?: {
    sessions: number
    totalUsers: number
    conversions: number
  }
}

export type CrawlResponseObservation = {
  requestedUrl: string
  outcome: 'response'
  finalUrl: string
  status: number
  contentType?: string
  durationMs?: number
  redirectChain?: PageFetchDiagnostics['redirectChain']
} & (
  | { extraction: 'complete' | 'not-applicable' | 'unknown-media-type' }
  | { extraction: 'failed'; extractionError: string }
)

export type CrawlRequestObservation =
  | CrawlResponseObservation
  | {
      requestedUrl: string
      outcome: 'skipped'
      durationMs?: number
      reason: 'robots-disallowed' | 'robots-deferred'
      robotsTxt: NonNullable<CrawlPageSnapshot['robotsTxt']>
      extraction: 'not-applicable'
    }
  | {
      requestedUrl: string
      outcome: 'failure'
      durationMs?: number
      failureKind:
        | 'dns'
        | 'tls'
        | 'timeout'
        | 'redirect-limit'
        | 'aborted'
        | 'unknown'
      error: string
      extraction: 'not-applicable'
    }

export type CrawlRun = {
  id: string
  site: string
  startUrl: string
  createdAt: string
  limit: number
  urlCount: number
}

export type CrawlDiffItem = {
  url: string
  kind: 'added' | 'removed' | 'changed'
  changes: string[]
  before?: Partial<CrawlPageSnapshot>
  after?: Partial<CrawlPageSnapshot>
  recommendation?: CrawlDiffRecommendation
}

export type CrawlDiffRecommendation = {
  severity: 'high' | 'medium' | 'low'
  category:
    | 'status'
    | 'indexability'
    | 'canonical'
    | 'metadata'
    | 'content'
    | 'inventory'
  title: string
  action: string
  confidence: 'high' | 'medium' | 'low'
}

export type CrawlDiffReport = {
  run: CrawlRun
  previousRun?: CrawlRun
  summary: {
    crawled: number
    added: number
    removed: number
    changed: number
    newErrors: number
    indexabilityFlips: number
    highPriorityRecommendations: number
  }
  recommendations: Array<CrawlDiffRecommendation & { url: string }>
  items: CrawlDiffItem[]
  warnings: string[]
}

export type IndexWatchIssueCode =
  | 'canonical_mismatch'
  | 'indexing_blocked_header'
  | 'indexing_blocked_meta'
  | 'inspection_failed'
  | 'inspection_quota_blocked'
  | 'page_fetch_failed'
  | 'robots_disallowed'
  | 'verdict_excluded'
  | 'verdict_invalid'

export type IndexWatchChangeKind =
  | 'baseline'
  | 'changed'
  | 'not-comparable'
  | 'recovery'
  | 'regression'
  | 'unchanged'

export type IndexWatchChange = {
  field:
    | 'googleCanonical'
    | 'indexingState'
    | 'pageFetchState'
    | 'robotsTxtState'
    | 'userCanonical'
    | 'verdict'
  before?: string
  after?: string
}

export type IndexWatchPrevious = {
  inspectedAt: string
  verdict?: string
  coverageState?: string
  indexingState?: string
  robotsTxtState?: string
  pageFetchState?: string
  googleCanonical?: string
  userCanonical?: string
  lastCrawlTime?: string
}

export type IndexWatchItem = {
  rootSite: string
  property: string
  url: string
  inspectedAt: string
  inspectionStatus: 'deferred' | 'failed' | 'quota-blocked' | 'succeeded'
  requestSent: boolean
  indexStatus: 'excluded' | 'indexed' | 'invalid' | 'unknown'
  verdict?: string
  coverageState?: string
  indexingState?: string
  robotsTxtState?: string
  pageFetchState?: string
  googleCanonical?: string
  userCanonical?: string
  lastCrawlTime?: string
  previous?: IndexWatchPrevious
  issueCodes: IndexWatchIssueCode[]
  currentIssue: boolean
  severity: 'high' | 'medium' | 'none'
  changes: IndexWatchChange[]
  changeKind: IndexWatchChangeKind
  changed: boolean
  regression: boolean
  recovery: boolean
  alert: boolean
  errorCode?: string
  errorMessage?: string
  retryAt?: string
}

export type IndexWatchReport = {
  schemaVersion: 1
  methodology: 'index-watch-v2'
  site: string
  generatedAt: string
  dataStatus: 'complete' | 'partial'
  source: {
    type: 'url-inspection-indexed-snapshot'
    property: string
    dailyLimit: number
    languageCode?: string
  }
  summary: {
    requested: number
    unique: number
    attempted: number
    inspected: number
    failed: number
    quotaBlocked: number
    deferred: number
    currentIssues: number
    changed: number
    regressions: number
    recoveries: number
    alerts: number
  }
  caveats: string[]
  warnings: string[]
  items: IndexWatchItem[]
}

export type IndexMonitorPropertyRun = {
  property: string
  inventoryUrls: number
  selectedUrls: number
  attempted: number
  inspected: number
  failed: number
  quotaBlocked: number
  deferred: number
  currentIssues: number
  changed: number
  regressions: number
  recoveries: number
  alerts: number
  sampleUrls: string[]
}

export type IndexMonitorReport = {
  schemaVersion: 1
  methodology: 'index-monitor-v2'
  site: string
  generatedAt: string
  dataStatus: 'complete' | 'partial'
  source: {
    type: 'sitemap-url-inspection-indexed-snapshot'
    sitemaps: string[]
    maxUrls: number
    dailyLimit: number
    inspectLimit: number
    staleAfterDays: number
    failureRetryHours: number
    possiblyTruncated: boolean
    inventoryLimitExceeded: boolean
    omittedUrlsAtLeast: number
    discoveredUrls: number
    invalidUrls: number
  }
  summary: {
    inventoryUrls: number
    properties: number
    dailyCapacity: number
    neverAttempted: number
    neverSucceeded: number
    retryWaiting: number
    fresh: number
    stale: number
    due: number
    selected: number
    unselectedDue: number
    attempted: number
    inspected: number
    failed: number
    quotaBlocked: number
    deferred: number
    currentIssues: number
    changed: number
    regressions: number
    recoveries: number
    alerts: number
    skipped: number
  }
  properties: IndexMonitorPropertyRun[]
  items: IndexWatchItem[]
  caveats: string[]
  warnings: string[]
}

export type CrawlRunRow = {
  id: string
  site_url: string
  start_url: string
  created_at: number
  limit_count: number
  url_count: number
}

export type CrawlPageRow = {
  run_id: string
  url: string
  final_url: string
  status: number
  title?: string | null
  meta_description?: string | null
  canonical?: string | null
  meta_robots?: string | null
  x_robots_tag?: string | null
  h1?: string | null
  indexable: number
  word_count: number
  content_hash: string
  outgoing_internal_count: number
  snapshot_json?: string | null
}

export type IndexWatchRow = {
  id?: string
  root_site_url?: string | null
  property_site_url?: string | null
  verdict?: string | null
  coverage_state?: string | null
  indexing_state?: string | null
  robots_txt_state?: string | null
  page_fetch_state?: string | null
  google_canonical?: string | null
  user_canonical?: string | null
  last_crawl_time?: string | null
  error_code?: string | null
  error_message?: string | null
  inspection_status?: string | null
  inspected_at?: number | null
}

export type LatestCrawlSummaryRow = CrawlRunRow & {
  status_errors: number
  non_indexable: number
  recommendation_count: number
  high_recommendation_count: number
  top_recommendation_url?: string | null
  top_recommendation_title?: string | null
  top_recommendation_action?: string | null
  top_recommendation_severity?: string | null
}
