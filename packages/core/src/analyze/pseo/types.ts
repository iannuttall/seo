import type { PageFetchDiagnostics } from '../../types.js'
import type { PseoQueryPattern } from './query-insights.js'
import type { PseoTemplateCluster } from './templates.js'

export type PseoQueryPageRow = {
  query: string
  page: string
  clicks: number
  impressions: number
  position: number
}

export type PseoPageRow = Omit<PseoQueryPageRow, 'query'>

export type PseoQueryCoverage = {
  method: 'literal-query-term-presence-v1'
  heuristic: true
  query: string
  classification: 'covered' | 'serp-framing-review' | 'body-term-review'
  titleCoverage: number
  h1Coverage: number
  bodyCoverage: number
  missingTerms: string[]
}

export type PseoCrawlTechnicalStatus =
  | 'ok'
  | 'redirected'
  | 'http-error'
  | 'blocked'
  | 'noindex'
  | 'canonical-mismatch'
  | 'fetch-error'

export type PseoCrawlSample = {
  url: string
  finalUrl?: string
  status?: number
  title?: string
  h1?: string
  metaDescription?: string
  metaRobots?: string
  xRobotsTag?: string
  canonical?: string
  wordCount?: number
  technicalStatus: PseoCrawlTechnicalStatus
  queryCoverage?: PseoQueryCoverage
  fetchDiagnostics?: PageFetchDiagnostics
  warnings: string[]
  warning?: string
}

export type PseoIndexStatus = 'indexed' | 'excluded' | 'invalid' | 'unknown'

export type PseoInspectionSample = {
  url: string
  indexStatus: PseoIndexStatus
  verdict?: string
  coverageState?: string
  indexingState?: string
  robotsTxtState?: string
  pageFetchState?: string
  lastCrawlTime?: string
  userCanonical?: string
  googleCanonical?: string
  warning?: string
}

export type PseoEntityFit = {
  method: 'any-path-variable-term-v1'
  heuristic: true
  checkedQueries: number
  matchedQueries: number
  impressionShare: number
  weakExamples: Array<{
    url: string
    query: string
    pathTerms: string[]
    impressions: number
  }>
}

export type PseoTemplateMetrics = {
  clicks: number
  impressions: number
  ctr: number
  position: number
  impressionsPerUrl: number
  clicksPerUrl: number
  retainedQueryImpressions: number
  queryCount: number
  pageCountWithGsc: number
  zeroClickImpressions: number
  entityFit: PseoEntityFit
  queryPatterns: PseoQueryPattern[]
  topQueries: Array<{
    query: string
    clicks: number
    impressions: number
    position: number
  }>
}

export type PseoAuditTemplate = PseoTemplateCluster & {
  population: {
    discoveredUrls: number
    gscVisibleUrls: number
    untestedUrls: number
    sampleSelection: 'page-demand-stratified-url-v1'
  }
  metrics: PseoTemplateMetrics
  crawl: {
    requested: number
    attempted: number
    succeeded: number
    failed: number
    usable: number
    samples: PseoCrawlSample[]
    wordCount?: { min: number; median: number; max: number }
    medianWordCount?: number
    weakQueryCoverage: number
    duplicateTitles: number
    duplicateMetaDescriptions: number
    blockedOrFailed: number
  }
  inspection: {
    requested: number
    attempted: number
    succeeded: number
    failed: number
    samples: PseoInspectionSample[]
    indexed: number
    notIndexed: number
    unknown: number
    warnings: number
  }
  evidence: string[]
  verdict:
    | 'healthy'
    | 'opportunity'
    | 'index-risk'
    | 'content-review'
    | 'crawl-risk'
    | 'inconclusive'
    | 'no-data'
  confidence: 'medium' | 'low'
  recommendation: string
}

export type PseoAuditReport = {
  schemaVersion: 1
  methodology: 'pseo-audit-v2'
  site: string
  generatedAt: string
  rangeDays: number
  range: { startDate: string; endDate: string }
  dataStatus: 'complete' | 'partial' | 'empty' | 'filtered'
  source: {
    searchAnalytics: {
      pageRows: number
      queryPageRows: number
      maxRowsPerRequest: number
      pageRowsPossiblyTruncated: boolean
      queryPageRowsPossiblyTruncated: boolean
      dimensions: {
        page: ['page']
        queryPage: ['query', 'page']
      }
      searchType: 'web'
      dataState: 'final'
      aggregation: 'auto'
    }
    sitemaps: {
      requested: number
      discoveredUrls: number
      maxUrlsPerSitemap: number
    }
  }
  selection: {
    inputQueryPageRows: number
    invalidQueryPageRows: number
    lowActionabilityRows: number
    brandRows: number
    retainedQueryPageRows: number
    inputPageRows: number
    invalidPageRows: number
    retainedPageRows: number
    discoveredUrls: number
    eligibleTemplates: number
    returnedTemplates: number
    templateLimit: number
    minimumTemplateUrls: number
    minimumTemplateShare: number
    minimumTemplateImpressions: number
    templateOrder: 'page-impressions-clicks-url-count-signature-v1'
  }
  summary: {
    sitemapUrls: number
    gscPages: number
    templates: number
    clicks: number
    impressions: number
    crawlAttempts: number
    crawledUrls: number
    crawlFailures: number
    inspectionAttempts: number
    inspectedUrls: number
    inspectionFailures: number
  }
  caveats: string[]
  templates: PseoAuditTemplate[]
  warnings: string[]
}
