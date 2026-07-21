import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  DataForSeoKeywordOverviewRequest,
  DataForSeoKeywordOverviewSnapshot,
} from './client.js'
import { DataForSeoKeywordMetricsProvider } from './keyword-metrics.js'
import type { DataForSeoKeywordOverviewItem } from './schema.js'

type KeywordOverviewInput = DataForSeoKeywordOverviewRequest

function snapshot(
  items: DataForSeoKeywordOverviewItem[],
): DataForSeoKeywordOverviewSnapshot {
  return {
    response: {
      status_code: 20000,
      status_message: 'Ok.',
      cost: 0.0102,
      tasks_count: 1,
      tasks_error: 0,
      tasks: [
        {
          id: 'task-1',
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0.0102,
          result_count: 1,
          result: [{ items_count: items.length, items }],
        },
      ],
    },
    observedAt: '2026-07-21T12:00:00.000Z',
    returnedRows: items.length,
    cache: {
      status: 'miss',
      storedAt: null,
      expiresAt: null,
    },
    cost: {
      currency: 'USD',
      estimatedMicros: 10_200,
      actualMicros: 10_200,
      taskIds: ['task-1'],
    },
    spendNotice: null,
    warnings: [],
  }
}

test('keyword metrics translates a neutral market and preserves observed zero', async () => {
  let requested: KeywordOverviewInput | undefined
  const provider = new DataForSeoKeywordMetricsProvider({
    client: {
      keywordOverview: async (input) => {
        requested = input
        return snapshot([
          {
            keyword: 'seo tool',
            keyword_info: {
              search_volume: null,
              cpc: null,
              competition: null,
            },
          },
          {
            keyword: 'other query',
            keyword_info: {
              search_volume: 0,
              cpc: 0,
              competition: 0,
              last_updated_time: '2026-07-01 00:00:00 +00:00',
              monthly_searches: [
                { year: 2026, month: 1, search_volume: 0 },
                { year: 2025, month: 12, search_volume: 10 },
              ],
            },
            keyword_properties: { keyword_difficulty: 0 },
            search_intent_info: { main_intent: 'informational' },
            serp_info: { se_results_count: '0' },
          },
        ])
      },
    },
  })

  const result = await provider.keywordMetrics({
    keywords: ['SEO Tool', 'seo   tool', 'other query'],
    market: {
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en-GB',
      device: 'mobile',
    },
    context: {
      projectId: 'project-1',
      reportId: 'keyword-opportunities',
      reportRunId: 'run-1',
    },
  })

  assert.deepEqual(requested, {
    keywords: ['other query', 'seo tool'],
    languageCode: 'en',
    locationName: 'United Kingdom',
    includeSerpInfo: true,
    refresh: undefined,
    projectId: 'project-1',
    reportId: 'keyword-opportunities',
    reportRunId: 'run-1',
  })
  assert.deepEqual(
    result.data.map((item) => item.keyword),
    ['other query', 'seo tool'],
  )
  assert.deepEqual(result.data[0], {
    keyword: 'other query',
    monthlySearchVolume: { state: 'observed', value: 0 },
    monthlySearches: {
      state: 'observed',
      value: [
        { year: 2025, month: 12, searchVolume: 10 },
        { year: 2026, month: 1, searchVolume: 0 },
      ],
    },
    searchVolumeUpdatedAt: {
      state: 'observed',
      value: '2026-07-01T00:00:00.000Z',
    },
    cpcUsd: { state: 'observed', value: 0 },
    paidCompetition: { state: 'observed', value: 0 },
    keywordDifficulty: { state: 'observed', value: 0 },
    intent: { state: 'observed', value: 'informational' },
    resultCount: { state: 'observed', value: 0 },
  })
  assert.equal(result.data[1]?.monthlySearchVolume.state, 'missing')
  assert.equal(result.coverage.completeness, 'complete')
  assert.deepEqual(
    result.warnings.map((warning) => warning.code),
    [
      'provider-language-normalized',
      'metric-not-device-segmented',
      'duplicate-keywords-removed',
    ],
  )
})

test('keyword metrics marks omitted, unexpected, and corrupt provider data', async () => {
  const provider = new DataForSeoKeywordMetricsProvider({
    client: {
      keywordOverview: async () =>
        snapshot([
          {
            keyword: 'alpha',
            keyword_info: {
              search_volume: -1,
              cpc: null,
              competition: 1.5,
              last_updated_time: 'not-a-date',
              monthly_searches: [{ year: 2026, month: 13, search_volume: 10 }],
            },
            keyword_properties: { keyword_difficulty: 101 },
            serp_info: { se_results_count: 'not-a-count' },
          },
          { keyword: 'not requested' },
        ]),
    },
  })

  const result = await provider.keywordMetrics({
    keywords: ['alpha', 'beta'],
    market: { countryCode: 'US', languageCode: 'en', searchEngine: 'google' },
  })

  assert.equal(result.coverage.completeness, 'partial')
  assert.equal(result.coverage.invalidRows, 1)
  assert.equal(result.data[0]?.monthlySearchVolume.state, 'invalid')
  assert.equal(result.data[0]?.monthlySearches.state, 'invalid')
  assert.equal(result.data[0]?.searchVolumeUpdatedAt.state, 'invalid')
  assert.equal(result.data[0]?.paidCompetition.state, 'invalid')
  assert.equal(result.data[0]?.keywordDifficulty.state, 'invalid')
  assert.equal(result.data[0]?.resultCount.state, 'invalid')
  assert.ok(
    Object.values(result.data[1] ?? {})
      .filter((value) => typeof value === 'object')
      .every((value) => value.state === 'missing'),
  )
  assert.deepEqual(
    result.warnings.map((warning) => warning.code),
    ['unexpected-provider-keyword', 'provider-keywords-omitted'],
  )
})

test('duplicate provider rows resolve deterministically and expose conflicts', async () => {
  const rows = [
    {
      keyword: 'query',
      keyword_info: {
        search_volume: 100,
        cpc: 1,
        monthly_searches: [{ year: 2026, month: 1, search_volume: 90 }],
      },
    },
    {
      keyword: 'query',
      keyword_info: {
        search_volume: 100,
        cpc: 2,
        monthly_searches: [{ year: 2026, month: 1, search_volume: 90 }],
      },
    },
  ]
  const run = async (items: typeof rows) =>
    new DataForSeoKeywordMetricsProvider({
      client: { keywordOverview: async () => snapshot(items) },
    }).keywordMetrics({
      keywords: ['query'],
      market: { countryCode: 'US', languageCode: 'en', searchEngine: 'google' },
    })

  const first = await run(rows)
  const second = await run([...rows].reverse())
  assert.deepEqual(first.data, second.data)
  assert.deepEqual(first.data[0]?.monthlySearchVolume, {
    state: 'observed',
    value: 100,
  })
  assert.equal(first.data[0]?.cpcUsd.state, 'invalid')
  assert.deepEqual(first.data[0]?.monthlySearches, {
    state: 'observed',
    value: [{ year: 2026, month: 1, searchVolume: 90 }],
  })
  assert.equal(
    first.warnings.some(
      (warning) => warning.code === 'duplicate-provider-keyword',
    ),
    true,
  )
})

test('keyword metrics prefers an explicit location code and rejects unsupported acquisition', async () => {
  let requested: KeywordOverviewInput | undefined
  let calls = 0
  const provider = new DataForSeoKeywordMetricsProvider({
    client: {
      keywordOverview: async (input) => {
        calls += 1
        requested = input
        return snapshot([{ keyword: 'query' }])
      },
    },
  })
  await provider.keywordMetrics({
    keywords: ['query'],
    market: {
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en',
      location: { code: 1006886, name: 'London,England,United Kingdom' },
    },
  })
  assert.equal(requested?.locationCode, 1006886)
  assert.equal(requested?.locationName, undefined)

  await assert.rejects(
    provider.keywordMetrics({
      keywords: ['query'],
      market: { searchEngine: 'bing', countryCode: 'GB', languageCode: 'en' },
    }),
    /currently supports Google markets/,
  )
  await assert.rejects(
    provider.keywordMetrics({
      keywords: ['one two three four five six seven eight nine ten eleven'],
      market: { searchEngine: 'google', countryCode: 'GB', languageCode: 'en' },
    }),
    /at most 80 characters and 10 words/,
  )
  assert.equal(calls, 1)
})
