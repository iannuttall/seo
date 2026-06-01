import { z } from 'zod'

export const siteSchema = z.object({
  siteUrl: z.string(),
  displayName: z.string().optional(),
  permission: z.string().optional(),
  addedAt: z.number().int().optional(),
  isDefault: z.boolean().optional(),
})

export const providerPreferenceSchema = z.enum(['cheap', 'authoritative'])

export const configSchema = z.object({
  defaultSite: z.string().optional(),
  sites: z.array(siteSchema).default([]),
  providers: z
    .object({
      semrushApiKey: z.string().optional(),
      dataForSeoLogin: z.string().optional(),
      dataForSeoPassword: z.string().optional(),
      prefer: providerPreferenceSchema.default('cheap'),
    })
    .default({ prefer: 'cheap' }),
  security: z
    .object({
      useKeychain: z.boolean().default(false),
    })
    .default({ useKeychain: false }),
  auth: z
    .object({
      sharedClientId: z.string().optional(),
      sharedClientSecret: z.string().optional(),
    })
    .default({}),
})

export type AppConfig = z.infer<typeof configSchema>

export const tokenSchema = z.object({
  provider: z.literal('google'),
  account_email: z.string().email(),
  scope: z.string(),
  token_type: z.string(),
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_at: z.number().int(),
  obtained_at: z.number().int(),
  client_source: z.enum(['shared', 'byo']),
})

export type StoredTokens = z.infer<typeof tokenSchema>

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
  warnings: string[]
  robotsTxt?: {
    url: string
    allowed: boolean
    matchedLine?: string
  }
}

export interface ExtractedPage {
  url: string
  finalUrl: string
  title?: string
  metaDescription?: string
  metaRobots?: string
  xRobotsTag?: string
  canonical?: string
  headings: Array<{ level: number; text: string }>
  links: Array<{ href: string; text: string; rel: string[]; internal: boolean }>
  jsonLd: unknown[]
  openGraph: Record<string, string>
  twitter: Record<string, string>
  author?: string
  contentText: string
  excerpt?: string
  wordCount: number
  warnings: string[]
}

export interface Recommendation {
  principle: string
  evidenceRef: string
  action: string
  effort: 'S' | 'M' | 'L'
  confidence: 'high' | 'medium' | 'low'
  impactEstimate?: string
}

export interface AuditPageReport {
  url: string
  fetchedAt: string
  page: ExtractedPage
  metrics?: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  issues: Array<{
    code: string
    title: string
    detail: string
    principle: string
    evidenceRef: string
    severity: 'low' | 'medium' | 'high'
  }>
  recommendations: Recommendation[]
  warnings: string[]
}

export interface SecondPageItem {
  url: string
  primaryQuery: string
  position: number
  impressions: number
  ctr: number
  coverage: {
    inTitleExact: boolean
    inMeta: boolean
    inH1: boolean
    inFirst100Words: boolean
    inSlug: boolean
    bodyCount: number
  }
  recommendations: Recommendation[]
}

export interface SecondPageReport {
  site: string
  range: number
  generatedAt: string
  items: SecondPageItem[]
  ledgerSummary: string
  warnings: string[]
}

export interface QueryCluster {
  label: string
  intent:
    | 'informational'
    | 'commercial'
    | 'transactional'
    | 'navigational'
    | 'mixed'
  queries: Array<{
    query: string
    impressions: number
    clicks: number
    position: number
  }>
}

export interface CacheStats {
  dbPath: string
  sizeBytes: number
  counts: Record<string, number>
}
