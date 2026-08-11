import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SerpBaseSearchSnapshot } from './client.js'
import { serpBaseSearchSuccessSchema } from './schema.js'
import { SerpBaseSerpSnapshotProvider } from './serp-snapshot.js'

function snapshot(): SerpBaseSearchSnapshot {
  return {
    response: serpBaseSearchSuccessSchema.parse({
      status: 0,
      request_id: 'request-1',
      elapsed_ms: 10,
      credits_charged: 1,
      search_type: 'search',
      query: 'corrected query',
      page: 1,
      organic: [
        {
          rank: 2,
          title: 'Second',
          link: 'https://second.example/page',
        },
        {
          rank: 1,
          title: 'First',
          link: 'https://user:password@first.example/page',
          snippet: 'First result.',
        },
        { rank: 3, title: 'Invalid', link: 'javascript:alert(1)' },
      ],
      featured_snippet: { title: 'Answer' },
      ai_overview: { summary: 'Summary' },
      people_also_ask: [],
    }),
    observedAt: '2026-08-11T08:00:00.000Z',
    returnedRows: 3,
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 500,
      actualMicros: null,
      taskIds: ['request-1'],
      native: {
        unit: 'credit',
        estimatedUnits: 1,
        actualUnits: 1,
        remainingBefore: null,
      },
    },
    spendNotice: null,
    warnings: [],
  }
}

function pageSnapshot(page: number, rows = 10): SerpBaseSearchSnapshot {
  const base = snapshot()
  return {
    ...base,
    response: serpBaseSearchSuccessSchema.parse({
      ...base.response,
      request_id: `request-${page}`,
      query: 'query',
      page,
      organic: Array.from({ length: rows }, (_, index) => ({
        rank: index + 1,
        title: `Result ${page}-${index + 1}`,
        link: `https://result-${page}-${index + 1}.example/page`,
      })),
    }),
    returnedRows: rows,
    cost: {
      ...base.cost,
      taskIds: [`request-${page}`],
    },
  }
}

test('SERP adapter maps ranks, features, invalid rows, and cost semantics', async () => {
  const provider = new SerpBaseSerpSnapshotProvider({
    client: { search: async () => snapshot() },
  })
  const result = await provider.serpSnapshot({
    keyword: 'query',
    market: {
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en',
      device: 'mobile',
    },
    depth: 10,
  })

  assert.equal(result.provider, 'serpbase')
  assert.equal(result.data.keyword, 'query')
  assert.equal(result.data.effectiveKeyword, 'corrected query')
  assert.deepEqual(result.data.features, [
    'ai_overview',
    'featured_snippet',
    'organic',
  ])
  assert.deepEqual(
    result.data.organicResults.map((item) => [
      item.rankAbsolute,
      item.domain,
      item.url,
    ]),
    [
      [1, 'first.example', 'https://first.example/page'],
      [2, 'second.example', 'https://second.example/page'],
    ],
  )
  assert.equal(result.coverage.invalidRows, 1)
  assert.equal(result.coverage.completeness, 'partial')
  assert.equal(result.data.localPack.present, false)
  assert.match(
    result.warnings.find(
      (warning) => warning.code === 'estimated-monetary-cost',
    )?.message ?? '',
    /account-specific/,
  )
})

test('SERP adapter rejects unsupported depth and canonical locations', async () => {
  const provider = new SerpBaseSerpSnapshotProvider({
    client: { search: async () => snapshot() },
  })
  await assert.rejects(
    provider.serpSnapshot({
      keyword: 'query',
      market: {
        searchEngine: 'google',
        countryCode: 'GB',
        languageCode: 'en',
      },
      depth: 101,
    }),
    /depth must be from 1 to 100/,
  )
  await assert.rejects(
    provider.serpSnapshot({
      keyword: 'query',
      market: {
        searchEngine: 'google',
        countryCode: 'GB',
        languageCode: 'en',
        location: { name: 'London,England,United Kingdom' },
      },
      depth: 10,
    }),
    /country-level markets/,
  )
})

test('SERP adapter fetches enough pages for depths through 100', async () => {
  const requests: Array<{ page: number; requestedRows: number }> = []
  const provider = new SerpBaseSerpSnapshotProvider({
    client: {
      search: async (input) => {
        requests.push({ page: input.page, requestedRows: input.requestedRows })
        return pageSnapshot(input.page)
      },
    },
  })
  const result = await provider.serpSnapshot({
    keyword: 'query',
    market: {
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en',
    },
    depth: 25,
  })

  assert.deepEqual(requests, [
    { page: 1, requestedRows: 10 },
    { page: 2, requestedRows: 10 },
    { page: 3, requestedRows: 5 },
  ])
  assert.equal(result.data.pagesCount, 3)
  assert.equal(result.data.organicResults.length, 25)
  assert.deepEqual(
    [0, 9, 10, 19, 20, 24].map((index) => ({
      rank: result.data.organicResults[index]?.rankAbsolute,
      page: result.data.organicResults[index]?.page,
    })),
    [
      { rank: 1, page: 1 },
      { rank: 10, page: 1 },
      { rank: 11, page: 2 },
      { rank: 20, page: 2 },
      { rank: 21, page: 3 },
      { rank: 25, page: 3 },
    ],
  )
  assert.equal(result.coverage.completeness, 'capped')
  assert.equal(result.cost.estimatedMicros, 1_500)
  assert.equal(result.cost.native?.actualUnits, 3)
  assert.equal(result.request.filters.pagesRequested, 3)
  assert.ok(
    result.warnings.some((warning) => warning.code === 'page-offset-rank'),
  )
})

test('SERP adapter retains earlier pages when a later page fails', async () => {
  const provider = new SerpBaseSerpSnapshotProvider({
    client: {
      search: async (input) => {
        if (input.page === 3) throw new Error('provider detail')
        return pageSnapshot(input.page)
      },
    },
  })
  const result = await provider.serpSnapshot({
    keyword: 'query',
    market: {
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en',
    },
    depth: 30,
  })

  assert.equal(result.data.organicResults.length, 20)
  assert.equal(result.coverage.completeness, 'partial')
  assert.equal(result.coverage.nextCursor, '3')
  assert.equal(result.request.filters.pagesCollected, 2)
  assert.match(
    result.warnings.find((warning) => warning.code === 'page-fetch-failed')
      ?.message ?? '',
    /page 3/u,
  )
  assert.doesNotMatch(JSON.stringify(result), /provider detail/u)
})
