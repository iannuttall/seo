import assert from 'node:assert/strict'
import test from 'node:test'
import type { DataForSeoSerpSnapshot } from './client.js'
import { dataForSeoSerpResponseSchema } from './serp-schema.js'
import { DataForSeoSerpSnapshotProvider } from './serp-snapshot.js'

function snapshot(
  items: unknown[],
  keyword = 'query',
  seResultsCount = 1000,
): DataForSeoSerpSnapshot {
  return {
    response: dataForSeoSerpResponseSchema.parse({
      status_code: 20000,
      status_message: 'Ok.',
      cost: 0.002,
      tasks_count: 1,
      tasks_error: 0,
      tasks: [
        {
          id: 'serp-task-id',
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0.002,
          result_count: 1,
          result: [
            {
              keyword,
              se_domain: 'google.com',
              check_url: 'https://google.com/search?q=query',
              datetime: '2026-07-21 12:00:00 +00:00',
              spell: {
                keyword: 'corrected query',
                type: 'showing_results_for',
              },
              item_types: ['organic', 'people_also_ask'],
              se_results_count: seResultsCount,
              pages_count: 1,
              items_count: items.length,
              items,
            },
          ],
        },
      ],
    }),
    observedAt: '2026-07-21T12:00:01.000Z',
    returnedRows: items.length,
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 2_000,
      actualMicros: 2_000,
      taskIds: ['serp-task-id'],
    },
    spendNotice: null,
    warnings: [],
  }
}

test('SERP snapshots retain exact organic ranks and feature evidence', async () => {
  const provider = new DataForSeoSerpSnapshotProvider({
    client: {
      serpLive: async () =>
        snapshot([
          { type: 'people_also_ask', rank_absolute: 1, page: 1 },
          {
            type: 'local_pack',
            rank_group: 2,
            rank_absolute: 3,
            page: 1,
            title: 'Second plumber',
            domain: 'Second-Plumber.Example',
            url: 'https://second-plumber.example/',
            cid: 'cid-2',
            phone: '020 0000 0002',
            is_paid: false,
            rating: {
              rating_type: 'Max5',
              value: 4.5,
              votes_count: 20,
              rating_max: 5,
            },
          },
          {
            type: 'local_pack',
            rank_group: 1,
            rank_absolute: 2,
            page: 1,
            title: 'First plumber',
            domain: 'First-Plumber.Example',
            url: 'https://user:secret@first-plumber.example/',
            cid: 'cid-1',
            phone: '020 0000 0001',
            is_paid: false,
            rating: {
              rating_type: 'Max5',
              value: 5,
              votes_count: 100,
              rating_max: 5,
            },
          },
          {
            type: 'organic',
            rank_group: 2,
            rank_absolute: 3,
            page: 1,
            domain: 'Second.Example',
            url: 'https://second.example/page',
            title: 'Second',
          },
          {
            type: 'organic',
            rank_group: 1,
            rank_absolute: 2,
            page: 1,
            domain: 'First.Example',
            url: 'https://user:secret@first.example/page',
            title: 'First',
            is_featured_snippet: true,
          },
          {
            type: 'organic',
            rank_group: 3,
            rank_absolute: 4,
            page: 1,
            domain: '',
            url: 'not-a-url',
          },
        ]),
    },
  })

  const result = await provider.serpSnapshot({
    keyword: 'Query',
    market: {
      countryCode: 'US',
      languageCode: 'en',
      searchEngine: 'google',
      device: 'mobile',
    },
    depth: 10,
  })

  assert.equal(result.data.keyword, 'query')
  assert.equal(result.data.effectiveKeyword, 'corrected query')
  assert.equal(result.data.checkedAt, '2026-07-21T12:00:00.000Z')
  assert.deepEqual(result.data.features, [
    'local_pack',
    'organic',
    'people_also_ask',
  ])
  assert.deepEqual(
    result.data.organicResults.map((item) => ({
      rank: item.rankAbsolute,
      domain: item.domain,
      url: item.url,
    })),
    [
      {
        rank: 2,
        domain: 'first.example',
        url: 'https://first.example/page',
      },
      {
        rank: 3,
        domain: 'second.example',
        url: 'https://second.example/page',
      },
    ],
  )
  assert.deepEqual(
    result.data.localPack.results.map((item) => ({
      title: item.title,
      rank: item.rankAbsolute,
      domain: item.domain,
      url: item.url,
      cid: item.cid,
      rating: item.rating,
    })),
    [
      {
        title: 'First plumber',
        rank: 2,
        domain: 'first-plumber.example',
        url: 'https://first-plumber.example/',
        cid: 'cid-1',
        rating: {
          type: 'Max5',
          value: 5,
          votesCount: 100,
          maximum: 5,
        },
      },
      {
        title: 'Second plumber',
        rank: 3,
        domain: 'second-plumber.example',
        url: 'https://second-plumber.example/',
        cid: 'cid-2',
        rating: {
          type: 'Max5',
          value: 4.5,
          votesCount: 20,
          maximum: 5,
        },
      },
    ],
  )
  assert.deepEqual(result.data.localPack, {
    present: true,
    returnedRows: 2,
    retainedRows: 2,
    invalidRows: 0,
    results: result.data.localPack.results,
  })
  assert.equal(result.coverage.invalidRows, 1)
  assert.equal(result.coverage.completeness, 'partial')
  assert.equal(result.market.device, 'mobile')
})

test('SERP snapshots fail clearly when the requested query is absent', async () => {
  const empty = snapshot([], 'different query')
  const provider = new DataForSeoSerpSnapshotProvider({
    client: { serpLive: async () => empty },
  })

  await assert.rejects(
    provider.serpSnapshot({
      keyword: 'query',
      market: { countryCode: 'US', languageCode: 'en', searchEngine: 'google' },
      depth: 10,
    }),
    /no matching SERP result/,
  )
})

test('SERP snapshots distinguish a requested depth cap from invalid rows', async () => {
  const provider = new DataForSeoSerpSnapshotProvider({
    client: {
      serpLive: async () =>
        snapshot([
          {
            type: 'organic',
            rank_group: 1,
            rank_absolute: 1,
            page: 1,
            domain: 'first.example',
            url: 'https://first.example/page',
          },
          {
            type: 'organic',
            rank_group: 2,
            rank_absolute: 2,
            page: 1,
            domain: 'second.example',
            url: 'https://second.example/page',
          },
        ]),
    },
  })

  const result = await provider.serpSnapshot({
    keyword: 'query',
    market: { countryCode: 'US', languageCode: 'en', searchEngine: 'google' },
    depth: 1,
  })

  assert.equal(result.coverage.invalidRows, 0)
  assert.equal(result.coverage.retainedRows, 1)
  assert.equal(result.coverage.completeness, 'capped')
})

test('SERP snapshots isolate malformed local-pack rows from valid evidence', async () => {
  const provider = new DataForSeoSerpSnapshotProvider({
    client: {
      serpLive: async () =>
        snapshot([
          {
            type: 'organic',
            rank_group: 1,
            rank_absolute: 1,
            page: 1,
            domain: 'example.test',
            url: 'https://example.test/page',
          },
          {
            type: 'local_pack',
            rank_group: 1,
            rank_absolute: 2,
          },
          {
            type: 'local_pack',
            rank_group: 2,
            rank_absolute: 3,
            title: 'Valid listing',
            url: 'not-a-url',
            rating: { value: 'not-a-number' },
          },
        ]),
    },
  })

  const result = await provider.serpSnapshot({
    keyword: 'query',
    market: { countryCode: 'US', languageCode: 'en', searchEngine: 'google' },
    depth: 10,
  })

  assert.equal(result.data.organicResults.length, 1)
  assert.equal(result.data.localPack.present, true)
  assert.equal(result.data.localPack.returnedRows, 2)
  assert.equal(result.data.localPack.retainedRows, 1)
  assert.equal(result.data.localPack.invalidRows, 1)
  assert.equal(result.data.localPack.results[0]?.url, null)
  assert.equal(result.data.localPack.results[0]?.rating, null)
  assert.equal(result.coverage.invalidRows, 1)
  assert.equal(result.coverage.completeness, 'partial')
  assert.equal(
    result.warnings.some(
      (warning) => warning.code === 'invalid-local-pack-results',
    ),
    true,
  )
})

test('SERP snapshots discard a provider result count below retained rows', async () => {
  const provider = new DataForSeoSerpSnapshotProvider({
    client: {
      serpLive: async () =>
        snapshot(
          [
            {
              type: 'organic',
              rank_group: 1,
              rank_absolute: 1,
              page: 1,
              domain: 'example.test',
              url: 'https://example.test/page',
            },
          ],
          'query',
          0,
        ),
    },
  })

  const result = await provider.serpSnapshot({
    keyword: 'query',
    market: { countryCode: 'US', languageCode: 'en', searchEngine: 'google' },
    depth: 10,
  })

  assert.equal(result.data.resultCount, null)
  assert.equal(result.coverage.providerTotalRows, null)
  assert.equal(result.coverage.completeness, 'partial')
  assert.equal(
    result.warnings.some(
      (warning) => warning.code === 'invalid-serp-result-count',
    ),
    true,
  )
})
