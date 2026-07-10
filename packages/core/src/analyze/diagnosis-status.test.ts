import assert from 'node:assert/strict'
import test from 'node:test'
import { diagnosisDataStatus } from './diagnosis-status.js'

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
