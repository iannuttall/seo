import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pseoQueryPatterns } from './query-insights.js'

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
