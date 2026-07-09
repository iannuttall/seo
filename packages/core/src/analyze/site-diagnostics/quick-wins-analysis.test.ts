import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GscRow } from '../../types.js'
import { analyzeQuickWinsFromRows } from './quick-wins-analysis.js'

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

function peerRows(position = 9): GscRow[] {
  return [20, 18, 15, 12, 10].map((clicks, index) =>
    row({
      query: `seo peer ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks,
      impressions: 1000,
      position,
    }),
  )
}

test('quick wins use current-position site peers instead of position three', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })

  const result = analyzeQuickWinsFromRows({
    rows: [candidate, ...peerRows()],
    site: 'sc-domain:example.com',
  })
  const item = result.items.find(
    (quickWin) => quickWin.query === candidate.keys[0],
  )

  assert.ok(item)
  assert.equal(item.expectedCtr, 0.018)
  assert.equal(item.estimatedClickLift, 180)
  assert.equal(item.benchmark.source.includes('leave_one_out'), true)
  assert.equal(item.benchmark.qualifiedPeerImpressions, 5000)
})

test('quick wins exclude rows already beating their position benchmark', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 200,
    impressions: 10_000,
    position: 9,
  })

  const result = analyzeQuickWinsFromRows({
    rows: [candidate, ...peerRows()],
    site: 'sc-domain:example.com',
  })

  assert.equal(
    result.items.some((item) => item.query === candidate.keys[0]),
    false,
  )
})

test('quick wins keep invalid and excluded rows out of peer benchmarks', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })
  const excluded = [
    row({
      query: 'example login',
      url: 'https://example.com/login',
      clicks: 900,
      impressions: 1000,
      position: 9,
    }),
    row({
      query: 'site:example.com',
      url: 'https://example.com/operator',
      clicks: 900,
      impressions: 1000,
      position: 9,
    }),
    row({
      query: 'page two noise',
      url: 'https://example.com/page-two',
      clicks: 900,
      impressions: 1000,
      position: 20,
    }),
  ]

  const result = analyzeQuickWinsFromRows({
    rows: [candidate, ...peerRows(), ...excluded],
    site: 'sc-domain:example.com',
    brandTerms: ['example'],
  })

  assert.equal(result.benchmarkRows, 6)
  assert.equal(result.items[0]?.expectedCtr, 0.018)
})

test('quick wins use qualified peers below the reporting threshold', () => {
  const candidate = row({
    query: 'technical seo audit',
    url: 'https://example.com/audit',
    clicks: 0,
    impressions: 10_000,
    position: 9,
  })
  const peers = Array.from({ length: 10 }, (_, index) =>
    row({
      query: `long-tail peer ${index}`,
      url: `https://example.com/long-tail-${index}`,
      clicks: index < 5 ? 2 : 1,
      impressions: 100,
      position: 9,
    }),
  )

  const result = analyzeQuickWinsFromRows({
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

test('quick wins break equal lift ties by query and URL', () => {
  const result = analyzeQuickWinsFromRows({
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
