import { randomUUID } from 'node:crypto'
import { keywordMetricsReport } from '../analyze/keyword-metrics.js'
import { SeoError } from '../errors.js'
import type {
  KeywordMetric,
  KeywordMetricsCostEstimate,
  KeywordMetricsCostEstimator,
  ProviderId,
} from '../providers/contracts.js'
import { providerIdSchema } from '../providers/contracts.js'
import { readDataForSeoCredentials } from '../providers/dataforseo/credentials.js'
import { DataForSeoKeywordMetricsProvider } from '../providers/dataforseo/keyword-metrics.js'
import { ProviderError } from '../providers/errors.js'
import {
  type ProviderCandidate,
  resolveProvider,
} from '../providers/resolver.js'
import { KEYWORD_SET_LIMITS } from './limits.js'
import { addKeywordsToSet, setKeywordSetRefreshTime } from './mutations.js'
import type { KeywordSetStoreOptions } from './rows.js'
import { getKeywordSet } from './store.js'
import { normalizeSavedKeyword } from './validation.js'

const REFRESH_BATCH_SIZE = 50

export type KeywordSetRefreshReport = {
  schemaVersion: 1
  generatedAt: string
  mode: 'preview' | 'executed'
  dataStatus: 'complete' | 'partial' | 'unavailable'
  set: {
    id: string
    name: string
    projectId: string
    totalKeywords: number
  }
  selection: {
    offset: number
    limit: number
    selectedKeywords: number
    nextOffset: number | null
    completeness: 'complete' | 'capped'
  }
  cost: KeywordMetricsCostEstimate
  execution: null | {
    attemptedBatches: number
    completeBatches: number
    partialBatches: number
    failedBatches: number
    savedSnapshots: number
    actualMicros: number | null
    warnings: Array<{ batch: number; message: string }>
    errors: Array<{ batch: number; message: string }>
  }
  caveats: string[]
  nextSteps: string[]
}

export type KeywordSetRefreshDependencies = {
  candidates?: readonly ProviderCandidate[]
  keywordMetrics?: typeof keywordMetricsReport
  now?: () => Date
  store?: KeywordSetStoreOptions
}

function estimator(
  adapter: ProviderCandidate['adapter'],
): KeywordMetricsCostEstimator | null {
  return 'estimateKeywordMetricsCost' in adapter &&
    typeof adapter.estimateKeywordMetricsCost === 'function'
    ? (adapter as KeywordMetricsCostEstimator)
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

function providerError(error: unknown): never {
  if (!(error instanceof ProviderError)) throw error
  throw new SeoError(
    error.code === 'rate-limit' ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE',
    error.message,
  )
}

function summedCost(values: Array<number | null>): number | null {
  return values.length > 0 && values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + (value ?? 0), 0)
    : null
}

export async function refreshKeywordSet(
  input: {
    projectId: string
    idOrName: string
    provider?: ProviderId
    limit?: number
    offset?: number
    execute?: boolean
  },
  dependencies: KeywordSetRefreshDependencies = {},
): Promise<KeywordSetRefreshReport> {
  const limit = input.limit ?? KEYWORD_SET_LIMITS.outputRows
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
    throw new SeoError('INVALID_INPUT', 'Refresh limit must be from 1 to 1000.')
  }
  if (input.provider && !providerIdSchema.safeParse(input.provider).success) {
    throw new SeoError('INVALID_INPUT', 'Use a supported keyword provider.')
  }
  const offset = input.offset ?? 0
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
    throw new SeoError(
      'INVALID_INPUT',
      'Refresh offset must be from 0 to 100000.',
    )
  }
  const detail = getKeywordSet(
    {
      projectId: input.projectId,
      idOrName: input.idOrName,
      limit,
      offset,
    },
    dependencies.store,
  )
  if (detail.items.length === 0) {
    throw new SeoError(
      'INSUFFICIENT_DATA',
      detail.set.keywordCount === 0
        ? 'The keyword set is empty.'
        : 'No keywords exist in the selected refresh window.',
    )
  }
  let candidates: readonly ProviderCandidate[]
  try {
    candidates = dependencies.candidates ?? (await defaultCandidates())
  } catch (error) {
    return providerError(error)
  }
  const resolution = resolveProvider({
    capability: 'keyword-metrics',
    market: detail.set.market,
    candidates,
    provider: input.provider ?? detail.set.provider ?? undefined,
  })
  if (resolution.status === 'unavailable') {
    const selectedProvider = input.provider ?? detail.set.provider ?? undefined
    throw new SeoError(
      resolution.reason === 'market-not-supported' && selectedProvider
        ? 'INVALID_INPUT'
        : 'PROVIDER_UNAVAILABLE',
      resolution.reason === 'provider-not-connected'
        ? 'No connected provider can refresh this keyword set.'
        : resolution.reason === 'market-not-supported' &&
            selectedProvider === 'dataforseo'
          ? 'DataForSEO keyword estimates require a country-level saved set. Create the set without --location, then use a location-specific serp-results report for local result evidence.'
          : 'No configured provider can estimate and refresh this keyword set.',
    )
  }
  const costEstimator = estimator(resolution.provider)
  if (!costEstimator) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      `${resolution.provider.provider} cannot preview keyword metric costs.`,
    )
  }
  let cost: KeywordMetricsCostEstimate
  try {
    cost = await costEstimator.estimateKeywordMetricsCost({
      requestedRows: detail.items.length,
      market: detail.set.market,
    })
  } catch (error) {
    return providerError(error)
  }
  if (cost.estimatedMicros === null) {
    throw new SeoError(
      'PROVIDER_UNAVAILABLE',
      'The provider did not return a usable cost estimate, so no paid refresh was started.',
    )
  }
  const now = dependencies.now ?? (() => new Date())
  const generatedAt = now().toISOString()
  const completeSelection =
    detail.pagination.offset === 0 &&
    detail.items.length === detail.set.keywordCount
  const common = {
    schemaVersion: 1 as const,
    generatedAt,
    set: {
      id: detail.set.id,
      name: detail.set.name,
      projectId: detail.set.projectId,
      totalKeywords: detail.set.keywordCount,
    },
    selection: {
      offset: detail.pagination.offset,
      limit: detail.pagination.limit,
      selectedKeywords: detail.items.length,
      nextOffset: detail.pagination.nextOffset,
      completeness: completeSelection
        ? ('complete' as const)
        : ('capped' as const),
    },
    cost,
  }
  if (!input.execute) {
    return {
      ...common,
      mode: 'preview',
      dataStatus: completeSelection ? 'complete' : 'partial',
      execution: null,
      caveats: [
        'This preview used current provider account pricing and did not start a paid keyword request.',
        ...(completeSelection
          ? []
          : ['The refresh limit covers only part of the saved keyword set.']),
      ],
      nextSteps: [
        'Review the selected market, keyword count, request count, and estimate before executing the refresh.',
      ],
    }
  }

  const batches = Array.from(
    { length: Math.ceil(detail.items.length / REFRESH_BATCH_SIZE) },
    (_, index) =>
      detail.items.slice(
        index * REFRESH_BATCH_SIZE,
        (index + 1) * REFRESH_BATCH_SIZE,
      ),
  )
  const warnings: Array<{ batch: number; message: string }> = []
  const errors: Array<{ batch: number; message: string }> = []
  const actualCosts: Array<number | null> = []
  let savedSnapshots = 0
  let completeBatches = 0
  let partialBatches = 0
  const reportRunId = randomUUID()
  for (const [index, batch] of batches.entries()) {
    try {
      const report = await (
        dependencies.keywordMetrics ?? keywordMetricsReport
      )(
        {
          keywords: batch.map((item) => item.keyword),
          market: detail.set.market,
          provider: resolution.provider.provider,
          projectId: detail.set.projectId,
          refresh: true,
          context: { reportId: 'saved-keyword-refresh', reportRunId },
        },
        { candidates, now },
      )
      const metrics = new Map(
        report.evidence.data.map((metric) => [
          normalizeSavedKeyword(metric.keyword),
          metric,
        ]),
      )
      const saved = batch.flatMap((item) => {
        const metric = metrics.get(item.normalizedKeyword)
        return metric
          ? [
              savedMetricItem(
                metric,
                report.evidence.provider,
                report.evidence.observedAt,
              ),
            ]
          : []
      })
      if (saved.length > 0) {
        addKeywordsToSet(
          {
            projectId: detail.set.projectId,
            idOrName: detail.set.id,
            items: saved,
          },
          dependencies.store,
        )
      }
      savedSnapshots += saved.length
      actualCosts.push(report.evidence.cost.actualMicros)
      if (
        report.dataStatus !== 'complete' ||
        report.evidence.coverage.completeness !== 'complete' ||
        saved.length !== batch.length
      ) {
        partialBatches += 1
        warnings.push({
          batch: index + 1,
          message:
            saved.length !== batch.length
              ? `Batch retained ${saved.length} typed snapshots for ${batch.length} keywords.`
              : `Batch returned ${report.evidence.coverage.completeness} provider coverage for ${batch.length} keywords.`,
        })
        continue
      }
      completeBatches += 1
    } catch (error) {
      errors.push({
        batch: index + 1,
        message: error instanceof Error ? error.message : String(error),
      })
      break
    }
  }
  if (errors.length === 0 && partialBatches === 0 && completeSelection) {
    setKeywordSetRefreshTime(
      {
        projectId: detail.set.projectId,
        idOrName: detail.set.id,
        refreshedAt: generatedAt,
      },
      dependencies.store,
    )
  }
  const complete =
    errors.length === 0 && partialBatches === 0 && completeSelection
  return {
    ...common,
    mode: 'executed',
    dataStatus: complete
      ? 'complete'
      : savedSnapshots > 0
        ? 'partial'
        : 'unavailable',
    execution: {
      attemptedBatches: completeBatches + partialBatches + errors.length,
      completeBatches,
      partialBatches,
      failedBatches: errors.length,
      savedSnapshots,
      actualMicros: summedCost(actualCosts),
      warnings,
      errors,
    },
    caveats: [
      'Saved metrics are provider estimates for the set market, not first-party rankings or traffic forecasts.',
      ...(completeSelection
        ? []
        : ['The refresh limit covered only part of the saved keyword set.']),
      ...(errors.length
        ? [
            'Completed batches were retained; the failed batch and later batches remain stale.',
          ]
        : []),
      ...(partialBatches > 0
        ? [
            'Partial provider batches were retained with explicit missing or invalid states; the set was not marked fully refreshed.',
          ]
        : []),
    ],
    nextSteps: [
      complete
        ? 'Compare changed demand and competition evidence with Search Console before changing priorities.'
        : 'Resolve the incomplete coverage before treating the set as fully refreshed.',
    ],
  }
}

function savedMetricItem(
  metric: KeywordMetric,
  provider: ProviderId,
  observedAt: string,
) {
  return {
    keyword: metric.keyword,
    latestMetric: {
      schemaVersion: 1 as const,
      provider,
      observedAt,
      metric,
    },
  }
}
