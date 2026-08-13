export const SEO_PROVIDER_API_VERSION = 1 as const

export type SeoProviderApiVersion = typeof SEO_PROVIDER_API_VERSION

export type SeoProviderKind =
  | 'traffic-analytics'
  | 'search-results'
  | 'keyword-data'
  | 'domain-data'
  | 'link-data'
  | 'local-search'
  | 'ai-data'
  | 'other'

export type SeoProviderCapabilityId =
  | 'landing-page-visits'
  | 'keyword-metrics'
  | 'keyword-discovery'
  | 'serp-snapshot'
  | 'domain-overview'
  | 'ranked-keywords'
  | 'relevant-pages'
  | 'serp-competitors'
  | 'link-summary'
  | 'referring-domains'
  | 'backlinks'
  | 'domain-rating'
  | 'local-search'
  | 'ai-mentions'
  | 'ai-prompt-observation'

export type SeoProviderConnectionField = {
  id: string
  label: string
  description?: string
  kind: 'account' | 'secret'
  required?: boolean
  envVar?: string
}

export type SeoProviderRequest = {
  operation: string
  url: string
  method?: 'GET' | 'POST'
  headers?: Readonly<Record<string, string>>
  body?: string
}

export interface SeoProviderRuntime {
  requestJson(input: SeoProviderRequest): Promise<unknown>
  now(): string
}

export type SeoProviderConnection = {
  account: Readonly<Record<string, string>>
  credentials: Readonly<Record<string, string>>
}

export type SeoProviderConnectionAdapter = {
  fields: readonly SeoProviderConnectionField[]
  normalizeAccount?(
    account: Readonly<Record<string, string>>,
  ): Record<string, string>
  verify(
    connection: SeoProviderConnection,
    runtime: SeoProviderRuntime,
  ): Promise<void>
  verificationNotice?: string
}

export type SeoLandingPageVisitRow = {
  path: string
  visits: number
}

export type SeoLandingPageVisitsResult = {
  metric: 'landing-page-visits'
  rows: readonly SeoLandingPageVisitRow[]
  returnedRows: number
  availableRows?: number
  retainedRowLimit: number
  retainedRowLimitReached: boolean
  dataStatus: 'complete' | 'partial'
  qualityWarnings: readonly string[]
}

export type SeoLandingPageVisitsCapability = {
  id: 'landing-page-visits'
  run(
    input: SeoProviderConnection & {
      startDate: string
      endDate: string
      limit: number
    },
    runtime: SeoProviderRuntime,
  ): Promise<SeoLandingPageVisitsResult>
}

export type SeoSearchMarket = {
  searchEngine: 'google' | 'bing'
  countryCode: string
  languageCode: string
  device?: 'desktop' | 'mobile'
  location?: { code?: number; name?: string }
}

export type SeoSerpOrganicResult = {
  rankGroup: number
  rankAbsolute: number
  page: number
  domain: string
  url: string
  title: string | null
  description: string | null
  isFeaturedSnippet: boolean | null
}

export type SeoSerpLocalPackResult = {
  rankGroup: number
  rankAbsolute: number
  page: number | null
  title: string
  domain: string | null
  url: string | null
  cid: string | null
  phone: string | null
  description: string | null
  isPaid: boolean | null
  rating: {
    type: string | null
    value: number | null
    votesCount: number | null
    maximum: number | null
  } | null
}

export type SeoSerpSnapshotResult = {
  observedAt: string
  effectiveKeyword: string
  searchEngineDomain: string | null
  checkUrl: string | null
  resultCount: number | null
  pagesCount: number | null
  features: readonly string[]
  organicResults: readonly SeoSerpOrganicResult[]
  localPack: {
    present: boolean
    returnedRows: number
    retainedRows: number
    invalidRows: number
    results: readonly SeoSerpLocalPackResult[]
  }
  coverage: {
    returnedRows: number
    retainedRows: number
    invalidRows: number
    providerTotalRows: number | null
    completeness: 'complete' | 'partial' | 'capped'
    nextCursor: string | null
  }
  request: {
    endpoint: string
    filters: Readonly<Record<string, string | number | boolean>>
    sort: readonly string[]
  }
  cost: {
    estimatedMicros: number | null
    actualMicros: number | null
    taskIds: readonly string[]
    native?: {
      unit: string
      estimatedUnits: number | null
      actualUnits: number | null
      remainingBefore: number | null
    }
  }
  qualityWarnings: readonly {
    code: string
    message: string
    field?: string
    row?: number
  }[]
}

export type SeoSerpSnapshotCapability = {
  id: 'serp-snapshot'
  defaultDepth: number
  maxDepth: number
  maxRequests: number
  markets: readonly {
    searchEngines?: readonly SeoSearchMarket['searchEngine'][]
    countryCodes?: readonly string[]
    languageCodes?: readonly string[]
    devices?: readonly NonNullable<SeoSearchMarket['device']>[]
    location?: 'any' | 'country-only' | 'canonical'
  }[]
  estimateCostMicros(input: {
    keyword: string
    market: SeoSearchMarket
    depth: number
  }): number
  estimateRequests(input: {
    keyword: string
    market: SeoSearchMarket
    depth: number
  }): number
  run(
    input: SeoProviderConnection & {
      keyword: string
      market: SeoSearchMarket
      depth: number
    },
    runtime: SeoProviderRuntime,
  ): Promise<SeoSerpSnapshotResult>
}

export type SeoProviderCapabilityAdapter =
  | SeoLandingPageVisitsCapability
  | SeoSerpSnapshotCapability

export type SeoProviderJson =
  | string
  | number
  | boolean
  | null
  | readonly SeoProviderJson[]
  | { readonly [key: string]: SeoProviderJson }

export type SeoProviderJsonSchema = Readonly<Record<string, SeoProviderJson>>

export type SeoProviderActionAdapter = {
  id: string
  description: string
  inputSchema: SeoProviderJsonSchema
  outputSchema: SeoProviderJsonSchema
  cacheTtlMs?: number
  run(
    input: SeoProviderConnection & {
      params: Readonly<Record<string, SeoProviderJson>>
    },
    runtime: SeoProviderRuntime,
  ): Promise<unknown>
}

export type SeoProviderRegistration = {
  id: string
  displayName: string
  description: string
  kinds: readonly SeoProviderKind[]
  connection: SeoProviderConnectionAdapter
  capabilities: readonly SeoProviderCapabilityAdapter[]
  actions?: readonly SeoProviderActionAdapter[]
}

export interface SeoProviderHost {
  readonly apiVersion: SeoProviderApiVersion
  registerProvider(provider: SeoProviderRegistration): void
}

export type SeoProviderActivate = (
  host: SeoProviderHost,
) => void | Promise<void>

// Compatibility names for provider packages built against the first draft.
export type SeoAnalyticsConnection = SeoProviderConnection
export type SeoAnalyticsLandingPageResult = SeoLandingPageVisitsResult
