import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fetchLandingPageValues,
  landingPageRankingPolicy,
  landingPageValuesCanRank,
  landingPageValuesFromRows,
  landingValueForUrl,
} from './analytics-value.js'

test('aggregates GA4 query-string variants by normalized landing path', () => {
  const values = landingPageValuesFromRows([
    {
      landingPagePlusQueryString: '/pricing?utm_source=newsletter',
      sessions: '100',
      totalUsers: '70',
      conversions: '4',
    },
    {
      landingPagePlusQueryString: '/pricing/?utm_source=search',
      sessions: '20',
      totalUsers: '15',
      conversions: '2',
    },
  ])

  assert.deepEqual(values.get('/pricing'), {
    sessions: 120,
    totalUsers: 85,
    conversions: 6,
  })
})

test('aggregation and map order do not depend on GA4 row order', () => {
  const rows = [
    {
      landingPagePlusQueryString: '/pricing?campaign=b',
      sessions: '20',
      totalUsers: '15',
      conversions: '2',
    },
    {
      landingPagePlusQueryString: '/about',
      sessions: '5',
      totalUsers: '4',
      conversions: '1',
    },
    {
      landingPagePlusQueryString: '/pricing?campaign=a',
      sessions: '100',
      totalUsers: '70',
      conversions: '4',
    },
  ]

  const forwards = [...landingPageValuesFromRows(rows)]
  const backwards = [...landingPageValuesFromRows([...rows].reverse())]

  assert.deepEqual(backwards, forwards)
})

test('preserves the distinction between a zero-valued page and a missing page', () => {
  const values = landingPageValuesFromRows([
    {
      landingPagePlusQueryString: '/zero?campaign=test',
      sessions: '0',
      totalUsers: '0',
      conversions: '0',
    },
    {
      landingPagePlusQueryString: '(not set)',
      sessions: '10',
      totalUsers: '8',
      conversions: '1',
    },
  ])

  assert.deepEqual(landingValueForUrl(values, 'https://example.com/zero'), {
    sessions: 0,
    totalUsers: 0,
    conversions: 0,
  })
  assert.equal(
    landingValueForUrl(values, 'https://example.com/not-observed'),
    undefined,
  )
})

test('sampling and thresholding make landing-page values ineligible for ranking', async () => {
  const result = await fetchLandingPageValues(
    {
      propertyId: '123',
      startDate: '2026-01-01',
      endDate: '2026-01-28',
      limit: 100,
    },
    {
      runGa4Report: async () => ({
        dimensionHeaders: [{ name: 'landingPagePlusQueryString' }],
        metricHeaders: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'conversions' },
        ],
        rows: [
          {
            dimensionValues: [{ value: '/pricing' }],
            metricValues: [{ value: '100' }, { value: '75' }, { value: '5' }],
          },
        ],
        rowCount: 1,
        metadata: {
          subjectToThresholding: true,
          samplingMetadatas: [
            { samplesReadCount: '50', samplingSpaceSize: '100' },
          ],
        },
      }),
    },
  )

  assert.deepEqual(result.values.get('/pricing'), {
    sessions: 100,
    totalUsers: 75,
    conversions: 5,
  })
  assert.equal(result.source?.dataStatus, 'partial')
  assert.equal(landingPageValuesCanRank(result.source), false)
  assert.deepEqual(result.source?.qualityWarnings, [
    'GA4 landing-page report was subject to Google Analytics thresholding.',
    'GA4 landing-page report was sampled by Google Analytics.',
  ])
  assert.deepEqual(
    landingPageRankingPolicy({ propertyId: '123', source: result.source }),
    {
      canRank: false,
      warnings: [
        'GA4 landing-page report was subject to Google Analytics thresholding. Observed landing-page values remain visible but do not affect priority scores.',
        'GA4 landing-page report was sampled by Google Analytics. Observed landing-page values remain visible but do not affect priority scores.',
      ],
    },
  )
})

test('complete retained landing-page rows can influence ranking', async () => {
  const result = await fetchLandingPageValues(
    {
      propertyId: '123',
      startDate: '2026-01-01',
      endDate: '2026-01-28',
      limit: 100,
    },
    {
      runGa4Report: async () => ({
        dimensionHeaders: [{ name: 'landingPagePlusQueryString' }],
        metricHeaders: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'conversions' },
        ],
        rows: [],
        rowCount: 0,
      }),
    },
  )

  assert.equal(result.source?.dataStatus, 'complete')
  assert.equal(landingPageValuesCanRank(result.source), true)
  assert.deepEqual(result.source?.qualityWarnings, [])
  assert.deepEqual(
    landingPageRankingPolicy({ propertyId: '123', source: result.source }),
    { canRank: true, warnings: [] },
  )
})

test('unknown GA4 completeness cannot silently influence priority ranking', () => {
  assert.deepEqual(
    landingPageRankingPolicy({
      propertyId: '123',
      source: {
        returnedRows: 10,
        retainedRowLimit: 5000,
        retainedRowLimitReached: false,
      },
    }),
    {
      canRank: false,
      warnings: [
        'GA4: landing-page completeness was not reported. Observed landing-page values remain visible but do not affect priority scores.',
      ],
    },
  )
})
