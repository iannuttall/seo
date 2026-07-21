import { z } from 'zod'

export const providerIdSchema = z.enum(['dataforseo', 'semrush', 'ahrefs'])
export type ProviderId = z.infer<typeof providerIdSchema>

export const providerCapabilitySchema = z.enum([
  'keyword-metrics',
  'keyword-discovery',
  'serp-snapshot',
  'domain-overview',
  'ranked-keywords',
  'relevant-pages',
  'serp-competitors',
  'link-summary',
  'referring-domains',
  'backlinks',
  'domain-rating',
  'local-search',
  'ai-mentions',
  'ai-prompt-observation',
])
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>

export const searchMarketSchema = z
  .object({
    searchEngine: z.enum(['google', 'bing']).default('google'),
    countryCode: z.string().trim().min(2).max(2).toUpperCase(),
    languageCode: z.string().trim().min(2).max(35).toLowerCase(),
    location: z
      .object({
        code: z.number().int().positive().optional(),
        name: z.string().trim().min(1).max(500).optional(),
      })
      .refine((value) => value.code !== undefined || value.name !== undefined, {
        message: 'A location needs a provider code or canonical name.',
      })
      .optional(),
    device: z.enum(['desktop', 'mobile']).optional(),
  })
  .strict()
export type SearchMarket = z.infer<typeof searchMarketSchema>

export type ProviderValue<T> =
  | { state: 'observed'; value: T }
  | {
      state: 'missing' | 'unavailable' | 'invalid'
      value: null
      reason: string
    }

export function observedValue<T>(value: T): ProviderValue<T> {
  return { state: 'observed', value }
}

export function unavailableValue<T>(
  state: 'missing' | 'unavailable' | 'invalid',
  reason: string,
): ProviderValue<T> {
  return { state, value: null, reason }
}

export type ProviderWarning = {
  code: string
  message: string
  field?: string
  row?: number
}

export type ProviderCoverage = {
  requestedRows: number | null
  returnedRows: number | null
  retainedRows: number | null
  invalidRows: number
  providerTotalRows: number | null
  completeness:
    | 'complete'
    | 'partial'
    | 'capped'
    | 'filtered'
    | 'unavailable'
    | 'invalid'
    | 'unknown'
  nextCursor: string | null
}

export type ProviderCacheEvidence = {
  status: 'hit' | 'miss' | 'bypass'
  storedAt: string | null
  expiresAt: string | null
}

export type ProviderCostEvidence = {
  currency: 'USD'
  estimatedMicros: number | null
  actualMicros: number | null
  taskIds: string[]
}

export type ProviderRequestEvidence = {
  operation: string
  endpoint: string
  limit: number | null
  filters: Record<string, string | number | boolean>
  sort: string[]
}

export type ProviderEvidence<T> = {
  schemaVersion: 1
  provider: ProviderId
  capability: ProviderCapability
  data: T
  observedAt: string
  market: SearchMarket
  coverage: ProviderCoverage
  cache: ProviderCacheEvidence
  cost: ProviderCostEvidence
  request: ProviderRequestEvidence
  warnings: ProviderWarning[]
}

export type ProviderCapabilitySupport = {
  capability: ProviderCapability
  status: 'available' | 'unavailable'
  reason?: string
  markets: 'all' | readonly ProviderMarketSupport[]
}

export type ProviderMarketSupport = {
  searchEngines?: readonly SearchMarket['searchEngine'][]
  countryCodes?: readonly string[]
  languageCodes?: readonly string[]
  devices?: readonly NonNullable<SearchMarket['device']>[]
  location?: 'any' | 'country-only' | 'canonical'
}

export interface ProviderAdapter {
  readonly provider: ProviderId
  readonly capabilitySupport: readonly ProviderCapabilitySupport[]
}

export type KeywordMetric = {
  keyword: string
  monthlySearchVolume: ProviderValue<number>
  cpcUsd: ProviderValue<number>
  paidCompetition: ProviderValue<number>
  keywordDifficulty: ProviderValue<number>
  intent: ProviderValue<string>
  resultCount: ProviderValue<number>
}

export type KeywordMetricsRequest = {
  keywords: string[]
  market: SearchMarket
  refresh?: boolean
}

export interface KeywordMetricsProvider extends ProviderAdapter {
  keywordMetrics(
    input: KeywordMetricsRequest,
  ): Promise<ProviderEvidence<KeywordMetric[]>>
}

export type KeywordIdea = KeywordMetric & {
  seed: string
  source: string
}

export type KeywordDiscoveryRequest = {
  seeds: string[]
  market: SearchMarket
  limit: number
  refresh?: boolean
}

export interface KeywordDiscoveryProvider extends ProviderAdapter {
  discoverKeywords(
    input: KeywordDiscoveryRequest,
  ): Promise<ProviderEvidence<KeywordIdea[]>>
}
