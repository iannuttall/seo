import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GscRow } from '../types.js'
import { collapseFragmentPageRows } from './page-fragments.js'

function row(
  query: string,
  page: string,
  clicks: number,
  impressions: number,
  position: number,
): GscRow {
  return {
    keys: [query, page],
    clicks,
    impressions,
    ctr: clicks / impressions,
    position,
  }
}

test('collapses #fragment URLs and aggregates duplicates', () => {
  const rows = [
    row('flux api', 'https://a.test/flux', 10, 100, 4),
    row('flux api', 'https://a.test/flux#pricing', 5, 300, 8),
    row('flux api', 'https://a.test/other#x', 1, 50, 9),
    row('flux docs', 'https://a.test/flux', 2, 20, 3),
  ]
  const forward = collapseFragmentPageRows(rows)
  const reverse = collapseFragmentPageRows([...rows].reverse())

  assert.deepEqual(forward, reverse)
  assert.deepEqual(forward.rows[0], {
    keys: ['flux api', 'https://a.test/flux'],
    clicks: 15,
    impressions: 400,
    ctr: 15 / 400,
    position: 7,
  })
  assert.deepEqual(forward.rows[1]?.keys, ['flux api', 'https://a.test/other'])
  assert.equal(forward.rows[1]?.impressions, 50)
  assert.deepEqual(forward.provenance, {
    method: 'strip_fragment_sum_clicks_impressions_weighted_position_v1',
    pageKeyIndex: 1,
    sourceRows: 4,
    fragmentRows: 2,
    mergedRows: 1,
    passthroughRows: 0,
    outputRows: 3,
  })
})

test('passes invalid rows through without merging them', () => {
  const valid = row('q', 'https://a.test/p', 1, 10, 5)
  const result = collapseFragmentPageRows(
    [
      valid,
      { ...valid, keys: ['q', 'https://a.test/p#a'], clicks: 11 },
      { ...valid, ctr: Number.NaN },
      { ...valid, keys: ['missing page'] },
    ],
    { pageKeyIndex: 1 },
  )

  assert.equal(result.rows.length, 4)
  assert.equal(result.provenance.mergedRows, 0)
  assert.equal(result.provenance.passthroughRows, 3)
  assert.equal(result.rows[0], valid)
})

test('supports page-only rows', () => {
  const result = collapseFragmentPageRows(
    [
      {
        keys: ['https://a.test/p#a'],
        clicks: 1,
        impressions: 10,
        ctr: 0.1,
        position: 2,
      },
      {
        keys: ['https://a.test/p'],
        clicks: 3,
        impressions: 30,
        ctr: 0.1,
        position: 4,
      },
    ],
    { pageKeyIndex: 0 },
  )
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0]?.impressions, 40)
  assert.equal(result.rows[0]?.position, 3.5)
})
