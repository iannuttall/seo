import { randomUUID } from 'node:crypto'
import { SeoError } from '../errors.js'
import type {
  KeywordMetric,
  KeywordMetricsProvider,
  ProviderEvidence,
  ProviderId,
  ProviderValue,
  SearchMarket,
} from '../providers/contracts.js'
import {
  observedValue,
  providerIdSchema,
  searchMarketSchema,
  unavailableValue,
} from '../providers/contracts.js'
import { readDataForSeoCredentials } from '../providers/dataforseo/credentials.js'
import { DataForSeoKeywordMetricsProvider } from '../providers/dataforseo/keyword-metrics.js'
import { ProviderError } from '../providers/errors.js'
import {
  type ProviderCandidate,
  resolveProvider,
} from '../providers/resolver.js'

const MAX_REPORT_KEYWORDS = 50

export type KeywordTrend =
  | {
      state: 'observed'
      direction: 'increasing' | 'decreasing' | 'stable' | 'increased-from-zero'
      recentAverage: number
      previousAverage: number
      absoluteChange: number
      percentChange: ProviderValue<number>
      months: Array<{ year: number; month: number }>
      methodology: string
    }
  | { state: 'unavailable'; reason: string }

export type KeywordMetricAnalysis = {
  keyword: string
  trend: KeywordTrend
}

export type KeywordMetricFinding = {
  code: 'recent-demand-increase' | 'recent-demand-decrease'
  keyword: string
  evidenceRef: string
  principle: string
  detail: string
}

export type KeywordMetricsReport = {
  schemaVersion: 1
  generatedAt: string
  dataStatus: 'complete' | 'partial' | 'unavailable'
  market: SearchMarket
  summary: {
    requestedKeywords: number
    providerRows: number
    keywordsWithObservedVolume: number
    observedZeroVolume: number
    missingOrInvalidVolume: number
    increasingTrends: number
    decreasingTrends: number
    stableTrends: number
    unavailableTrends: number
    verdict: string
  }
  evidence: ProviderEvidence<KeywordMetric[]>
  analysis: KeywordMetricAnalysis[]
  findings: KeywordMetricFinding[]
  caveats: string[]
  nextSteps: string[]
}

export type KeywordMetricsReportDependencies = {
  candidates?: readonly ProviderCandidate[]
  now?: () => Date
}

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function round(value: number, precision = 2): number {
  const multiplier = 10 ** precision
  return Math.round(value * multiplier) / multiplier
}

function consecutiveMonths(
  months: Array<{ year: number; month: number }>,
): boolean {
  return months.every((month, index) => {
    if (index === 0) return true
    const previous = months[index - 1]
    return (
      previous !== undefined &&
      month.year * 12 + month.month === previous.year * 12 + previous.month + 1
    )
  })
}

export function analyzeKeywordTrend(metric: KeywordMetric): KeywordTrend {
  if (metric.monthlySearches.state !== 'observed') {
    return {
      state: 'unavailable',
      reason: metric.monthlySearches.reason,
    }
  }
  const recentSix = metric.monthlySearches.value.slice(-6)
  if (recentSix.length < 6 || !consecutiveMonths(recentSix)) {
    return {
      state: 'unavailable',
      reason:
        'Six consecutive months of provider search-volume history are required.',
    }
  }
  const previousAverage = round(
    recentSix.slice(0, 3).reduce((sum, item) => sum + item.searchVolume, 0) / 3,
  )
  const recentAverage = round(
    recentSix.slice(3).reduce((sum, item) => sum + item.searchVolume, 0) / 3,
  )
  const absoluteChange = round(recentAverage - previousAverage)
  const percentChange =
    previousAverage === 0
      ? unavailableValue<number>(
          'unavailable',
          'Percentage change is unavailable because the earlier average is zero.',
        )
      : observedValue(round((absoluteChange / previousAverage) * 100, 1))
  const direction =
    previousAverage === 0 && recentAverage > 0
      ? ('increased-from-zero' as const)
      : previousAverage === 0
        ? ('stable' as const)
        : (percentChange.value ?? 0) >= 10
          ? ('increasing' as const)
          : (percentChange.value ?? 0) <= -10
            ? ('decreasing' as const)
            : ('stable' as const)

  return {
    state: 'observed',
    direction,
    recentAverage,
    previousAverage,
    absoluteChange,
    percentChange,
    months: recentSix.map(({ year, month }) => ({ year, month })),
    methodology:
      'Heuristic comparison of the latest three monthly provider estimates with the preceding three; changes inside 10% are labelled stable.',
  }
}

function keywordMetricsProvider(
  candidate: ProviderCandidate['adapter'],
): KeywordMetricsProvider | null {
  return 'keywordMetrics' in candidate &&
    typeof candidate.keywordMetrics === 'function'
    ? (candidate as KeywordMetricsProvider)
    : null
}

async function defaultCandidates(): Promise<readonly ProviderCandidate[]> {
  return [
    {
      adapter: new DataForSeoKeywordMetricsProvider(),
      connected: Boolean(await readDataForSeoCredentials()),
      priority: 10,
    },
  ]
}

function providerResolutionError(input: {
  provider?: ProviderId
  reason: string
}): SeoError {
  if (input.reason === 'provider-not-connected') {
    return new SeoError(
      'PROVIDER_UNAVAILABLE',
      'No connected provider can supply keyword metrics. Run `seo providers dataforseo connect` first.',
    )
  }
  if (input.provider) {
    return new SeoError(
      'PROVIDER_UNAVAILABLE',
      `${input.provider} cannot supply keyword metrics for this market.`,
    )
  }
  return new SeoError(
    'PROVIDER_UNAVAILABLE',
    'No configured provider can supply keyword metrics for this market.',
  )
}

function providerReportError(error: unknown): never {
  if (!(error instanceof ProviderError)) throw error
  if (error.code === 'rate-limit') {
    throw new SeoError('RATE_LIMITED', error.message)
  }
  throw new SeoError('PROVIDER_UNAVAILABLE', error.message)
}

function validateInput(input: {
  keywords: string[]
  market: SearchMarket
  provider?: ProviderId
}) {
  if (
    input.keywords.length < 1 ||
    input.keywords.length > MAX_REPORT_KEYWORDS ||
    input.keywords.some((keyword) => {
      const value = keyword.trim()
      return (
        value.length < 1 || value.length > 80 || value.split(/\s+/u).length > 10
      )
    })
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `Keyword metrics requires 1 to ${MAX_REPORT_KEYWORDS} keywords of at most 80 characters and 10 words.`,
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
  return { market: market.data, provider: provider?.data }
}

function reportStatus(
  evidence: ProviderEvidence<KeywordMetric[]>,
): KeywordMetricsReport['dataStatus'] {
  const observedRows = evidence.data.filter((metric) =>
    Object.entries(metric).some(
      ([field, value]) =>
        field !== 'keyword' &&
        typeof value === 'object' &&
        value !== null &&
        'state' in value &&
        value.state === 'observed',
    ),
  ).length
  if (observedRows === 0) return 'unavailable'
  if (
    evidence.coverage.completeness !== 'complete' ||
    evidence.data.some((metric) =>
      Object.entries(metric).some(
        ([field, value]) =>
          field !== 'keyword' &&
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

function findings(analysis: KeywordMetricAnalysis[]): KeywordMetricFinding[] {
  return analysis
    .flatMap((item, index) => {
      if (item.trend.state !== 'observed') return []
      if (
        item.trend.direction !== 'increasing' &&
        item.trend.direction !== 'increased-from-zero' &&
        item.trend.direction !== 'decreasing'
      ) {
        return []
      }
      const increasing = item.trend.direction !== 'decreasing'
      return [
        {
          code: increasing
            ? ('recent-demand-increase' as const)
            : ('recent-demand-decrease' as const),
          keyword: item.keyword,
          evidenceRef: `evidence.data[${index}].monthlySearches`,
          principle:
            'Provider search-volume history is prioritization context, not a traffic or ranking forecast.',
          detail: `${item.keyword} has a recent three-month average of ${item.trend.recentAverage}, compared with ${item.trend.previousAverage} in the preceding three months.`,
          recentAverage: item.trend.recentAverage,
        },
      ]
    })
    .sort(
      (left, right) =>
        Number(right.code === 'recent-demand-increase') -
          Number(left.code === 'recent-demand-increase') ||
        right.recentAverage - left.recentAverage ||
        compareCodepoints(left.keyword, right.keyword),
    )
    .slice(0, 10)
    .map(({ recentAverage: _recentAverage, ...finding }) => finding)
}

export async function keywordMetricsReport(
  input: {
    keywords: string[]
    market: SearchMarket
    provider?: ProviderId
    projectId?: string
    refresh?: boolean
  },
  dependencies: KeywordMetricsReportDependencies = {},
): Promise<KeywordMetricsReport> {
  const validated = validateInput(input)
  let candidates: readonly ProviderCandidate[]
  try {
    candidates = dependencies.candidates ?? (await defaultCandidates())
  } catch (error) {
    return providerReportError(error)
  }
  const resolution = resolveProvider({
    capability: 'keyword-metrics',
    market: validated.market,
    candidates,
    provider: validated.provider,
  })
  if (resolution.status === 'unavailable') {
    throw providerResolutionError({
      provider: validated.provider,
      reason: resolution.reason,
    })
  }
  const provider = keywordMetricsProvider(resolution.provider)
  if (!provider) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'The selected provider has no keyword metrics implementation.',
    )
  }
  let evidence: ProviderEvidence<KeywordMetric[]>
  try {
    evidence = await provider.keywordMetrics({
      keywords: input.keywords,
      market: validated.market,
      refresh: input.refresh,
      context: {
        projectId: input.projectId,
        reportId: 'keyword-metrics',
        reportRunId: randomUUID(),
      },
    })
  } catch (error) {
    return providerReportError(error)
  }
  const generatedAt = (dependencies.now ?? (() => new Date()))().toISOString()
  const analysis = evidence.data.map((metric) => ({
    keyword: metric.keyword,
    trend: analyzeKeywordTrend(metric),
  }))
  const directions = analysis.map((item) => item.trend)
  const countDirection = (direction: string) =>
    directions.filter(
      (trend) => trend.state === 'observed' && trend.direction === direction,
    ).length
  const observedVolume = evidence.data.filter(
    (metric) => metric.monthlySearchVolume.state === 'observed',
  )
  const dataStatus = reportStatus(evidence)
  const increasingTrends =
    countDirection('increasing') + countDirection('increased-from-zero')
  const decreasingTrends = countDirection('decreasing')
  const stableTrends = countDirection('stable')
  const unavailableTrends = directions.filter(
    (trend) => trend.state === 'unavailable',
  ).length
  const keywordLabel = evidence.data.length === 1 ? 'keyword' : 'keywords'
  const trendVerb = increasingTrends === 1 ? 'shows' : 'show'

  return {
    schemaVersion: 1,
    generatedAt,
    dataStatus,
    market: validated.market,
    summary: {
      requestedKeywords:
        evidence.coverage.requestedRows ?? input.keywords.length,
      providerRows: evidence.coverage.returnedRows ?? 0,
      keywordsWithObservedVolume: observedVolume.length,
      observedZeroVolume: observedVolume.filter(
        (metric) => metric.monthlySearchVolume.value === 0,
      ).length,
      missingOrInvalidVolume: evidence.data.length - observedVolume.length,
      increasingTrends,
      decreasingTrends,
      stableTrends,
      unavailableTrends,
      verdict:
        dataStatus === 'unavailable'
          ? 'The provider returned no usable keyword metrics for this request.'
          : `Observed search-volume estimates are available for ${observedVolume.length} of ${evidence.data.length} ${keywordLabel}; ${increasingTrends} ${trendVerb} an increasing recent trend.`,
    },
    evidence,
    analysis,
    findings: findings(analysis),
    caveats: [
      'Search volume, cost-per-click, competition, difficulty, intent, and result counts are third-party estimates for the selected market.',
      'An observed zero differs from missing or invalid evidence and does not prove that nobody searches for the term.',
      'Keyword difficulty is a provider metric, not a ranking probability or a substitute for reviewing the current results.',
      'Trend labels compare two three-month periods and do not forecast future demand.',
    ],
    nextSteps: [
      'Compare promising estimates with first-party Search Console impressions, clicks, pages, and average position before choosing work.',
      'Inspect a current result snapshot before treating difficulty, result count, or intent as competitive evidence.',
    ],
  }
}
