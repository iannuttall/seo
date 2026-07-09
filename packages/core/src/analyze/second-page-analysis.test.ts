import assert from 'node:assert/strict'
import test from 'node:test'
import type { GscRow } from '../types/pages.js'
import { analyzeSecondPageRows } from './second-page-analysis.js'

const site = 'sc-domain:example.com'

function row(input: {
  query: string
  page?: string
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}): GscRow {
  const clicks = input.clicks ?? 2
  const impressions = input.impressions ?? 100
  return {
    keys: [input.query, input.page ?? 'https://example.com/guide'],
    clicks,
    impressions,
    ctr: input.ctr ?? clicks / impressions,
    position: input.position ?? 15,
  }
}

test('uses greater-than-10 through 20 GSC row position boundaries', () => {
  const analysis = analyzeSecondPageRows({
    site,
    minImpressions: 0,
    rows: [
      row({ query: 'ten', page: 'https://example.com/10', position: 10 }),
      row({
        query: 'over ten',
        page: 'https://example.com/11',
        position: 10.01,
      }),
      row({ query: 'twenty', page: 'https://example.com/20', position: 20 }),
      row({
        query: 'over twenty',
        page: 'https://example.com/21',
        position: 20.01,
      }),
    ],
  })

  assert.equal(analysis.selection.outsidePositionRows, 2)
  assert.deepEqual(
    analysis.items.map((item) => item.primaryQuery),
    ['over ten', 'twenty'],
  )
  assert.deepEqual(analysis.methodology.position, {
    metric: 'gsc_average_position',
    minimumExclusive: 10,
    maximumInclusive: 20,
    appliedAt: 'query_page_row',
  })
})

test('rejects invalid metrics, missing dimensions, and non-http pages', () => {
  const analysis = analyzeSecondPageRows({
    site,
    minImpressions: 0,
    rows: [
      row({ query: '', page: 'https://example.com/a' }),
      row({ query: 'missing page', page: '' }),
      row({ query: 'bad scheme', page: 'ftp://example.com/a' }),
      row({ query: 'negative clicks', clicks: -1 }),
      row({ query: 'too many clicks', clicks: 101, impressions: 100 }),
      row({ query: 'bad ctr', ctr: 1.1 }),
      row({ query: 'nan', position: Number.NaN }),
      row({ query: 'valid' }),
    ],
  })

  assert.equal(analysis.selection.invalidRows, 7)
  assert.equal(analysis.selection.eligibleRows, 1)
  assert.equal(analysis.items[0]?.primaryQuery, 'valid')
})

test('aggregates every eligible query by page before applying the minimum', () => {
  const analysis = analyzeSecondPageRows({
    site,
    minImpressions: 100,
    rows: [
      row({
        query: 'alpha',
        clicks: 5,
        impressions: 60,
        ctr: 5 / 60,
        position: 12,
      }),
      row({
        query: 'beta',
        clicks: 1,
        impressions: 40,
        ctr: 1 / 40,
        position: 18,
      }),
      row({
        query: 'small',
        page: 'https://example.com/small',
        impressions: 99,
      }),
    ],
  })
  const item = analysis.items[0]

  assert.equal(analysis.selection.sourcePages, 2)
  assert.equal(analysis.selection.belowMinimumPages, 1)
  assert.equal(item?.queryCount, 2)
  assert.deepEqual(
    item?.queries.map((query) => query.query),
    ['alpha', 'beta'],
  )
  assert.equal(item?.clicks, 6)
  assert.equal(item?.impressions, 100)
  assert.equal(item?.ctr, 0.06)
  assert.equal(item?.position, 14.4)
  assert.equal(analysis.summary.eligibleQueries, 2)
  assert.equal(analysis.summary.eligibleImpressions, 100)
})

test('ranks complete page aggregates before limiting results', () => {
  const analysis = analyzeSecondPageRows({
    site,
    minImpressions: 0,
    limit: 1,
    rows: [
      row({
        query: 'first part',
        page: 'https://example.com/group',
        impressions: 60,
        position: 11,
      }),
      row({
        query: 'second part',
        page: 'https://example.com/group',
        impressions: 60,
        position: 11,
      }),
      row({
        query: 'single',
        page: 'https://example.com/single',
        impressions: 100,
        position: 11,
      }),
    ],
  })

  assert.equal(analysis.items[0]?.url, 'https://example.com/group')
  assert.equal(analysis.items[0]?.queryCount, 2)
  assert.equal(analysis.selection.eligiblePages, 2)
  assert.equal(analysis.selection.returnedPages, 1)
  assert.equal(analysis.selection.limitedPages, 1)
  assert.equal(analysis.summary.eligibleImpressions, 220)
  assert.equal(analysis.summary.returnedImpressions, 120)
})

test('uses deterministic codepoint ordering for complete ties', () => {
  const inputs = [
    row({ query: 'éclair', page: 'https://example.com/éclair' }),
    row({ query: '東京', page: 'https://example.com/東京' }),
    row({ query: 'apple', page: 'https://example.com/apple' }),
  ]
  const expected = analyzeSecondPageRows({ site, rows: inputs }).items.map(
    (item) => item.url,
  )
  const reversed = analyzeSecondPageRows({
    site,
    rows: [...inputs].reverse(),
  }).items.map((item) => item.url)

  assert.deepEqual(expected, reversed)
  assert.deepEqual(expected, [
    'https://example.com/%C3%A9clair',
    'https://example.com/%E6%9D%B1%E4%BA%AC',
    'https://example.com/apple',
  ])
})

test('supports Unicode brand filtering and reports sparse states', () => {
  const empty = analyzeSecondPageRows({ site, rows: [] })
  const filtered = analyzeSecondPageRows({
    site,
    brandTerms: ['東京'],
    rows: [row({ query: '東京 ガイド' })],
  })

  assert.equal(empty.dataStatus, 'empty')
  assert.equal(filtered.dataStatus, 'filtered')
  assert.equal(filtered.selection.brandRows, 1)
  assert.equal(filtered.items.length, 0)
})

test('normalizes analysis options to documented bounds', () => {
  const high = analyzeSecondPageRows({
    site,
    rows: [],
    minImpressions: Number.POSITIVE_INFINITY,
    limit: 10_000,
  })
  const low = analyzeSecondPageRows({
    site,
    rows: [],
    minImpressions: -5,
    limit: 0,
  })

  assert.equal(high.minImpressions, 50)
  assert.equal(high.limit, 100)
  assert.equal(low.minImpressions, 0)
  assert.equal(low.limit, 1)
})

test('labels priority as a heuristic and avoids unsupported lift claims', () => {
  const item = analyzeSecondPageRows({
    site,
    rows: [row({ query: 'seo guide' })],
  }).items[0]
  assert.equal(item?.priority.heuristic, true)
  assert.equal(item?.priority.estimatedClickLift, false)
  assert.equal(item?.recommendation.confidence, 'low')
  assert.doesNotMatch(
    item?.recommendation.action ?? '',
    /exact|word count|ctr|lift/i,
  )
})
