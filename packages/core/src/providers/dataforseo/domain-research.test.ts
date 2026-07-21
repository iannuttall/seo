import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  DataForSeoDomainOverviewRequest,
  DataForSeoDomainOverviewSnapshot,
  DataForSeoRankedKeywordsRequest,
  DataForSeoRankedKeywordsSnapshot,
  DataForSeoRankingPagesRequest,
  DataForSeoRankingPagesSnapshot,
  DataForSeoSerpCompetitorsRequest,
  DataForSeoSerpCompetitorsSnapshot,
} from './client.js'
import { DataForSeoDomainResearchProvider } from './domain-research.js'

const market = {
  searchEngine: 'google' as const,
  countryCode: 'US',
  languageCode: 'en',
}

const snapshotEvidence = {
  observedAt: '2026-07-21T10:00:00.000Z',
  returnedRows: 1,
  cache: {
    status: 'miss' as const,
    storedAt: null,
    expiresAt: null,
  },
  cost: {
    currency: 'USD' as const,
    estimatedMicros: 12_120,
    actualMicros: 12_120,
    taskIds: ['task-1'],
  },
  spendNotice: null,
  warnings: [],
}

function task<T>(result: T) {
  return {
    status_code: 20000,
    status_message: 'Ok.',
    cost: 0.01212,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: 'task-1',
        status_code: 20000,
        status_message: 'Ok.',
        cost: 0.01212,
        result_count: 1,
        result: [result],
      },
    ],
  }
}

test('domain overview preserves observed zero metrics', async () => {
  const client = {
    domainOverview: async (_input: DataForSeoDomainOverviewRequest) =>
      ({
        ...snapshotEvidence,
        response: task({
          target: 'example.com',
          metrics: {
            organic: {
              pos_1: 0,
              pos_2_3: 0,
              pos_4_10: 0,
              pos_11_20: 0,
              pos_21_30: 0,
              pos_31_40: 0,
              pos_41_50: 0,
              pos_51_60: 0,
              pos_61_70: 0,
              pos_71_80: 0,
              pos_81_90: 0,
              pos_91_100: 0,
              etv: 0,
              count: 0,
              estimated_paid_traffic_cost: 0,
              is_new: 0,
              is_up: 0,
              is_down: 0,
              is_lost: 0,
            },
          },
        }),
      }) as DataForSeoDomainOverviewSnapshot,
    rankedKeywords: async () => assert.fail('unexpected ranked request'),
    rankingPages: async () => assert.fail('unexpected page request'),
    serpCompetitors: async () => assert.fail('unexpected competitor request'),
  }
  const report = await new DataForSeoDomainResearchProvider({
    client,
  }).domainOverview({ domain: 'https://www.example.com/path', market })

  assert.equal(report.data.domain, 'example.com')
  assert.deepEqual(report.data.organic.estimatedMonthlyTraffic, {
    state: 'observed',
    value: 0,
  })
  assert.deepEqual(report.data.organic.rankings, {
    state: 'observed',
    value: {
      first: 0,
      top3: 0,
      top10: 0,
      top20: 0,
      top50: 0,
      top100: 0,
    },
  })
  assert.equal(report.coverage.completeness, 'complete')
})

test('domain overview preserves a successful empty provider result', async () => {
  const client = {
    domainOverview: async () =>
      ({
        ...snapshotEvidence,
        returnedRows: 0,
        response: {
          ...task({}),
          tasks: [
            {
              id: 'task-1',
              status_code: 20000,
              status_message: 'Ok.',
              cost: 0.012,
              result_count: 0,
              result: [],
            },
          ],
        },
      }) as DataForSeoDomainOverviewSnapshot,
    rankedKeywords: async () => assert.fail('unexpected ranked request'),
    rankingPages: async () => assert.fail('unexpected page request'),
    serpCompetitors: async () => assert.fail('unexpected competitor request'),
  }
  const report = await new DataForSeoDomainResearchProvider({
    client,
  }).domainOverview({ domain: 'example.com', market })

  assert.equal(report.coverage.retainedRows, 0)
  assert.equal(report.coverage.completeness, 'complete')
  assert.equal(report.data.organic.rankedKeywords.state, 'missing')
})

test('ranked keywords filters before acquisition and maps bounded rows', async () => {
  let captured: DataForSeoRankedKeywordsRequest | undefined
  const valid = {
    keyword_data: {
      keyword: 'Blue Widget',
      keyword_info: { search_volume: 0, cpc: null, competition: 0 },
      keyword_properties: { keyword_difficulty: 12 },
      search_intent_info: { main_intent: 'commercial' as const },
    },
    ranked_serp_element: {
      serp_item: {
        type: 'organic',
        rank_group: 7,
        rank_absolute: 9,
        url: 'https://example.com/widgets/blue',
        etv: 0,
      },
    },
  }
  const client = {
    domainOverview: async () => assert.fail('unexpected overview request'),
    rankedKeywords: async (input: DataForSeoRankedKeywordsRequest) => {
      captured = input
      return {
        ...snapshotEvidence,
        returnedRows: 3,
        response: task({
          target: 'example.com',
          total_count: 20,
          items_count: 3,
          items: [
            valid,
            valid,
            {
              keyword_data: { keyword: 'missing rank' },
              ranked_serp_element: { serp_item: { type: 'organic' } },
            },
          ],
        }),
      } as DataForSeoRankedKeywordsSnapshot
    },
    rankingPages: async () => assert.fail('unexpected page request'),
    serpCompetitors: async () => assert.fail('unexpected competitor request'),
  }
  const report = await new DataForSeoDomainResearchProvider({
    client,
  }).rankedKeywords({
    target: 'example.com',
    market,
    minSearchVolume: 0,
    maxRank: 20,
    excludeTerms: ['jobs'],
    limit: 10,
  })

  assert.equal(captured?.limit, 10)
  assert.deepEqual(captured?.filters, [
    ['keyword_data.keyword_info.search_volume', '>=', 0],
    'and',
    ['ranked_serp_element.serp_item.rank_group', '<=', 20],
    'and',
    ['keyword_data.keyword', 'not_ilike', '%jobs%'],
  ])
  assert.equal(report.data.rows.length, 1)
  assert.equal(report.data.rows[0]?.keyword, 'blue widget')
  assert.deepEqual(report.data.rows[0]?.monthlySearchVolume, {
    state: 'observed',
    value: 0,
  })
  assert.equal(report.coverage.invalidRows, 1)
  assert.equal(report.coverage.completeness, 'partial')
  assert.ok(
    report.warnings.some(
      (warning) => warning.code === 'duplicate-ranked-keyword-rows',
    ),
  )
})

test('ranking pages collapse duplicate URLs and keep provider caps visible', async () => {
  let captured: DataForSeoRankingPagesRequest | undefined
  const client = {
    domainOverview: async () => assert.fail('unexpected overview request'),
    rankedKeywords: async () => assert.fail('unexpected ranked request'),
    rankingPages: async (input: DataForSeoRankingPagesRequest) => {
      captured = input
      return {
        ...snapshotEvidence,
        returnedRows: 2,
        response: task({
          target: 'example.com',
          total_count: 50,
          items_count: 2,
          items: [
            {
              page_address: 'https://example.com/products/one',
              metrics: { organic: { etv: 5, count: 2 } },
            },
            {
              page_address: 'https://example.com/products/one',
              metrics: { organic: { etv: 5, count: 2 } },
            },
          ],
        }),
      } as DataForSeoRankingPagesSnapshot
    },
    serpCompetitors: async () => assert.fail('unexpected competitor request'),
  }
  const report = await new DataForSeoDomainResearchProvider({
    client,
  }).rankingPages({
    domain: 'example.com',
    market,
    minRankedKeywords: 2,
    limit: 10,
  })

  assert.deepEqual(captured?.filters, [['metrics.organic.count', '>=', 2]])
  assert.equal(report.data.rows.length, 1)
  assert.equal(report.coverage.completeness, 'capped')
  assert.equal(report.coverage.nextCursor, '2')
})

test('domain rows treat an exact page without a provider total as capped', async () => {
  const client = {
    domainOverview: async () => assert.fail('unexpected overview request'),
    rankedKeywords: async () => assert.fail('unexpected ranked request'),
    rankingPages: async () =>
      ({
        ...snapshotEvidence,
        response: task({
          target: 'example.com',
          items_count: 1,
          items: [
            {
              page_address: 'https://example.com/products/one',
              metrics: { organic: { etv: 5, count: 2 } },
            },
          ],
        }),
      }) as DataForSeoRankingPagesSnapshot,
    serpCompetitors: async () => assert.fail('unexpected competitor request'),
  }
  const report = await new DataForSeoDomainResearchProvider({
    client,
  }).rankingPages({ domain: 'example.com', market, limit: 1 })

  assert.equal(report.data.totalRows, null)
  assert.equal(report.coverage.completeness, 'capped')
  assert.equal(report.coverage.nextCursor, '1')
})

test('SERP competitors normalize and order domains deterministically', async () => {
  let captured: DataForSeoSerpCompetitorsRequest | undefined
  const client = {
    domainOverview: async () => assert.fail('unexpected overview request'),
    rankedKeywords: async () => assert.fail('unexpected ranked request'),
    rankingPages: async () => assert.fail('unexpected page request'),
    serpCompetitors: async (input: DataForSeoSerpCompetitorsRequest) => {
      captured = input
      return {
        ...snapshotEvidence,
        returnedRows: 2,
        response: task({
          seed_keywords: ['blue widget', 'red widget'],
          total_count: 2,
          items_count: 2,
          items: [
            {
              domain: 'www.publisher.test',
              avg_position: 4,
              median_position: 3,
              etv: 20,
              keywords_count: 2,
              visibility: 0.5,
              relevant_serp_items: 2,
              keywords_positions: {
                'red widget': [4],
                'blue widget': [2, 3],
              },
            },
            {
              domain: 'shop.test',
              avg_position: 8,
              median_position: 8,
              etv: 2,
              keywords_count: 1,
              visibility: 0.1,
              relevant_serp_items: 1,
              keywords_positions: { 'blue widget': [8] },
            },
            {
              domain: 'invalid.test',
              keywords_count: 3,
            },
          ],
        }),
      } as DataForSeoSerpCompetitorsSnapshot
    },
  }
  const report = await new DataForSeoDomainResearchProvider({
    client,
  }).serpCompetitors({
    keywords: ['Red Widget', 'blue widget', 'red widget'],
    market,
    limit: 10,
  })

  assert.deepEqual(captured?.keywords, ['blue widget', 'red widget'])
  assert.equal(report.data.rows[0]?.domain, 'publisher.test')
  assert.deepEqual(report.data.rows[0]?.keywordPositions, [
    { keyword: 'blue widget', positions: [2, 3] },
    { keyword: 'red widget', positions: [4] },
  ])
  assert.equal(report.coverage.invalidRows, 1)
  assert.equal(report.coverage.completeness, 'partial')
})

test('domain research rejects local Labs markets before a paid call', async () => {
  const client = {
    domainOverview: async () => assert.fail('unexpected overview request'),
    rankedKeywords: async () => assert.fail('unexpected ranked request'),
    rankingPages: async () => assert.fail('unexpected page request'),
    serpCompetitors: async () => assert.fail('unexpected competitor request'),
  }
  await assert.rejects(
    new DataForSeoDomainResearchProvider({ client }).domainOverview({
      domain: 'example.com',
      market: {
        ...market,
        location: { name: 'London, England, United Kingdom' },
      },
    }),
    /country-level markets/u,
  )
})
