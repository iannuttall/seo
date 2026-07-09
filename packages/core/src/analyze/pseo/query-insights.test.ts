import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizePseoText,
  pseoQueryPatterns,
  pseoQueryTerms,
} from './query-insights.js'

test('pseoQueryPatterns learns repeated themes without generic question words', () => {
  const patterns = pseoQueryPatterns([
    {
      query: 'how much does alpha item weigh',
      clicks: 0,
      impressions: 100,
    },
    {
      query: 'how much does beta item weigh',
      clicks: 0,
      impressions: 80,
    },
  ])

  assert.equal(patterns[0]?.label, 'theme: item weigh')
})

test('pseoQueryPatterns merges simple singular and plural theme terms', () => {
  const patterns = pseoQueryPatterns([
    {
      query: 'red widget specs',
      clicks: 0,
      impressions: 100,
    },
    {
      query: 'blue widgets specs',
      clicks: 0,
      impressions: 80,
    },
  ])

  assert.equal(patterns[0]?.label, 'theme: widget spec')
})

test('pseoQueryPatterns does not strip proper terms ending in s', () => {
  const patterns = pseoQueryPatterns([
    {
      query: 'atlas product details',
      clicks: 0,
      impressions: 100,
    },
    {
      query: 'atlas product overview',
      clicks: 0,
      impressions: 80,
    },
  ])

  assert.equal(patterns[0]?.label, 'theme: atlas product')
})

test('pSEO query analysis preserves Unicode and model identifiers', () => {
  assert.equal(normalizePseoText('Café 東京 X5'), 'café 東京 x5')
  assert.deepEqual(pseoQueryTerms('Café 東京 X5 2026'), [
    'café',
    '東京',
    'x5',
    '2026',
  ])
})

test('pseoQueryPatterns counts distinct queries across page rows', () => {
  const patterns = pseoQueryPatterns([
    { query: 'x5 東京 specs', clicks: 1, impressions: 10 },
    { query: 'x5 東京 specs', clicks: 2, impressions: 20 },
    { query: 'x7 大阪 specs', clicks: 0, impressions: 15 },
  ])

  assert.equal(patterns[0]?.queryCount, 2)
  assert.equal(patterns[0]?.impressions, 45)
})
