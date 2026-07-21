import type { ProviderSpendNotice } from '../../storage/provider-spend.js'
import type Database from '../../storage/sqlite.js'
import type {
  KeywordDiscoverySource,
  ProviderCacheEvidence,
  ProviderCostEvidence,
  ProviderRequestContext,
  ProviderWarning,
} from '../contracts.js'
import type { ProviderSpendLimits } from '../cost-limits.js'
import type { ProviderFetch } from '../transport.js'
import type { DataForSeoCredentials } from './credentials.js'
import type { DataForSeoDiscoveryResponse } from './discovery-schema.js'
import type { DataForSeoUnitPrice } from './paid-request.js'
import type { DataForSeoKeywordOverviewResponse } from './schema.js'
import type { DataForSeoSerpResponse } from './serp-schema.js'

export type DataForSeoAccountSnapshot = {
  provider: 'dataforseo'
  login: string
  timezone: string | null
  balanceMicros: number | null
  depositedMicros: number | null
  accountDailySpendMicros: number | null
  accountDailySpendPeriod: string | null
  accountDailyLimitMicros: number | null
  keywordOverviewPrice: DataForSeoUnitPrice
  keywordDiscoveryPrices: Record<KeywordDiscoverySource, DataForSeoUnitPrice>
  serpLiveAdvancedPrice: DataForSeoUnitPrice
  serpTaskPostPrice: DataForSeoUnitPrice
  backlinksSubscriptionExpiresAt: string | null
  aiMentionsSubscriptionExpiresAt: string | null
  apiVersion: string | null
  requestCostMicros: number
  taskIds: string[]
  observedAt: string
}

export type DataForSeoClientOptions = {
  fetch?: ProviderFetch
  credentials?: () =>
    | DataForSeoCredentials
    | undefined
    | Promise<DataForSeoCredentials | undefined>
  baseUrl?: string
  timeoutMs?: number
  maxResponseBytes?: number
  now?: () => Date
  database?: Database.Database
  keywordOverviewTtlMs?: number
  keywordDiscoveryTtlMs?: number
  serpTtlMs?: number
  accountPricingTtlMs?: number
  spendLimits?: ProviderSpendLimits
}

export type DataForSeoKeywordOverviewRequest = {
  keywords: string[]
  languageCode: string
  locationCode?: number
  locationName?: string
  includeSerpInfo?: boolean
  includeClickstreamData?: boolean
  refresh?: boolean
  projectId?: string
  reportId: string
  reportRunId: string
}

export type DataForSeoKeywordOverviewSnapshot = {
  response: DataForSeoKeywordOverviewResponse
  observedAt: string
  returnedRows: number
  cache: ProviderCacheEvidence
  cost: ProviderCostEvidence
  spendNotice: ProviderSpendNotice | null
  warnings: ProviderWarning[]
}

export type DataForSeoKeywordDiscoveryRequest = {
  source: KeywordDiscoverySource
  seeds: string[]
  languageCode: string
  locationCode?: number
  locationName?: string
  limit: number
  refresh?: boolean
  context: ProviderRequestContext
}

export type DataForSeoKeywordDiscoverySnapshot = {
  response: DataForSeoDiscoveryResponse
  observedAt: string
  returnedRows: number
  providerTotalRows: number | null
  nextCursor: string | null
  cache: ProviderCacheEvidence
  cost: ProviderCostEvidence
  spendNotice: ProviderSpendNotice | null
  warnings: ProviderWarning[]
}

export type DataForSeoSerpRequest = {
  keyword: string
  languageCode: string
  locationCode?: number
  locationName?: string
  device: 'desktop' | 'mobile'
  depth: number
  refresh?: boolean
  context: ProviderRequestContext
}

export type DataForSeoSerpSnapshot = {
  response: DataForSeoSerpResponse
  observedAt: string
  returnedRows: number
  cache: ProviderCacheEvidence
  cost: ProviderCostEvidence
  spendNotice: ProviderSpendNotice | null
  warnings: ProviderWarning[]
}

export type DataForSeoSerpTaskInput = Omit<
  DataForSeoSerpRequest,
  'refresh' | 'context'
> & { tag: string }

export type DataForSeoSerpTaskPostSnapshot = {
  taskIds: string[]
  taskReceipts: Array<{ providerTaskId: string; tag: string }>
  estimatedCostMicros: number | null
  actualCostMicros: number | null
  spendNotice: ProviderSpendNotice | null
  warnings: ProviderWarning[]
  observedAt: string
}

export type DataForSeoSerpReadyTask = {
  providerTaskId: string
  tag: string | null
}
