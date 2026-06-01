import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findOverlappingSearchUpdates,
  type SearchUpdate,
} from './search-status.js'

const updates: SearchUpdate[] = [
  {
    id: 'core',
    name: 'Core update',
    type: 'core',
    product: 'Ranking',
    start: '2026-03-27T09:00:00+00:00',
    end: '2026-04-08T13:00:00+00:00',
    status: 'complete',
    sourceUrl: 'https://status.search.google.com/incidents/core',
  },
  {
    id: 'spam',
    name: 'Spam update',
    type: 'spam',
    product: 'Ranking',
    start: '2026-01-01T09:00:00+00:00',
    end: '2026-01-02T09:00:00+00:00',
    status: 'complete',
    sourceUrl: 'https://status.search.google.com/incidents/spam',
  },
]

test('findOverlappingSearchUpdates returns updates inside the padded window', () => {
  const result = findOverlappingSearchUpdates({
    updates,
    startDate: '2026-04-09',
    endDate: '2026-04-10',
    paddingDays: 2,
  })

  assert.deepEqual(
    result.map((update) => update.id),
    ['core'],
  )
})
