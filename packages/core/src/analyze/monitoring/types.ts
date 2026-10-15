import type { ContentSketch } from '../../extract/content-sketch.js'
import type {
  AccessBlockEvidence,
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
  auditScope?: 'full' | 'status'
  accessBlock?: AccessBlockEvidence
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
  canonicalStatus?: import('../../extract/canonical.js').CanonicalEvidence['status']
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
    | 'meta-refresh'
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
  contentSketch?: ContentSketch
  softAuthenticationGate?: {
    kind: 'login-form'
    indicators: string[]
    formActionPath?: string
  }
  metaRefresh?: {
    targetUrl: string
    delaySeconds: number
  }
  tabbedContent?: {
    groups: number
    panels: number
    retainedPanels: number
    truncated: boolean
    panelSketches: Array<{
      label?: string
      sketch: ContentSketch
    }>
  }
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
  markdownAlternates?: string[]
  describedBy?: string[]
  externalLinkChecks?: ExternalLinkCheck[]
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
  analytics?: {
    sessions: number
    totalUsers?: number
    conversions?: number
  }
}

export type ExternalLinkCheckState =
  | 'available'
  | 'confirmed-broken'
  | 'transient'
  | 'provider-blocked'
  | 'rate-limited'
  | 'method-rejected'
  | 'unavailable'

export type ExternalLinkCheckAttempt = {
  method: 'HEAD' | 'GET'
  status?: number
  error?: string
}

export type ExternalLinkCheck = {
  url: string
  status?: number
  error?: string
  state?: ExternalLinkCheckState
  attempts?: ExternalLinkCheckAttempt[]
}

export type CrawlResponseObservation = {
  requestedUrl: string
  outcome: 'response'
  finalUrl: string
  status: number
  contentType?: string
  durationMs?: number
  redirectChain?: PageFetchDiagnostics['redirectChain']
  accessBlock?: AccessBlockEvidence
  robotsTxt?: NonNullable<CrawlPageSnapshot['robotsTxt']>
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
      outcome: 'skipped'
      durationMs?: number
      reason: 'origin-backpressure'
      error: string
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
