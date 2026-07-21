import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  KeywordMetric,
  KeywordMetricsProvider,
  ProviderEvidence,
  ProviderValue,
  SearchMarket,
} from '../providers/contracts.js'
import { observedValue, unavailableValue } from '../providers/contracts.js'
import { ProviderError } from '../providers/errors.js'
import type { ProviderCandidate } from '../providers/resolver.js'
import { analyzeKeywordTrend, keywordMetricsReport } from './keyword-metrics.js'

const market: SearchMarket = {
  searchEngine: 'google',
  countryCode: 'US',
  languageCode: 'en',
}

function missing<T>(field: string): ProviderValue<T> {
  return unavailableValue('missing', `Provider omitted ${field}.`)
}

function metric(
  keyword: string,
  input: Partial<KeywordMetric> = {},
): KeywordMetric {
  return {
    keyword,
    monthlySearchVolume: observedValue(100),
    monthlySearches: missing('monthlySearches'),
    searchVolumeUpdatedAt: missing('searchVolumeUpdatedAt'),
    cpcUsd: missing('cpcUsd'),
    paidCompetition: missing('paidCompetition'),
    keywordDifficulty: missing('keywordDifficulty'),
    intent: missing('intent'),
    resultCount: missing('resultCount'),
    ...input,
  }
}

function monthlySearches(volumes: number[]) {
  return observedValue(
    volumes.map((searchVolume, index) => ({
      year: 2026,
      month: index + 1,
      searchVolume,
    })),
  )
}

function evidence(
  data: KeywordMetric[],
  completeness: ProviderEvidence<
    KeywordMetric[]
  >['coverage']['completeness'] = 'complete',
): ProviderEvidence<KeywordMetric[]> {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'keyword-metrics',
    data,
    observedAt: '2026-07-21T12:00:00.000Z',
    market,
    coverage: {
      requestedRows: data.length,
      returnedRows: data.length,
      retainedRows: data.length,
      invalidRows: 0,
      providerTotalRows: null,
      completeness,
      nextCursor: null,
    },
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 10_000,
      actualMicros: 10_000,
      taskIds: ['task-1'],
    },
    request: {
      operation: 'keyword-metrics',
      endpoint: 'keyword-overview',
      limit: 50,
      filters: {},
      sort: ['keyword:codepoint-ascending'],
    },
    warnings: [],
  }
}

function candidate(
  run: KeywordMetricsProvider['keywordMetrics'],
  connected = true,
): ProviderCandidate {
  const adapter: KeywordMetricsProvider = {
    provider: 'dataforseo',
    capabilitySupport: [
      {
        capability: 'keyword-metrics',
        status: 'available',
        markets: [{ searchEngines: ['google'] }],
      },
    ],
    keywordMetrics: run,
  }
  return {
    connected,
    priority: 1,
    adapter,
  }
}

test('keyword trends compare consecutive three-month periods without forecasting', () => {
  assert.deepEqual(
    analyzeKeywordTrend(
      metric('growing', {
        monthlySearches: monthlySearches([10, 20, 30, 40, 50, 60]),
      }),
    ),
    {
      state: 'observed',
      direction: 'increasing',
      recentAverage: 50,
      previousAverage: 20,
      absoluteChange: 30,
      percentChange: { state: 'observed', value: 150 },
      months: [
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
        { year: 2026, month: 3 },
        { year: 2026, month: 4 },
        { year: 2026, month: 5 },
        { year: 2026, month: 6 },
      ],
      methodology:
        'Heuristic comparison of the latest three monthly provider estimates with the preceding three; changes inside 10% are labelled stable.',
    },
  )

  const fromZero = analyzeKeywordTrend(
    metric('new', { monthlySearches: monthlySearches([0, 0, 0, 1, 2, 3]) }),
  )
  assert.equal(fromZero.state, 'observed')
  if (fromZero.state === 'observed') {
    assert.equal(fromZero.direction, 'increased-from-zero')
    assert.equal(fromZero.percentChange.state, 'unavailable')
  }
})

test('keyword trends require enough consecutive evidence', () => {
  assert.equal(
    analyzeKeywordTrend(
      metric('short', { monthlySearches: monthlySearches([1, 2, 3, 4, 5]) }),
    ).state,
    'unavailable',
  )
  const history = monthlySearches([1, 2, 3, 4, 5, 6])
  assert.equal(history.state, 'observed')
  if (history.state === 'observed') {
    const fourthMonth = history.value[3]
    assert.ok(fourthMonth)
    fourthMonth.month = 5
  }
  assert.equal(
    analyzeKeywordTrend(metric('gap', { monthlySearches: history })).state,
    'unavailable',
  )
})

test('keyword metrics report keeps provider evidence separate from derived findings', async () => {
  let captured:
    | Parameters<KeywordMetricsProvider['keywordMetrics']>[0]
    | undefined
  const providerEvidence = evidence([
    metric('growing', {
      monthlySearchVolume: observedValue(500),
      monthlySearches: monthlySearches([100, 100, 100, 150, 200, 250]),
    }),
    metric('zero', {
      monthlySearchVolume: observedValue(0),
      monthlySearches: monthlySearches([0, 0, 0, 0, 0, 0]),
    }),
  ])
  const report = await keywordMetricsReport(
    { keywords: ['growing', 'zero'], market, projectId: 'project-1' },
    {
      candidates: [
        candidate(async (input) => {
          captured = input
          return providerEvidence
        }),
      ],
      now: () => new Date('2026-07-21T13:00:00.000Z'),
    },
  )

  assert.equal(report.generatedAt, '2026-07-21T13:00:00.000Z')
  assert.equal(report.dataStatus, 'complete')
  assert.deepEqual(report.summary, {
    requestedKeywords: 2,
    providerRows: 2,
    keywordsWithObservedVolume: 2,
    observedZeroVolume: 1,
    missingOrInvalidVolume: 0,
    increasingTrends: 1,
    decreasingTrends: 0,
    stableTrends: 1,
    unavailableTrends: 0,
    verdict:
      'Observed search-volume estimates are available for 2 of 2 keywords; 1 shows an increasing recent trend.',
  })
  assert.equal(report.evidence, providerEvidence)
  assert.deepEqual(report.findings, [
    {
      code: 'recent-demand-increase',
      keyword: 'growing',
      evidenceRef: 'evidence.data[0].monthlySearches',
      principle:
        'Provider search-volume history is prioritization context, not a traffic or ranking forecast.',
      detail:
        'growing has a recent three-month average of 200, compared with 100 in the preceding three months.',
    },
  ])
  assert.equal(captured?.context?.projectId, 'project-1')
  assert.equal(captured?.context?.reportId, 'keyword-metrics')
  assert.match(captured?.context?.reportRunId ?? '', /^[0-9a-f-]{36}$/)
})

test('keyword metrics report accepts an owning report spend context', async () => {
  let captured:
    | Parameters<KeywordMetricsProvider['keywordMetrics']>[0]
    | undefined
  await keywordMetricsReport(
    {
      keywords: ['query'],
      market,
      projectId: 'fallback-project',
      context: {
        projectId: 'owning-project',
        reportId: 'keyword-opportunities',
        reportRunId: 'report-run-1',
      },
    },
    {
      candidates: [
        candidate(async (input) => {
          captured = input
          return evidence([metric('query')])
        }),
      ],
    },
  )

  assert.deepEqual(captured?.context, {
    projectId: 'owning-project',
    reportId: 'keyword-opportunities',
    reportRunId: 'report-run-1',
  })
})

test('keyword metrics report preserves partial, unavailable, and provider error states', async () => {
  const partial = await keywordMetricsReport(
    { keywords: ['invalid'], market },
    {
      candidates: [
        candidate(async () =>
          evidence(
            [
              metric('invalid', {
                monthlySearchVolume: unavailableValue(
                  'invalid',
                  'Provider returned a negative value.',
                ),
                cpcUsd: observedValue(1),
              }),
            ],
            'partial',
          ),
        ),
      ],
    },
  )
  assert.equal(partial.dataStatus, 'partial')

  const unavailable = await keywordMetricsReport(
    { keywords: ['missing'], market },
    {
      candidates: [
        candidate(async () =>
          evidence([
            metric('missing', {
              monthlySearchVolume: missing('monthlySearchVolume'),
            }),
          ]),
        ),
      ],
    },
  )
  assert.equal(unavailable.dataStatus, 'unavailable')

  await assert.rejects(
    keywordMetricsReport(
      { keywords: ['query'], market },
      {
        candidates: [
          candidate(async () => {
            throw new ProviderError({
              provider: 'dataforseo',
              operation: 'keyword-metrics',
              code: 'rate-limit',
              message: 'Provider rate limit reached.',
            })
          }),
        ],
      },
    ),
    (error) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'RATE_LIMITED',
  )
})

test('keyword metrics report rejects invalid and disconnected requests before provider work', async () => {
  let calls = 0
  const disconnected = candidate(async () => {
    calls += 1
    return evidence([])
  }, false)
  await assert.rejects(
    keywordMetricsReport(
      {
        keywords: ['one two three four five six seven eight nine ten eleven'],
        market,
      },
      { candidates: [disconnected] },
    ),
    /at most 80 characters and 10 words/,
  )
  await assert.rejects(
    keywordMetricsReport(
      { keywords: ['query'], market },
      { candidates: [disconnected] },
    ),
    /No connected provider can supply keyword metrics/,
  )
  assert.equal(calls, 0)
})
