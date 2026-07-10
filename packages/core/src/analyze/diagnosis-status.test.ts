import assert from 'node:assert/strict'
import test from 'node:test'
import {
  diagnosisDataStatus,
  diagnosisPartialReasons,
} from './diagnosis-status.js'

test('partial anomaly calendar coverage remains visible to the main report', () => {
  const completeSegment = { dataStatus: 'complete' }
  const reasons = diagnosisPartialReasons({
    anomaly: {
      coverage: {
        status: 'partial',
        caveats: ['1 requested calendar day had no returned date aggregate.'],
      },
    },
    segments: {
      page: completeSegment,
      query: completeSegment,
      device: completeSegment,
      country: completeSegment,
    },
    decay: { dataStatus: 'complete' },
    cannibalization: { dataStatus: 'complete' },
    strikingDistance: {
      source: { possiblyTruncated: false },
      verification: { requested: false, failed: 0 },
    },
    quickWins: {
      source: { possiblyTruncated: false },
      verification: { requested: false, failed: 0 },
    },
  } as Parameters<typeof diagnosisPartialReasons>[0])

  assert.deepEqual(reasons, [
    {
      section: 'traffic anomaly',
      reason: '1 requested calendar day had no returned date aggregate.',
    },
  ])
})

test('diagnosisDataStatus reports incomplete source evidence without skips', () => {
  assert.equal(
    diagnosisDataStatus({
      criticalStatuses: ['completed'],
      skippedSections: 0,
      partialReasons: 1,
    }),
    'partial',
  )
})

test('diagnosisDataStatus derives unavailable from critical sections, not a count', () => {
  assert.equal(
    diagnosisDataStatus({
      criticalStatuses: ['skipped', 'skipped'],
      skippedSections: 2,
      partialReasons: 0,
    }),
    'unavailable',
  )
  assert.equal(
    diagnosisDataStatus({
      criticalStatuses: ['skipped', 'completed'],
      skippedSections: 8,
      partialReasons: 0,
    }),
    'partial',
  )
})
