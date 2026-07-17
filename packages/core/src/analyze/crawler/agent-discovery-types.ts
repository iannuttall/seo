export type AgentReadinessProfile =
  | 'content'
  | 'api'
  | 'application'
  | 'commerce'

export type AgentDiscoveryDataStatus = 'complete' | 'partial' | 'unavailable'

export type AgentRepresentationResponse = {
  requestedUrl: string
  finalUrl?: string
  status?: number
  contentType?: string
  bytes?: number
  sha256?: string
  canonicalUrl?: string
  alternateUrl?: string
  varyAccept: boolean
  markdownTokens?: number
  contentSignal?: string
  error?: string
}

export type MarkdownQualityObservation = {
  frontmatterTitle: boolean
  h1Count: number
  codeFenceBalanced: boolean
  tableRows: number
  links: number
  wordCount: number
  rawHtmlTags: number
  rawSvgTags: number
  rawScriptTags: number
  rawStyleTags: number
  suspiciousConcatenations: number
  repeatedLines: number
  sourceWordCount: number
  wordRetentionRatio: number | null
  introductoryCopyRetained: boolean | null
  navigationOnly: boolean
}

export type MarkdownAlternateObservation = {
  htmlUrl: string
  advertisedUrls: string[]
  htmlAlternateUnique: boolean
  httpAlternateUrls: string[]
  explicit?: AgentRepresentationResponse
  negotiated?: AgentRepresentationResponse
  repeated?: AgentRepresentationResponse
  explicitMatchesNegotiated: boolean | null
  repeatedHashStable: boolean | null
  markdownCanonicalMatchesHtml: boolean | null
  quality?: MarkdownQualityObservation
}

export type AgentSkillObservation = {
  name?: string
  url?: string
  status?: number
  contentType?: string
  declaredDigest?: string
  observedDigest?: string
  digestMatches: boolean | null
  frontmatterValid: boolean | null
  sameOrigin: boolean
  cors?: string
  error?: string
}

export type AgentEndpointObservation = {
  id: string
  url: string
  status?: number
  exists: boolean
  contentType?: string
  validJson?: boolean
  presentFields?: string[]
  missingFields?: string[]
  error?: string
}

export type AgentLinkHeaderEntry = {
  url: string
  rel: string[]
  type?: string
}

export type AgentLinkHeaderObservation = {
  url: string
  status?: number
  entries: AgentLinkHeaderEntry[]
  registeredRels: string[]
  emergingRels: string[]
  error?: string
}

export type AgentEndpointDiscovery = {
  linkHeader: AgentLinkHeaderObservation
  endpoints: AgentEndpointObservation[]
}

export type LlmsTxtLinkObservation = {
  label: string
  url: string
  sameOrigin: boolean
  status?: number
  finalUrl?: string
  redirected: boolean
  indexableTarget?: boolean
  error?: string
}

export type CrawlAgentDiscovery = {
  profile: 'content'
  profileApplicability: Record<
    AgentReadinessProfile,
    { status: 'evaluated' | 'notApplicable'; reason: string }
  >
  dataStatus: AgentDiscoveryDataStatus
  markdownAlternates: {
    eligibleHtmlPages: number
    advertisedPages: number
    evaluatedPages: number
    exactByteMatches: number
    stableResponses: number
    pages: MarkdownAlternateObservation[]
  }
  contentNegotiation: {
    qZeroHonoured: boolean | null
    qZeroStatus?: number
    qZeroContentType?: string
    error?: string
  }
  routeManifest: {
    url: string
    status?: number
    valid: boolean
    declaredHtmlRoutes: string[]
    declaredMarkdownRoutes: string[]
    missingHtmlRoutes: string[]
    missingMarkdownRoutes: string[]
    orphanMarkdownRoutes: string[]
    error?: string
  }
  agentSkills: {
    indexUrl: string
    status?: number
    contentType?: string
    cors?: string
    validIndex: boolean
    skills: AgentSkillObservation[]
    error?: string
  }
  llmsTxt: {
    url: string
    exists: boolean
    status?: number
    contentType?: string
    bytes?: number
    sha256?: string
    repeatedHashStable: boolean | null
    headingCount: number
    totalParsedLinks: number
    linkLimitReached: boolean
    links: LlmsTxtLinkObservation[]
    invalidLinks: string[]
    duplicateLinks: string[]
    offSiteLinks: string[]
    redirectedLinks: string[]
    nonIndexableLinks: string[]
    missingCrawlRoutes: string[]
    oversized: boolean
    error?: string
  }
  contentSignals: {
    htmlValues: string[]
    markdownValues: string[]
    missingHtmlPages: number
    missingMarkdownPages: number
    consistent: boolean | null
  }
  endpointDiscovery?: AgentEndpointDiscovery
  protocolVariants: {
    http: {
      url: string
      status?: number
      location?: string
      permanentRedirectToHttps: boolean | null
      error?: string
    }
    www: {
      url: string
      status?: number
      location?: string
      redirectsToPreferredHost: boolean | null
      error?: string
    }
    hstsOnStartPage: boolean | null
  }
  warnings: string[]
}
