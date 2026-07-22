import assert from 'node:assert/strict'
import test from 'node:test'
import type { GscRow } from '../../types.js'
import { analyzeLocalSearchRows } from './analysis.js'

function row(
  query: string,
  page: string,
  impressions: number,
  clicks = 1,
  position = 8,
): GscRow {
  return {
    keys: [query, page],
    clicks,
    impressions,
    ctr: clicks / impressions,
    position,
  }
}

test('builds deterministic local opportunities and repeated page patterns', () => {
  const rows = [
    row('plumber london', 'https://example.com/plumbers/london', 100, 10, 5),
    row('plumber london', 'https://example.com/areas/london', 20, 1, 15),
    row('plumber manchester', 'https://example.com/plumbers/manchester', 80),
    row('plumber near me', 'https://example.com/plumbers', 60),
    row('plumber guide', 'https://example.com/guide', 500),
  ]
  const result = analyzeLocalSearchRows({
    rows: [...rows].reverse(),
    site: 'sc-domain:example.com',
    locationTerms: ['london', 'manchester'],
    minImpressions: 1,
    limit: 10,
  })

  assert.deepEqual(
    result.opportunities.map((item) => item.query),
    ['plumber london', 'plumber manchester', 'plumber near me'],
  )
  assert.equal(result.opportunities[0]?.impressions, 120)
  assert.equal(result.opportunities[0]?.action, 'review-page-overlap')
  assert.equal(result.opportunities[0]?.pageCoverage.available, 2)
  assert.equal(result.selection.nonLocalRows, 1)
  assert.deepEqual(
    result.templates.map((template) => template.signature),
    ['/plumbers/:value'],
  )
  assert.equal(result.templates[0]?.queryCount, 2)
  assert.equal(result.templates[0]?.impressions, 180)
  assert.deepEqual(result.eligiblePageUrls, [
    'https://example.com/areas/london',
    'https://example.com/plumbers',
    'https://example.com/plumbers/london',
    'https://example.com/plumbers/manchester',
  ])
})

test('rejects invalid and conflicting rows while deduplicating exact repeats', () => {
  const exact = row('dentist london', 'https://example.com/dentists/london', 20)
  const result = analyzeLocalSearchRows({
    rows: [
      exact,
      { ...exact },
      row('dentist manchester', 'https://example.com/dentists/manchester', 20),
      row('dentist manchester', 'https://example.com/dentists/manchester', 30),
      { ...row('dentist near me', 'not-a-url', 20) },
      { ...row('dentist near me', 'https://example.com/dentists', 20), ctr: 2 },
    ],
    site: 'sc-domain:example.com',
    locationTerms: ['london', 'manchester'],
    minImpressions: 1,
    limit: 10,
  })

  assert.deepEqual(
    result.opportunities.map((item) => item.query),
    ['dentist london'],
  )
  assert.equal(result.selection.exactDuplicateRows, 1)
  assert.equal(result.selection.conflictingRows, 2)
  assert.equal(result.selection.invalidRows, 2)
})

test('keeps large local inputs and every returned list bounded', () => {
  const rows = Array.from({ length: 10_000 }, (_, index) =>
    row(
      `plumber city ${index % 100}`,
      `https://example.com/cities/city-${index}`,
      10_000 - index,
    ),
  )
  const result = analyzeLocalSearchRows({
    rows,
    site: 'sc-domain:example.com',
    locationTerms: Array.from({ length: 100 }, (_, index) => `city ${index}`),
    minImpressions: 1,
    limit: 25,
  })
  assert.equal(result.selection.eligibleQueries, 100)
  assert.equal(result.eligiblePageCount, 10_000)
  assert.equal(result.eligiblePageUrls.length, 10_000)
  assert.equal(result.eligibleSummary.impressions, 50_005_000)
  assert.equal(result.opportunities.length, 25)
  assert.ok(result.templates.length <= 10)
  assert.ok(result.opportunities.every((item) => item.pages.length <= 3))
})
