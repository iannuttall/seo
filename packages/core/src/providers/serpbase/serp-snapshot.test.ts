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
      depth: 11,
    }),
    /depth must be from 1 to 10/,
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
