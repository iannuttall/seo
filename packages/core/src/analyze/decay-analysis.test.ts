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

test('observed rows return non-exclusive movement signals and generic advice', () => {
  const result = analyzeDecay({
    site: 'sc-domain:example.com',
    currentRows: [
      row({
        query: 'technical seo checklist',
        page: 'https://example.com/guides/checklist',
        clicks: 2,
        impressions: 40,
        position: 9,
      }),
    ],
    previousRows: [
      row({
        query: 'technical seo checklist',
        page: 'https://example.com/guides/checklist',
        clicks: 10,
        impressions: 100,
        position: 5,
      }),
    ],
  })

  assert.deepEqual(result.items[0]?.signals, [
    'click_decline',
    'position_decline',
    'impression_decline',
  ])
  assert.equal(result.items[0]?.diagnosis, 'lost_position')
  assert.equal(result.items[0]?.evidenceScope, 'retained-query-page-row')
  assert.match(result.items[0]?.recommendation.action ?? '', /indexability/)
  assert.doesNotMatch(result.items[0]?.recommendation.action ?? '', /salary/)
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

test('limits output without changing eligible totals', () => {
  const previousRows = [1, 2, 3].map((value) =>
    row({
      query: `seo guide ${value}`,
      page: `https://example.com/guides/${value}`,
      clicks: 10 + value,
    }),
  )
  const currentRows = [1, 2, 3].map((value) =>
    row({
      query: `seo guide ${value}`,
      page: `https://example.com/guides/${value}`,
      clicks: value,
    }),
  )
  const result = analyzeDecay({
    site: 'sc-domain:example.com',
    currentRows,
    previousRows,
    limit: 1,
  })

  assert.equal(result.selection.eligibleRows, 3)
  assert.equal(result.selection.returnedRows, 1)
  assert.equal(result.selection.limitedRows, 2)
  assert.equal(result.totals.eligibleObservedRetainedQueryClickLoss, 30)
  assert.equal(result.totals.returnedObservedRetainedQueryClickLoss, 10)
})

test('filters brand and search artifacts but preserves model and numeric queries', () => {
  const candidates = [
    'example login',
    'site:example.com audit',
    '7555bdt',
    '2026',
    '技術 seo',
  ]
  const previousRows = candidates.map((query, index) =>
    row({
      query,
      page: `https://example.com/${index}`,
      clicks: 10,
    }),
  )
  const currentRows = candidates.map((query, index) =>
    row({
      query,
      page: `https://example.com/${index}`,
      clicks: 2,
    }),
  )
  const result = analyzeDecay({
    site: 'sc-domain:example.com',
    brandTerms: ['example'],
    currentRows,
    previousRows,
  })

  assert.deepEqual(
    result.items.map((item) => item.query).sort(),
    ['2026', '7555bdt', '技術 seo'].sort(),
  )
  assert.equal(result.selection.brandRows, 1)
  assert.equal(result.selection.lowActionabilityRows, 1)
})

test('counts invalid rows instead of leaking malformed evidence', () => {
  const invalid = row({
    query: 'technical seo',
    page: 'not-a-url',
    clicks: 10,
  })
  const result = analyzeDecay({
    site: 'sc-domain:example.com',
    currentRows: [{ ...invalid, clicks: Number.NaN }],
    previousRows: [invalid],
  })

  assert.equal(result.selection.currentInvalidRows, 1)
  assert.equal(result.selection.previousInvalidRows, 1)
  assert.deepEqual(result.items, [])
})

test('zero thresholds still require a positive baseline and real decline', () => {
  const previousRows = [
    row({
      query: 'zero baseline',
      page: 'https://example.com/zero',
      clicks: 0,
    }),
    row({
      query: 'flat clicks',
      page: 'https://example.com/flat',
      clicks: 5,
    }),
  ]
  const result = analyzeDecay({
    site: 'sc-domain:example.com',
    currentRows: [...previousRows],
    previousRows,
    minPreviousClicks: 0,
    minClickLoss: 0,
    minDropPct: 0,
  })

  assert.deepEqual(result.items, [])
  assert.equal(result.selection.lowEvidenceRows, 1)
  assert.equal(result.selection.belowClickLossRows, 1)
})
