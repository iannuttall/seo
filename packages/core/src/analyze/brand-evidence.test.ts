import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isBrandQuery } from '../brand.js'
import {
  brandTermsFromQueryRows,
  resolveReportBrandTerms,
} from '../brand-evidence.js'
import type { GscRow } from '../types.js'

function queryRow(
  query: string,
  metrics: { clicks: number; impressions: number; position: number },
): GscRow {
  return {
    keys: [query],
    clicks: metrics.clicks,
    impressions: metrics.impressions,
    ctr: metrics.clicks / metrics.impressions,
    position: metrics.position,
  }
}

test('a generic domain stem is not brand without navigational evidence', () => {
  const result = brandTermsFromQueryRows({
    siteUrl: 'sc-domain:example.dev',
    rows: [
      queryRow('example', { clicks: 3, impressions: 2400, position: 31.4 }),
      queryRow('example.dev', { clicks: 90, impressions: 150, position: 1 }),
    ],
  })

  assert.deepEqual(result.terms, [
    'example.dev',
    'example dev',
    'exampledev',
    'example-dev',
  ])
  assert.equal(result.excluded[0]?.term, 'example')
  assert.equal(result.excluded[0]?.query?.position, 31.4)
  assert.match(result.excluded[0]?.reason ?? '', /generic word/)
  assert.equal(result.method.heuristic, true)
  for (const query of [
    'image example',
    'example api',
    'glm example',
    'pip install example-sdk',
    'example shell',
  ]) {
    assert.equal(isBrandQuery(query, result.terms), false, query)
  }
  for (const query of [
    'example.dev',
    'example dev api',
    'exampledev',
    'example-dev docs',
  ]) {
    assert.equal(isBrandQuery(query, result.terms), true, query)
  }
})

test('a stem the site answers navigationally is brand, with its evidence', () => {
  const rows = [
    queryRow('ahrefs', { clicks: 9000, impressions: 20_000, position: 1.02 }),
    queryRow('ahrefs', { clicks: 100, impressions: 1000, position: 1.5 }),
  ]
  const result = brandTermsFromQueryRows({
    siteUrl: 'sc-domain:ahrefs.com',
    rows,
  })
  const stem = result.evidence.find((item) => item.term === 'ahrefs')

  assert.ok(stem)
  assert.equal(stem.source, 'navigational-stem')
  assert.equal(stem.query?.impressions, 21_000)
  assert.equal(stem.query?.sourceRows, 2)
  assert.equal(isBrandQuery('ahrefs keyword explorer', result.terms), true)
})

test('stem evidence must meet every threshold', () => {
  const cases: Array<[string, GscRow, boolean]> = [
    [
      'enough',
      queryRow('acme', { clicks: 4, impressions: 20, position: 2 }),
      true,
    ],
    [
      'too few impressions',
      queryRow('acme', { clicks: 4, impressions: 19, position: 1 }),
      false,
    ],
    [
      'position too low',
      queryRow('acme', { clicks: 50, impressions: 100, position: 2.1 }),
      false,
    ],
    [
      'ctr too low',
      queryRow('acme', { clicks: 19, impressions: 100, position: 1 }),
      false,
    ],
  ]
  for (const [label, row, included] of cases) {
    const result = brandTermsFromQueryRows({
      siteUrl: 'https://www.acme.co.uk/',
      rows: [row],
    })
    assert.equal(result.terms.includes('acme'), included, label)
    assert.ok(result.terms.includes('acme.co.uk'), label)
  }
})

test('report brand terms prefer caller terms and label the source', () => {
  const provided = resolveReportBrandTerms({
    siteUrl: 'sc-domain:example.dev',
    rows: [],
    brandTerms: ['example'],
  })
  assert.equal(provided.source, 'provided')
  assert.deepEqual(provided.terms, ['example'])
  assert.equal(provided.heuristic, false)

  const derived = resolveReportBrandTerms({
    siteUrl: 'sc-domain:example.dev',
    rows: [],
    includeBrand: true,
  })
  assert.equal(derived.source, 'search-console-navigational')
  assert.equal(derived.filtering, 'included')
  assert.equal(derived.heuristic, true)
})

test('ASCII compact brand matches align with query word boundaries', () => {
  assert.equal(isBrandQuery('example compare', ['examplecom']), false)
  assert.equal(isBrandQuery('example.com login', ['examplecom']), true)
  assert.equal(isBrandQuery('name census', ['examplecensus']), true)
})
