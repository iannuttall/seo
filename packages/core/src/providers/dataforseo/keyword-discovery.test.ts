import assert from 'node:assert/strict'
import test from 'node:test'
import { ProviderError } from '../errors.js'
import type {
  DataForSeoKeywordDiscoveryRequest,
  DataForSeoKeywordDiscoverySnapshot,
} from './client.js'
import { dataForSeoDiscoveryResponseSchema } from './discovery-schema.js'
import { DataForSeoKeywordDiscoveryProvider } from './keyword-discovery.js'

function snapshot(input: {
  seed?: string
  seeds?: string[]
  items: unknown[]
  total?: number
  observedAt?: string
}): DataForSeoKeywordDiscoverySnapshot {
  return {
    response: dataForSeoDiscoveryResponseSchema.parse({
      status_code: 20000,
      status_message: 'Ok.',
      cost: 0.01224,
      tasks_count: 1,
      tasks_error: 0,
      tasks: [
        {
          id: 'task-id',
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0.01224,
          result_count: 1,
          result: [
            {
              seed_keyword: input.seed,
              seed_keywords: input.seeds,
              total_count: input.total ?? input.items.length,
              items_count: input.items.length,
              items: input.items,
            },
          ],
        },
      ],
    }),
    observedAt: input.observedAt ?? '2026-07-21T12:00:00.000Z',
    returnedRows: input.items.length,
    providerTotalRows: input.total ?? input.items.length,
    nextCursor: null,
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 12_240,
      actualMicros: 12_240,
      taskIds: ['task-id'],
    },
    spendNotice: null,
    warnings: [],
  }
}

test('keyword discovery combines explicit sources and duplicate evidence', async () => {
  const requests: DataForSeoKeywordDiscoveryRequest[] = []
  const provider = new DataForSeoKeywordDiscoveryProvider({
    client: {
      keywordDiscovery: async (input) => {
        requests.push(input)
        if (input.source === 'ideas') {
          return snapshot({
            seeds: input.seeds,
            total: 50,
            items: [
              {
                keyword: 'shared idea',
                keyword_info: { search_volume: 100 },
              },
              {
                keyword: 'zero idea',
                keyword_info: { search_volume: 0 },
              },
            ],
          })
        }
        return snapshot({
          seed: input.seeds[0],
          total: 20,
          items: [
            {
              keyword: 'shared idea',
              keyword_info: { search_volume: 100 },
            },
            {
              keyword: `${input.seeds[0]} suggestion`,
              keyword_info: { search_volume: 10 },
            },
          ],
        })
      },
    },
  })

  const result = await provider.discoverKeywords({
    seeds: ['Second Seed', 'first seed'],
    sources: ['suggestions', 'ideas'],
    market: { countryCode: 'US', languageCode: 'en', searchEngine: 'google' },
    limit: 6,
  })

  assert.deepEqual(
    requests.map(({ source, seeds, limit }) => ({ source, seeds, limit })),
    [
      { source: 'ideas', seeds: ['first seed', 'second seed'], limit: 2 },
      { source: 'suggestions', seeds: ['first seed'], limit: 2 },
      { source: 'suggestions', seeds: ['second seed'], limit: 2 },
    ],
  )
  assert.equal(result.data[0]?.keyword, 'shared idea')
  assert.deepEqual(result.data[0]?.sources, [
    { seed: 'first seed', source: 'ideas' },
    { seed: 'second seed', source: 'ideas' },
    { seed: 'first seed', source: 'suggestions' },
    { seed: 'second seed', source: 'suggestions' },
  ])
  const zero = result.data.find((idea) => idea.keyword === 'zero idea')
  assert.deepEqual(zero?.monthlySearchVolume, { state: 'observed', value: 0 })
  assert.equal(result.coverage.requestedRows, 6)
  assert.equal(result.coverage.returnedRows, 6)
  assert.equal(result.coverage.retainedRows, 4)
  assert.equal(result.coverage.completeness, 'capped')
  assert.equal(result.cost.actualMicros, 36_720)
})

test('keyword discovery preserves successful calls when one seed fails', async () => {
  const provider = new DataForSeoKeywordDiscoveryProvider({
    client: {
      keywordDiscovery: async (input) => {
        if (input.seeds[0] === 'second seed') {
          throw new ProviderError({
            provider: 'dataforseo',
            operation: 'keyword-discovery',
            code: 'remote-error',
            message: 'Task failed.',
          })
        }
        return snapshot({
          seed: input.seeds[0],
          items: [{ keyword: 'retained idea' }],
        })
      },
    },
  })

  const result = await provider.discoverKeywords({
    seeds: ['first seed', 'second seed'],
    sources: ['related'],
    market: { countryCode: 'US', languageCode: 'en', searchEngine: 'google' },
    limit: 4,
  })

  assert.equal(result.coverage.completeness, 'partial')
  assert.equal(result.data.length, 1)
  assert.equal(
    result.warnings.some(
      (warning) => warning.code === 'discovery-request-failed',
    ),
    true,
  )
})

test('keyword discovery bounds request fanout before acquisition', async () => {
  let calls = 0
  const provider = new DataForSeoKeywordDiscoveryProvider({
    client: {
      keywordDiscovery: async () => {
        calls += 1
        return snapshot({ items: [] })
      },
    },
  })

  await assert.rejects(
    provider.discoverKeywords({
      seeds: ['one', 'two', 'three'],
      sources: ['related', 'suggestions'],
      market: { countryCode: 'US', languageCode: 'en', searchEngine: 'google' },
      limit: 5,
    }),
    /limit of at least 6/,
  )
  assert.equal(calls, 0)
})
