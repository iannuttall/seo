import assert from 'node:assert/strict'
import test from 'node:test'
import { semrushMetric, semrushRecords } from './mapping.js'

test('Semrush maps documented CSV response headers into owned metrics', () => {
  const records = semrushRecords(
    {
      headers: [
        'Keyword',
        'Search Volume',
        'CPC',
        'Competition',
        'Number of Results',
        'Intents',
        'Keyword Difficulty Index',
      ],
      rows: [['query', '0', '1.25', '0.4', '300', '1', '42']],
    },
    ['Ph', 'Nq', 'Cp', 'Co', 'Nr', 'In', 'Kd'],
  )

  assert.deepEqual(semrushMetric('query', records), {
    keyword: 'query',
    monthlySearchVolume: { state: 'observed', value: 0 },
    monthlySearches: {
      state: 'unavailable',
      value: null,
      reason: 'This Semrush V3 report does not return monthly search history.',
    },
    searchVolumeUpdatedAt: {
      state: 'missing',
      value: null,
      reason: 'Semrush omitted searchVolumeUpdatedAt.',
    },
    cpcUsd: { state: 'observed', value: 1.25 },
    paidCompetition: { state: 'observed', value: 0.4 },
    keywordDifficulty: { state: 'observed', value: 42 },
    intent: { state: 'observed', value: 'informational' },
    resultCount: { state: 'observed', value: 300 },
  })
})

test('Semrush rejects reordered or unfamiliar response headers', () => {
  assert.throws(
    () =>
      semrushRecords(
        {
          headers: ['Search Volume', 'Keyword'],
          rows: [['10', 'query']],
        },
        ['Ph', 'Nq'],
      ),
    /do not match the requested report/i,
  )
  assert.throws(
    () =>
      semrushRecords(
        {
          headers: ['Keyword', 'Volume'],
          rows: [['query', '10']],
        },
        ['Ph', 'Nq'],
      ),
    /do not match the requested report/i,
  )
})
