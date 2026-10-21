import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findOverlappingSearchUpdates,
  type SearchStatusIncident,
  type SearchUpdate,
  searchUpdatesFromIncidents,
  withRankingHistory,
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

test('updates before the live feed come from the saved Ranking history, and the live feed wins', () => {
  // Google's feed keeps only its latest incidents, so a window in July 2025
  // found nothing before the history was added.
  const live: SearchStatusIncident[] = [
    {
      id: 'riq1AuqETW46NfBCe5NT',
      begin: '2025-06-30T14:30:00+00:00',
      external_desc: 'June 2025 core update',
      service_name: 'Ranking',
      status_impact: 'SERVICE_INFORMATION',
      severity: 'low',
      uri: 'incidents/riq1AuqETW46NfBCe5NT',
    },
  ]
  const overlapping = (incidents: SearchStatusIncident[]) =>
    findOverlappingSearchUpdates({
      updates: searchUpdatesFromIncidents(withRankingHistory(incidents), {
        product: 'Ranking',
        limit: Number.POSITIVE_INFINITY,
      }),
      startDate: '2025-07-20',
      endDate: '2025-07-20',
      paddingDays: 3,
    }).map((update) => [update.name, update.end?.slice(0, 10)])

  assert.deepEqual(overlapping([]), [['June 2025 core update', '2025-07-17']])
  assert.deepEqual(overlapping(live), [['June 2025 core update', undefined]])
})
