import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GscRow } from '../types.js'
import { analyzeCtrUnderperformersFromRows } from './ctr-underperformers.js'

function row(input: {
  query: string
  url: string
  clicks: number
  impressions: number
  position: number
}): GscRow {
  return {
    keys: [input.query, input.url],
    clicks: input.clicks,
    impressions: input.impressions,
    ctr: input.impressions ? input.clicks / input.impressions : 0,
    position: input.position,
  }
}

test('CTR analysis uses site peers without benchmarking a row against itself', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })
  const peers = [20, 18, 15, 12, 10].map((clicks, index) =>
    row({
      query: `seo peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
      impressions: 1000,
      position: 9,
    }),
  )

  const result = analyzeCtrUnderperformersFromRows({
    rows: [candidate, ...peers],
    site: 'sc-domain:example.com',
  })

  const item = result.items.find(
    (underperformer) => underperformer.query === candidate.keys[0],
  )
  assert.ok(item)
  assert.equal(item.expectedCtr, 0.018)
  assert.equal(item.benchmark.source.includes('leave_one_out'), true)
  assert.equal(item.benchmark.peerRows, 5)
  assert.equal(item.benchmark.qualifiedPeerImpressions, 5000)
  assert.equal(item.clickShortfall, 180)
})

test('CTR analysis keeps brand and junk rows out of the peer benchmark', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })
  const peers = [20, 18, 15, 12, 10].map((clicks, index) =>
    row({
      query: `seo peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
      impressions: 1000,
      position: 9,
    }),
  )
  const excludedPeers = [
    ...Array.from({ length: 5 }, (_, index) =>
      row({
        query: `example branded ${index}`,
        url: `https://example.com/brand-${index}`,
        clicks: 900,
        impressions: 1000,
        position: 9,
      }),
    ),
    row({
      query: 'site:example.com',
      url: 'https://example.com/operator',
      clicks: 900,
      impressions: 1000,
      position: 9,
    }),
  ]

  const result = analyzeCtrUnderperformersFromRows({
    rows: [candidate, ...peers, ...excludedPeers],
    site: 'sc-domain:example.com',
    brandTerms: ['example'],
  })

  const item = result.items.find(
    (underperformer) => underperformer.query === candidate.keys[0],
  )
  assert.ok(item)
  assert.equal(item.expectedCtr, 0.018)
  assert.equal(item.benchmark.peerRows, 5)
})

test('qualified rows below the reporting threshold still inform benchmarks', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })
  const peers = Array.from({ length: 10 }, (_, index) =>
    row({
      query: `seo peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks: index < 5 ? 2 : 1,
      impressions: 100,
      position: 9,
    }),
  )

  const result = analyzeCtrUnderperformersFromRows({
    rows: [candidate, ...peers],
    site: 'sc-domain:example.com',
    minImpressions: 200,
  })

  assert.equal(result.items.length, 1)
  assert.equal(
    result.items[0]?.benchmark.source.includes('site_gsc_position_bucket'),
    true,
  )
  assert.equal(result.items[0]?.benchmark.qualifiedPeerImpressions, 1000)
})

test('CTR analysis breaks complete ties by query and URL', () => {
  const result = analyzeCtrUnderperformersFromRows({
    rows: [
      row({
        query: 'beta query',
        url: 'https://example.com/b',
        clicks: 0,
        impressions: 1000,
        position: 5,
      }),
      row({
        query: 'alpha query',
        url: 'https://example.com/z',
        clicks: 0,
        impressions: 1000,
        position: 5,
      }),
      row({
        query: 'alpha query',
        url: 'https://example.com/a',
        clicks: 0,
        impressions: 1000,
        position: 5,
      }),
    ],
    site: 'sc-domain:example.com',
  })

  assert.deepEqual(
    result.items.map((item) => [item.query, item.url]),
    [
      ['alpha query', 'https://example.com/a'],
      ['alpha query', 'https://example.com/z'],
      ['beta query', 'https://example.com/b'],
    ],
  )
})

test('CTR analysis excludes brand, junk, and low-impression candidates', () => {
  const result = analyzeCtrUnderperformersFromRows({
    rows: [
      row({
        query: 'example login',
        url: 'https://example.com/login',
        clicks: 0,
        impressions: 1000,
        position: 5,
      }),
      row({
        query: 'site:example.com',
        url: 'https://example.com/',
        clicks: 0,
        impressions: 1000,
        position: 5,
      }),
      row({
        query: 'technical seo audit',
        url: 'https://example.com/audit',
        clicks: 0,
        impressions: 199,
        position: 5,
      }),
    ],
    site: 'sc-domain:example.com',
    brandTerms: ['example'],
  })

  assert.deepEqual(result.items, [])
})
