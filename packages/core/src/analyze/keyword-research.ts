import { randomUUID } from 'node:crypto'
import { SeoError } from '../errors.js'
import type {
  KeywordDiscoveryProvider,
  KeywordDiscoverySource,
  KeywordIdea,
  ProviderEvidence,
  ProviderId,
  ProviderRequestContext,
  SearchMarket,
} from '../providers/contracts.js'
import {
  keywordDiscoverySourceSchema,
  providerIdSchema,
  searchMarketSchema,
} from '../providers/contracts.js'
import { readDataForSeoCredentials } from '../providers/dataforseo/credentials.js'
import { DataForSeoKeywordDiscoveryProvider } from '../providers/dataforseo/keyword-discovery.js'
import { ProviderError } from '../providers/errors.js'
import {
  type ProviderCandidate,
  resolveProvider,
} from '../providers/resolver.js'
import { analyzeKeywordTrend, type KeywordTrend } from './keyword-metrics.js'

const MAX_RESEARCH_SEEDS = 5
const MAX_RESEARCH_ROWS = 100

export type KeywordResearchAnalysis = {
  keyword: string
  sourceCount: number
  seedCount: number
  trend: KeywordTrend
}

export type KeywordResearchFinding = {
  code: 'multi-source-keyword' | 'recent-demand-increase'
  keyword: string
  evidenceRef: string
  principle: string
  detail: string
}

export type KeywordResearchReport = {
  schemaVersion: 1
  generatedAt: string
  dataStatus: 'complete' | 'partial' | 'unavailable'
  market: SearchMarket
  summary: {
    requestedSeeds: number
    requestedSources: number
    discoveredKeywords: number
    keywordsWithObservedVolume: number
    observedZeroVolume: number
    missingOrInvalidVolume: number
    keywordsFoundBySeveralSources: number
    increasingTrends: number
    verdict: string
  }
  evidence: ProviderEvidence<KeywordIdea[]>
  analysis: KeywordResearchAnalysis[]
  findings: KeywordResearchFinding[]
  caveats: string[]
  nextSteps: string[]
}

export type KeywordResearchReportDependencies = {
  candidates?: readonly ProviderCandidate[]
  now?: () => Date
}

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function discoveryProvider(
  candidate: ProviderCandidate['adapter'],
): KeywordDiscoveryProvider | null {
  return 'discoverKeywords' in candidate &&
    typeof candidate.discoverKeywords === 'function'
    ? (candidate as KeywordDiscoveryProvider)
    : null
}

async function defaultCandidates(): Promise<readonly ProviderCandidate[]> {
  return [
    {
      adapter: new DataForSeoKeywordDiscoveryProvider(),
      connected: Boolean(await readDataForSeoCredentials()),
      priority: 10,
    },
  ]
}

function providerError(error: unknown): never {
  if (!(error instanceof ProviderError)) throw error
  if (error.code === 'rate-limit') {
    throw new SeoError('RATE_LIMITED', error.message)
  }
  if (error.code === 'configuration') {
    throw new SeoError('INVALID_INPUT', error.message)
  }
  throw new SeoError('PROVIDER_UNAVAILABLE', error.message)
}

function validateInput(input: {
  seeds: string[]
  sources: KeywordDiscoverySource[]
  market: SearchMarket
  limit: number
  provider?: ProviderId
}) {
  if (
    input.seeds.length < 1 ||
    input.seeds.length > MAX_RESEARCH_SEEDS ||
    input.seeds.some((seed) => {
      const value = seed.trim()
      return (
        value.length < 1 || value.length > 80 || value.split(/\s+/u).length > 10
      )
    })
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `Keyword research requires 1 to ${MAX_RESEARCH_SEEDS} seeds of at most 80 characters and 10 words.`,
    )
  }
  const normalizedSeeds = new Set(
    input.seeds.map((seed) => seed.trim().replace(/\s+/gu, ' ').toLowerCase()),
  ).size
  const normalizedSources = [...new Set(input.sources)]
  const providerRequests = normalizedSources.reduce(
    (total, source) => total + (source === 'ideas' ? 1 : normalizedSeeds),
    0,
  )
  if (input.limit < providerRequests) {
    throw new SeoError(
      'INVALID_INPUT',
      `Keyword research needs a limit of at least ${providerRequests} to sample every requested source and seed.`,
    )
  }
  if (
    input.sources.length < 1 ||
    input.sources.length > 3 ||
    input.sources.some(
      (source) => !keywordDiscoverySourceSchema.safeParse(source).success,
    )
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Choose at least one supported keyword discovery source.',
    )
  }
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > MAX_RESEARCH_ROWS
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `Keyword research limit must be from 1 to ${MAX_RESEARCH_ROWS}.`,
    )
  }
  const market = searchMarketSchema.safeParse(input.market)
  if (!market.success) {
    throw new SeoError('INVALID_INPUT', 'Use a valid search market.')
  }
  const provider = input.provider
    ? providerIdSchema.safeParse(input.provider)
    : undefined
  if (provider && !provider.success) {
    throw new SeoError('INVALID_INPUT', 'Use a supported keyword provider.')
  }
  return {
    market: market.data,
    provider: provider?.data,
    sources: normalizedSources.sort(compareCodepoints),
  }
}

function reportStatus(
  evidence: ProviderEvidence<KeywordIdea[]>,
): KeywordResearchReport['dataStatus'] {
  if (evidence.coverage.completeness === 'unavailable') return 'unavailable'
  if (
    evidence.coverage.completeness !== 'complete' ||
    evidence.data.some((idea) =>
      Object.entries(idea).some(
        ([field, value]) =>
          field !== 'keyword' &&
          field !== 'sources' &&
          typeof value === 'object' &&
          value !== null &&
          'state' in value &&
          value.state === 'invalid',
      ),
    )
  ) {
    return 'partial'
  }
  return 'complete'
}

function reportFindings(
  analysis: KeywordResearchAnalysis[],
): KeywordResearchFinding[] {
  return analysis
    .flatMap((item, index) => {
      const findings: KeywordResearchFinding[] = []
      if (item.sourceCount > 1) {
        findings.push({
          code: 'multi-source-keyword',
          keyword: item.keyword,
          evidenceRef: `evidence.data[${index}].sources`,
          principle:
            'Repeated discovery is prioritization context and does not prove shared intent or ranking feasibility.',
          detail: `${item.keyword} appeared in ${item.sourceCount} requested discovery sources from ${item.seedCount} seed${item.seedCount === 1 ? '' : 's'}.`,
        })
      }
      if (
        item.trend.state === 'observed' &&
        (item.trend.direction === 'increasing' ||
          item.trend.direction === 'increased-from-zero')
      ) {
        findings.push({
          code: 'recent-demand-increase',
          keyword: item.keyword,
          evidenceRef: `evidence.data[${index}].monthlySearches`,
          principle:
            'Provider search-volume history is context for research, not a demand or traffic forecast.',
          detail: `${item.keyword} has a recent three-month average of ${item.trend.recentAverage}, compared with ${item.trend.previousAverage} in the preceding three months.`,
        })
      }
      return findings
    })
    .sort(
      (left, right) =>
        Number(right.code === 'multi-source-keyword') -
          Number(left.code === 'multi-source-keyword') ||
        compareCodepoints(left.keyword, right.keyword) ||
        compareCodepoints(left.code, right.code),
    )
    .slice(0, 15)
}

export async function keywordResearchReport(
  input: {
    seeds: string[]
    sources?: KeywordDiscoverySource[]
    market: SearchMarket
    limit?: number
    provider?: ProviderId
    projectId?: string
    context?: Partial<ProviderRequestContext>
    refresh?: boolean
  },
  dependencies: KeywordResearchReportDependencies = {},
): Promise<KeywordResearchReport> {
  const sources = input.sources ?? ['ideas', 'related', 'suggestions']
  const limit = input.limit ?? 50
  const validated = validateInput({ ...input, sources, limit })
  let candidates: readonly ProviderCandidate[]
  try {
    candidates = dependencies.candidates ?? (await defaultCandidates())
  } catch (error) {
    return providerError(error)
  }
  const resolution = resolveProvider({
    capability: 'keyword-discovery',
    market: validated.market,
    candidates,
    provider: validated.provider,
  })
  if (resolution.status === 'unavailable') {
    const message =
      resolution.reason === 'provider-not-connected'
        ? 'No connected provider can discover keywords. Run `seo providers dataforseo connect` first.'
        : validated.provider
          ? `${validated.provider} cannot discover keywords for this market.`
          : 'No configured provider can discover keywords for this market.'
    throw new SeoError('PROVIDER_UNAVAILABLE', message)
  }
  const provider = discoveryProvider(resolution.provider)
  if (!provider) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'The selected provider has no keyword discovery implementation.',
    )
  }

  let evidence: ProviderEvidence<KeywordIdea[]>
  try {
    evidence = await provider.discoverKeywords({
      seeds: input.seeds,
      sources: validated.sources,
      market: validated.market,
      limit,
      refresh: input.refresh,
      context: {
        projectId: input.context?.projectId ?? input.projectId,
        reportId: input.context?.reportId ?? 'keyword-research',
        reportRunId: input.context?.reportRunId ?? randomUUID(),
      },
    })
  } catch (error) {
    return providerError(error)
  }

  const analysis = evidence.data.map((idea) => ({
    keyword: idea.keyword,
    sourceCount: new Set(idea.sources.map((source) => source.source)).size,
    seedCount: new Set(idea.sources.map((source) => source.seed)).size,
    trend: analyzeKeywordTrend(idea),
  }))
  const observedVolume = evidence.data.filter(
    (idea) => idea.monthlySearchVolume.state === 'observed',
  )
  const increasingTrends = analysis.filter(
    (item) =>
      item.trend.state === 'observed' &&
      (item.trend.direction === 'increasing' ||
        item.trend.direction === 'increased-from-zero'),
  ).length
  const severalSources = analysis.filter((item) => item.sourceCount > 1).length
  const dataStatus = reportStatus(evidence)
  const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString()

  return {
    schemaVersion: 1,
    generatedAt,
    dataStatus,
    market: validated.market,
    summary: {
      requestedSeeds: new Set(
        input.seeds.map((seed) => seed.trim().toLowerCase()),
      ).size,
      requestedSources: validated.sources.length,
      discoveredKeywords: evidence.data.length,
      keywordsWithObservedVolume: observedVolume.length,
      observedZeroVolume: observedVolume.filter(
        (idea) => idea.monthlySearchVolume.value === 0,
      ).length,
      missingOrInvalidVolume: evidence.data.length - observedVolume.length,
      keywordsFoundBySeveralSources: severalSources,
      increasingTrends,
      verdict:
        dataStatus === 'unavailable'
          ? 'The provider returned no usable keyword ideas for this request.'
          : `${evidence.data.length} keyword ideas were retained; ${severalSources} appeared in more than one requested discovery source.`,
    },
    evidence,
    analysis,
    findings: reportFindings(analysis),
    caveats: [
      'Discovery sources are provider methods with different expansion rules, so appearing in several sources is context rather than independent confirmation.',
      'Search volume, cost, competition, difficulty, intent, and result counts are third-party estimates for the selected market.',
      'An observed zero differs from missing or invalid evidence and does not prove that nobody searches for a term.',
      'Discovered terms have not been checked for shared intent, current rankings, content fit, or programmatic template suitability.',
    ],
    nextSteps: [
      'Review the retained terms for shared intent before grouping them or planning pages.',
      'Run serp-results for a short list in the same market before treating provider difficulty or result count as competitive evidence.',
      'Compare relevant terms with first-party Search Console evidence before choosing work for an existing site.',
    ],
  }
}
