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
  return {
    keys: [input.query, input.page],
    clicks: input.clicks,
    impressions: input.impressions ?? 100,
    ctr: input.ctr ?? 0.1,
    position: input.position ?? 5,
  }
}

test('analyzeDecay catches query/page rows that disappear', () => {
  const result = analyzeDecay({
    site: 'sc-domain:example.com',
    currentRows: [],
    previousRows: [
      row({
        query: 'plumber salary in france',
        page: 'https://example.com/average-plumber-salary-in-france/',
        clicks: 8,
      }),
    ],
  })

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0]?.diagnosis, 'lost_visibility')
  assert.equal(result.items[0]?.clickLoss, 8)
  assert.equal(
    result.items[0]?.url,
    'https://example.com/average-plumber-salary-in-france/',
  )
})

test('analyzeDecay filters brand and low-actionability queries by default', () => {
  const result = analyzeDecay({
    site: 'sc-domain:example.com',
    brandTerms: ['example'],
    currentRows: [],
    previousRows: [
      row({
        query: 'example login',
        page: 'https://www.example.com/',
        clicks: 10,
      }),
      row({
        query: '7555bdt',
        page: 'https://www.example.com/tools/',
        clicks: 10,
      }),
    ],
  })

  assert.equal(result.items.length, 0)
})

test('analyzeDecay groups repeatable template losses', () => {
  const result = analyzeDecay({
    site: 'sc-domain:example.com',
    currentRows: [
      row({
        query: 'teacher salary in nepal',
        page: 'https://example.com/average-teacher-salary-in-nepal/',
        clicks: 2,
        impressions: 40,
      }),
      row({
        query: 'nurse salary in nepal',
        page: 'https://example.com/average-nurse-salary-in-nepal/',
        clicks: 1,
        impressions: 40,
      }),
    ],
    previousRows: [
      row({
        query: 'teacher salary in nepal',
        page: 'https://example.com/average-teacher-salary-in-nepal/',
        clicks: 8,
      }),
      row({
        query: 'nurse salary in nepal',
        page: 'https://example.com/average-nurse-salary-in-nepal/',
        clicks: 6,
      }),
    ],
  })

  assert.equal(result.items.length, 2)
  assert.equal(result.groups[0]?.template.id, 'country-salary')
  assert.equal(result.groups[0]?.count, 2)
  assert.equal(result.groups[0]?.totalClickLoss, 11)
  assert.match(result.groups[0]?.recommendation ?? '', /salary-data freshness/)
  assert.match(result.items[0]?.recommendation.action ?? '', /salary data/)
})

test('analyzeDecay gives name-list decay template advice', () => {
  const result = analyzeDecay({
    site: 'sc-domain:example.com',
    currentRows: [
      row({
        query: 'seven letter last names',
        page: 'https://example.com/last-names/7-letter-last-names/',
        clicks: 2,
        impressions: 100,
        ctr: 0.02,
      }),
    ],
    previousRows: [
      row({
        query: 'seven letter last names',
        page: 'https://example.com/last-names/7-letter-last-names/',
        clicks: 8,
        impressions: 100,
        ctr: 0.08,
      }),
    ],
  })

  assert.equal(result.items[0]?.template.id, 'last-name-list')
  assert.equal(result.items[0]?.diagnosis, 'lost_ctr')
  assert.match(result.items[0]?.recommendation.action ?? '', /list intent/)
})
