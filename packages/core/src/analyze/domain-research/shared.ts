import { resolve } from 'node:path'
import { SeoError } from '../../errors.js'
import { querySearchAnalytics } from '../../gsc/client.js'
import { finalGscDateRange } from '../../gsc/dates.js'
import type {
  ProviderAdapter,
  ProviderCapability,
  ProviderId,
  ProviderValue,
  SearchMarket,
} from '../../providers/contracts.js'
import {
  providerIdSchema,
  searchMarketSchema,
} from '../../providers/contracts.js'
import { readDataForSeoCredentials } from '../../providers/dataforseo/credentials.js'
import { DataForSeoDomainResearchProvider } from '../../providers/dataforseo/domain-research.js'
import type {
  DomainOverviewProvider,
  RankedKeywordsProvider,
  RankingPagesProvider,
  ResearchImportSource,
  SerpCompetitorsProvider,
} from '../../providers/domain-contracts.js'
import { ProviderError } from '../../providers/errors.js'
import { ResearchImportProvider } from '../../providers/imports/research-provider.js'
import {
  MAX_RESEARCH_ROW_LIMIT,
  researchImportRowLimit,
} from '../../providers/imports/research-rows.js'
import {
  type ProviderCandidate,
  resolveProvider,
} from '../../providers/resolver.js'
import type { GscRow } from '../../types.js'
import type { DomainResearchDataStatus } from '../domain-research-contract.js'

export const MAX_GSC_DOMAIN_ROWS = 100_000
export const DEFAULT_DOMAIN_DAYS = 28

export type DomainResearchDependencies = {
  candidates?: readonly ProviderCandidate[]
  searchAnalytics?: typeof querySearchAnalytics
  now?: () => Date
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function normalizedKeyword(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase()
}

export function normalizeDomain(value: string): string {
  const raw = value
    .trim()
    .toLowerCase()
    .replace(/^sc-domain:/u, '')
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const host = url.hostname.replace(/^www\./u, '').replace(/\.$/u, '')
    if (!host?.includes('.') || host.length > 253) throw new Error()
    return host
  } catch {
    throw new SeoError('INVALID_INPUT', 'Use a valid domain.')
  }
}

export function siteMatchesDomain(site: string, domain: string): boolean {
  const siteDomain = normalizeDomain(site)
  const target = normalizeDomain(domain)
  return siteDomain === target || siteDomain.endsWith(`.${target}`)
}

export function validatedMarket(value: SearchMarket): SearchMarket {
  const parsed = searchMarketSchema.safeParse(value)
  if (!parsed.success)
    throw new SeoError('INVALID_INPUT', 'Use a valid market.')
  if (parsed.data.location) {
    throw new SeoError(
      'INVALID_INPUT',
      'Domain research uses country-level market data. Omit location and run a live result report for local evidence.',
    )
  }
  return parsed.data
}

export function validatedProvider(value?: ProviderId): ProviderId | undefined {
  if (!value) return undefined
  const parsed = providerIdSchema.safeParse(value)
  if (!parsed.success) {
    throw new SeoError('INVALID_INPUT', 'Use a supported research provider.')
  }
  return parsed.data
}

export function researchFilesDependencies(input: {
  sources?: ResearchImportSource[]
  provider?: ProviderId
  dependencies: DomainResearchDependencies
  now?: Date
}): {
  provider: ProviderId | undefined
  dependencies: DomainResearchDependencies
} {
  if (!input.sources) {
    return {
      provider: validatedProvider(input.provider),
      dependencies: input.dependencies,
    }
  }
  if (input.sources.length < 1 || input.sources.length > 4) {
    throw new SeoError(
      'INVALID_INPUT',
      'Use one to four ranked-keyword research files.',
    )
  }
  const sourceProvider = input.sources[0]?.provider
  if (
    !sourceProvider ||
    input.sources.some((source) => source.provider !== sourceProvider)
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'All research files in one report must come from the same provider.',
    )
  }
  const validatedSourceProvider = validatedProvider(sourceProvider)
  if (!validatedSourceProvider) {
    throw new SeoError('INVALID_INPUT', 'Use a supported research provider.')
  }
  if (input.provider && input.provider !== validatedSourceProvider) {
    throw new SeoError(
      'INVALID_INPUT',
      'The selected provider must match the research file provider.',
    )
  }
  if (input.sources.some((source) => source.dataset !== 'ranked-keywords')) {
    throw new SeoError(
      'INVALID_INPUT',
      'The research file dataset must be ranked-keywords.',
    )
  }
  const paths = input.sources.map((source) => resolve(source.file))
  if (new Set(paths).size !== paths.length) {
    throw new SeoError(
      'INVALID_INPUT',
      'Use each research file once in a report.',
    )
  }
  const requestedRows = input.sources.reduce(
    (total, source) => total + researchImportRowLimit(source.rowLimit),
    0,
  )
  if (requestedRows > MAX_RESEARCH_ROW_LIMIT) {
    throw new SeoError(
      'INVALID_INPUT',
      `Research files can normalize at most ${MAX_RESEARCH_ROW_LIMIT} rows in one report.`,
    )
  }
  const adapter = new ResearchImportProvider(input.sources, input.now)
  return {
    provider: validatedSourceProvider,
    dependencies: {
      ...input.dependencies,
      candidates: [{ adapter, connected: true, priority: 0 }],
    },
  }
}

export function days(value: number | undefined): number {
  const result = value ?? DEFAULT_DOMAIN_DAYS
  if (!Number.isSafeInteger(result) || result < 1 || result > 548) {
    throw new SeoError(
      'INVALID_INPUT',
      'Days must be a whole number from 1 to 548.',
    )
  }
  return result
}

export function limit(
  value: number | undefined,
  fallback: number,
  maximum = 100,
  label = 'Limit',
): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) {
    throw new SeoError(
      'INVALID_INPUT',
      `${label} must be a whole number from 1 to ${maximum}.`,
    )
  }
  return result
}

export function offset(value: number | undefined): number {
  const result = value ?? 0
  if (!Number.isSafeInteger(result) || result < 0 || result > 100_000) {
    throw new SeoError(
      'INVALID_INPUT',
      'Offset must be a whole number from 0 to 100000.',
    )
  }
  return result
}

async function defaultCandidates(): Promise<readonly ProviderCandidate[]> {
  return [
    {
      adapter: new DataForSeoDomainResearchProvider(),
      connected: Boolean(await readDataForSeoCredentials()),
      priority: 10,
    },
  ]
}

export async function researchProvider<T extends ProviderAdapter>(input: {
  capability: ProviderCapability
  market: SearchMarket
  provider?: ProviderId
  dependencies: DomainResearchDependencies
  method: keyof T
}): Promise<T> {
  let candidates: readonly ProviderCandidate[]
  try {
    candidates = input.dependencies.candidates ?? (await defaultCandidates())
  } catch (error) {
    return providerFailure(error)
  }
  const resolution = resolveProvider({
    capability: input.capability,
    market: input.market,
    candidates,
    provider: input.provider,
  })
  if (resolution.status === 'unavailable') {
    const providerName = input.provider ?? 'A connected provider'
    throw new SeoError(
      resolution.reason === 'market-not-supported'
        ? 'INVALID_INPUT'
        : 'PROVIDER_UNAVAILABLE',
      resolution.reason === 'provider-not-connected'
        ? 'No connected provider can run domain research. Run `seo providers dataforseo connect` first.'
        : `${providerName} cannot run this domain research report for the selected market.`,
    )
  }
  if (!(input.method in resolution.provider)) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'The selected provider does not implement this research operation.',
    )
  }
  return resolution.provider as T
}

export function providerFailure(error: unknown): never {
  if (!(error instanceof ProviderError)) throw error
  if (error.code === 'configuration') {
    throw new SeoError('INVALID_INPUT', error.message)
  }
  if (error.code === 'rate-limit') {
    throw new SeoError('RATE_LIMITED', error.message)
  }
  throw new SeoError('PROVIDER_UNAVAILABLE', error.message)
}

export function reportStatus(input: {
  completeness: string
  retainedRows: number | null
}): DomainResearchDataStatus {
  if (input.completeness === 'unavailable') return 'unavailable'
  if (input.completeness === 'filtered') return 'filtered'
  if (input.completeness !== 'complete') return 'partial'
  if ((input.retainedRows ?? 0) === 0) return 'empty'
  return 'complete'
}

export function value<T>(field: ProviderValue<T>): T | null {
  return field.state === 'observed' ? field.value : null
}

export type GscQueryAggregate = {
  query: string
  clicks: number
  impressions: number
  averagePosition: number | null
  urls: string[]
}

export function aggregateGscQueries(rows: GscRow[]): GscQueryAggregate[] {
  const grouped = new Map<
    string,
    {
      clicks: number
      impressions: number
      weightedPosition: number
      positionWeight: number
      urls: Set<string>
    }
  >()
  for (const row of rows) {
    const query = normalizedKeyword(row.keys[0] ?? '')
    if (!query) continue
    const current = grouped.get(query) ?? {
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      positionWeight: 0,
      urls: new Set<string>(),
    }
    current.clicks += row.clicks
    current.impressions += row.impressions
    const weight = row.impressions > 0 ? row.impressions : 1
    current.weightedPosition += row.position * weight
    current.positionWeight += weight
    const page = row.keys[1]
    if (page) current.urls.add(page)
    grouped.set(query, current)
  }
  return [...grouped.entries()]
    .map(([query, item]) => ({
      query,
      clicks: item.clicks,
      impressions: item.impressions,
      averagePosition: item.positionWeight
        ? item.weightedPosition / item.positionWeight
        : null,
      urls: [...item.urls].sort(compareText).slice(0, 5),
    }))
    .sort(
      (left, right) =>
        right.impressions - left.impressions ||
        compareText(left.query, right.query),
    )
}

export async function acquireGscQueries(input: {
  site: string
  days: number
  refresh?: boolean
  dependencies: DomainResearchDependencies
  now: Date
}) {
  const range = finalGscDateRange(input.days, input.now)
  const result = await (
    input.dependencies.searchAnalytics ?? querySearchAnalytics
  )(
    input.site,
    {
      ...range,
      dimensions: ['query', 'page'],
      type: 'web',
      dataState: 'final',
      maxRows: MAX_GSC_DOMAIN_ROWS,
    },
    { refresh: input.refresh },
  )
  return {
    range,
    rows: aggregateGscQueries(result.rows),
    rowsFetched: result.rowsFetched,
    calls: result.calls,
    maxRows: MAX_GSC_DOMAIN_ROWS,
    possiblyTruncated: result.rowsFetched >= MAX_GSC_DOMAIN_ROWS,
  }
}

export type DomainProviderMethods = {
  overview: DomainOverviewProvider
  keywords: RankedKeywordsProvider
  pages: RankingPagesProvider
  competitors: SerpCompetitorsProvider
}
