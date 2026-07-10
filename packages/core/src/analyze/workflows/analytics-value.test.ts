import assert from 'node:assert/strict'
import test from 'node:test'
import {
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
