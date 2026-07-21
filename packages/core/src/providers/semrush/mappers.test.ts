import assert from 'node:assert/strict'
import test from 'node:test'
import { mapKeywordRows, mapOverview } from './mappers.js'

test('Semrush overview preserves observed zero values', () => {
  assert.deepEqual(
    mapOverview([
      ['Ph', 'Nq', 'Cp', 'Co', 'Kd', 'Nr'],
      ['zero query', '0', '0', '0', '0', '0'],
    ]),
    {
      phrase: 'zero query',
      volume: 0,
      cpc: 0,
      competition: 0,
      difficulty: 0,
      results: 0,
    },
  )
})

test('Semrush keyword rows keep missing and invalid numbers unavailable', () => {
  assert.deepEqual(
    mapKeywordRows([
      ['Ph', 'Nq', 'Kd', 'Cp', 'Co', 'Po', 'Ur', 'Dn'],
      ['missing query', '', 'not-a-number', ' ', 'Infinity', '', '', ''],
      ['zero query', '0', '0', '0', '0', '0', '/zero', 'example.com'],
    ]),
    [
      {
        phrase: 'missing query',
        volume: undefined,
        difficulty: undefined,
        cpc: undefined,
        competition: undefined,
        position: undefined,
        url: '',
        domain: '',
      },
      {
        phrase: 'zero query',
        volume: 0,
        difficulty: 0,
        cpc: 0,
        competition: 0,
        position: 0,
        url: '/zero',
        domain: 'example.com',
      },
    ],
  )
})

test('Semrush mappers handle empty and short rows deterministically', () => {
  assert.deepEqual(mapOverview([]), { phrase: '' })
  assert.deepEqual(mapKeywordRows([]), [])
  assert.deepEqual(mapKeywordRows([['Ph', 'Nq'], ['query']]), [
    {
      phrase: 'query',
      volume: undefined,
      difficulty: undefined,
      cpc: undefined,
      competition: undefined,
      position: undefined,
      url: undefined,
      domain: undefined,
    },
  ])
})
