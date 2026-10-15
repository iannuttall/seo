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
