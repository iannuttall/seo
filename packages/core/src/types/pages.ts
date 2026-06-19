export interface GscRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface PageFetchResult {
  url: string
  finalUrl: string
  status: number
  headers: Record<string, string>
  html: string
  usedJs: boolean
  diagnostics: PageFetchDiagnostics
  warnings: string[]
  robotsTxt?: {
    url: string
    allowed: boolean
    matchedLine?: string
  }
}

export interface PageFetchDiagnostics {
  source: 'cache' | 'network' | 'rendered'
  cache: 'hit' | 'miss' | 'bypass'
  fetched: boolean
  rendered: boolean
  blocked: boolean
  durationMs: number
  retries: number
  rateLimit: {
    host: string
    concurrency: number
    intervalCap: number
    intervalMs: number
  }
  backpressure?: {
    host: string
    status: 'ok' | 'slowed' | 'stopped'
    reason?: string
    delayMs: number
    cooldownUntil?: string
    consecutiveSlow: number
    consecutiveBlocked: number
    consecutiveErrors: number
    recentP95Ms?: number
  }
  robotsTxt?: {
    url: string
    cache: 'hit' | 'miss' | 'bypass'
    allowed: boolean
  }
  redirectChain?: Array<{
    url: string
    status: number
    location?: string
  }>
}

export interface CoverageField {
  phraseCount: number
  matchedTerms: string[]
  missingTerms: string[]
  termCoverage: number
}

export type QueryContentClassification =
  | 'covered'
  | 'serp-framing'
  | 'content-gap'
  | 'technical-check'
  | 'fetch-failed'

export type QueryContentSignal =
  | 'redirected'
  | 'exact-phrase-missing'
  | 'title-gap'
  | 'h1-gap'
  | 'body-gap'
  | 'blocked'

export interface QueryContentCoverage {
  verifiedAt: string
  query: string
  url: string
  finalUrl?: string
  status: 'verified' | 'failed'
  error?: string
  wordCount?: number
  fetchDiagnostics?: PageFetchDiagnostics
  contentGapScore: number
  queryTerms: string[]
  fields: {
    title: CoverageField
    h1: CoverageField
    metaDescription: CoverageField
    mainContent: CoverageField
  }
  classification: QueryContentClassification
  signals: QueryContentSignal[]
  recommendation: string
  summary: string
}

export interface ExtractedPage {
  url: string
  finalUrl: string
  title?: string
  metaDescription?: string
  metaRobots?: string
  xRobotsTag?: string
  canonical?: string
  lang?: string
  hasViewport: boolean
  headings: Array<{ level: number; text: string }>
  links: Array<{ href: string; text: string; rel: string[]; internal: boolean }>
  hreflang: Array<{ hreflang: string; href: string }>
  jsonLd: unknown[]
  schemaTypes: string[]
  openGraph: Record<string, string>
  twitter: Record<string, string>
  author?: string
  hasAuthor: boolean
  hasDate: boolean
  imagesTotal: number
  imagesMissingAlt: number
  oversizedImageCandidates: Array<{
    src: string
    width?: number
    height?: number
    detectedFrom: string
  }>
  mixedContentUrls: string[]
  semanticHtml: boolean
  questionHeadings: number
  listCount: number
  tableCount: number
  structuredBlocks: number
  answerable: boolean
  contentText: string
  excerpt?: string
  wordCount: number
  warnings: string[]
}
