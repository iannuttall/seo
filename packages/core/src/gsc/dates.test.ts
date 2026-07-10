import assert from 'node:assert/strict'
import { test } from 'node:test'
import { finalGscDateRange, latestFinalGscDate } from './dates.js'

test('GSC final dates use the Pacific calendar before UTC midnight', () => {
  const now = new Date('2026-07-10T00:30:00.000Z')

  assert.equal(latestFinalGscDate(now), '2026-07-05')
  assert.deepEqual(finalGscDateRange(3, now), {
    startDate: '2026-07-03',
    endDate: '2026-07-05',
  })
})

test('GSC final dates advance after Pacific midnight', () => {
  assert.equal(
    latestFinalGscDate(new Date('2026-07-10T07:30:00.000Z')),
    '2026-07-06',
  )
})
