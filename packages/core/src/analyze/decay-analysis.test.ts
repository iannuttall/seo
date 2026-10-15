import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GscRow } from '../types.js'
import { analyzeDecay } from './site-diagnostics/decay-analysis.js'

function row(input: {
  query: string
  page: string
  clicks: number
  impressions?: number
  ctr?: number
  position?: number
}): GscRow {
  const impressions = input.impressions ?? 100
  return {
    keys: [input.query, input.page],
    clicks: input.clicks,
    impressions,
    ctr: input.ctr ?? input.clicks / impressions,
    position: input.position ?? 5,
  }
}

test('missing current rows are recorded and never converted to zero', () => {
  const result = analyzeDecay({
    site: 'sc-domain:example.com',
    currentRows: [],
    previousRows: [
      row({
        query: 'technical seo audit',
        page: 'https://example.com/audit',
        clicks: 8,
      }),
    ],
  })

  assert.deepEqual(result.items, [])
  assert.equal(result.selection.currentRowNotRetained, 1)
  assert.equal(result.selection.eligibleRows, 0)
  assert.equal(result.totals.eligibleObservedRetainedQueryClickLoss, 0)
})

test('a query retained on another URL is classified as a URL shift exclusion', () => {
  const result = analyzeDecay({
    site: 'sc-domain:example.com',
    currentRows: [
      row({
        query: 'technical seo audit',
        page: 'https://example.com/new',
        clicks: 9,
      }),
    ],
    previousRows: [
      row({
        query: 'technical seo audit',
        page: 'https://example.com/old',
        clicks: 10,
      }),
    ],
  })

  assert.deepEqual(result.items, [])
  assert.equal(result.selection.urlShiftRows, 1)
  assert.equal(result.selection.currentRowNotRetained, 0)
})

test('classifies CTR, impression, and residual click declines', () => {
  const cases = [
    {
      query: 'ctr decline',
      previous: { clicks: 10, impressions: 100 },
      current: { clicks: 5, impressions: 100 },
      diagnosis: 'lost_ctr',
    },
    {
      query: 'impression decline',
      previous: { clicks: 10, impressions: 100 },
      current: { clicks: 5, impressions: 50 },
      diagnosis: 'lost_impressions',
    },
    {
      query: 'residual click decline',
      previous: { clicks: 100, impressions: 1_000 },
      current: { clicks: 85, impressions: 920 },
      diagnosis: 'lost_clicks',
    },
  ] as const

  for (const candidate of cases) {
    const page = `https://example.com/${candidate.query.replaceAll(' ', '-')}`
    const result = analyzeDecay({
      site: 'sc-domain:example.com',
      previousRows: [
        row({ query: candidate.query, page, ...candidate.previous }),
      ],
      currentRows: [
        row({ query: candidate.query, page, ...candidate.current }),
      ],
      minDropPct: 0,
      includeBrand: true,
    })

    assert.equal(result.items[0]?.diagnosis, candidate.diagnosis)
  }
})

test('duplicate rows aggregate with weighted position and stable ordering', () => {
  const currentRows = [
    row({
      query: 'SEO Audit',
      page: 'https://example.com/audit',
      clicks: 2,
      impressions: 20,
      position: 10,
    }),
    row({
      query: 'seo audit',
      page: 'https://example.com/audit',
      clicks: 2,
      impressions: 80,
      position: 5,
    }),
  ]
  const previousRows = [
    row({
      query: 'seo audit',
      page: 'https://example.com/audit',
      clicks: 12,
      impressions: 100,
      position: 4,
    }),
  ]
  const input = {
    site: 'sc-domain:example.com',
    currentRows,
    previousRows,
  }

  const first = analyzeDecay(input)
  const reversed = analyzeDecay({
    ...input,
    currentRows: [...currentRows].reverse(),
    previousRows: [...previousRows].reverse(),
  })

  assert.deepEqual(first, reversed)
  assert.equal(first.selection.currentAggregatedRows, 1)
  assert.equal(first.items[0]?.current.position, 6)
  assert.equal(first.items[0]?.current.clicks, 4)
  assert.equal(first.items[0]?.clickLoss, 8)
})
