export interface CreditUsage {
  provider: string
  units: number
  unitLabel: string
  estimatedUsd?: number
  calls: number
  cacheHits?: number
}

export interface ProviderResult<T> {
  data: T
  usage: CreditUsage
  warnings?: string[]
  cached?: boolean
}

export interface ProviderOpts {
  database?: string
  refresh?: boolean
}

export interface KeywordOverview {
  phrase: string
  volume?: number
  cpc?: number
  competition?: number
  difficulty?: number
  intent?: string
  results?: number
}

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

export interface SerpProvider {
  readonly name: string
}

export interface BacklinkProvider {
  readonly name: string
}
