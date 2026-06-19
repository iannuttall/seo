export type CrawlPageSnapshot = {
  url: string
  finalUrl: string
  status: number
  contentType?: string
  responseTimeMs?: number
  sizeBytes?: number
  usedJs?: boolean
  fetchSource?: 'cache' | 'network' | 'rendered'
  cacheState?: 'hit' | 'miss' | 'bypass'
  blocked?: boolean
  robotsTxt?: {
    url: string
    allowed: boolean
    matchedLine?: string
  }
  title?: string
  metaDescription?: string
  canonical?: string
  metaRobots?: string
  xRobotsTag?: string
  h1?: string
  h1Count?: number
  h2Count?: number
  h3Count?: number
  indexable: boolean
  indexability?: string
  wordCount: number
  contentHash: string
  contentSample?: string
  lang?: string
  hasViewport?: boolean
  imagesTotal?: number
  imagesMissingAlt?: number
  outgoingInternalCount: number
  outgoingExternalCount?: number
  sampleInternalLinks?: string[]
  sampleExternalLinks?: string[]
  schemaTypes?: string[]
  openGraphTitle?: string
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
    structuredBlocks: number
    answerable: boolean
  }
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

export type IndexWatchItem = {
  url: string
  verdict?: string
  coverageState?: string
  indexingState?: string
  robotsTxtState?: string
  pageFetchState?: string
  googleCanonical?: string
  userCanonical?: string
  lastCrawlTime?: string
  previous?: {
    verdict?: string
    coverageState?: string
    indexingState?: string
    robotsTxtState?: string
  }
  changed: boolean
  alert: boolean
}

export type IndexWatchReport = {
  site: string
  generatedAt: string
  summary: {
    inspected: number
    changed: number
    alerts: number
  }
  items: IndexWatchItem[]
}

export type IndexMonitorPropertyRun = {
  property: string
  inventoryUrls: number
  selectedUrls: number
  inspected: number
  changed: number
  alerts: number
  sampleUrls: string[]
}

export type IndexMonitorReport = {
  site: string
  generatedAt: string
  summary: {
    inventoryUrls: number
    properties: number
    dailyCapacity: number
    selected: number
    inspected: number
    changed: number
    alerts: number
    skipped: number
  }
  properties: IndexMonitorPropertyRun[]
  items: IndexWatchItem[]
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
  verdict?: string | null
  coverage_state?: string | null
  indexing_state?: string | null
  robots_txt_state?: string | null
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
