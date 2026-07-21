/** @deprecated Use ProviderCostEvidence from providers/contracts. */
export interface CreditUsage {
  provider: string
  units: number
  unitLabel: string
  estimatedUsd?: number
  calls: number
  cacheHits?: number
}

/** @deprecated Use ProviderEvidence from providers/contracts. */
export interface ProviderResult<T> {
  data: T
  usage: CreditUsage
  warnings?: string[]
  cached?: boolean
}

/** @deprecated Use a capability-specific request type. */
export interface ProviderOpts {
  database?: string
  refresh?: boolean
}

/** @deprecated Use KeywordMetric from providers/contracts. */
export interface KeywordOverview {
  phrase: string
  volume?: number
  cpc?: number
  competition?: number
  difficulty?: number
  intent?: string
  results?: number
}

/** @deprecated Use a capability-specific row type from providers/contracts. */
export interface KeywordRow {
  phrase: string
  volume?: number
  difficulty?: number
  cpc?: number
  competition?: number
  url?: string
  domain?: string
  position?: number
}

/**
 * @deprecated Use the small capability interfaces from providers/contracts.
 * This compatibility contract remains until the registered reports replace
 * the provider-specific MCP passthrough.
 */
export interface KeywordDataProvider {
  readonly name: string
  readonly capabilities: {
    overview?: boolean
    batchOverview?: boolean
    related?: boolean
    broadMatch?: boolean
    questions?: boolean
    difficulty?: boolean
    urlKeywords?: boolean
    domainKeywords?: boolean
    maxBatchSize?: number
    supportsHistorical?: boolean
  }
  keywordOverview(
    phrase: string,
    opts?: ProviderOpts,
  ): Promise<ProviderResult<KeywordOverview>>
  batchKeywordOverview?(
    phrases: string[],
    opts?: ProviderOpts,
  ): Promise<ProviderResult<KeywordOverview[]>>
  relatedKeywords?(
    phrase: string,
    opts?: ProviderOpts,
  ): Promise<ProviderResult<KeywordRow[]>>
  questions?(
    phrase: string,
    opts?: ProviderOpts,
  ): Promise<ProviderResult<KeywordRow[]>>
  keywordDifficulty?(
    phrases: string[],
    opts?: ProviderOpts,
  ): Promise<ProviderResult<{ phrase: string; kd: number }[]>>
  domainKeywords?(
    domain: string,
    opts?: ProviderOpts,
  ): Promise<ProviderResult<KeywordRow[]>>
  urlKeywords?(
    url: string,
    opts?: ProviderOpts,
  ): Promise<ProviderResult<KeywordRow[]>>
  checkBalance?(): Promise<{
    remaining: number
    unit: string
    resetAt?: string
  }>
}

/** @deprecated Use a capability-specific provider contract. */
export interface SerpProvider {
  readonly name: string
}

/** @deprecated Use a capability-specific provider contract. */
export interface BacklinkProvider {
  readonly name: string
}
