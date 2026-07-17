import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_FETCH_CONCURRENCY,
  normalizeRateControls,
} from './rate-controls.js'

test('fetch concurrency stays within the local resource limit', () => {
  assert.equal(
    normalizeRateControls({ concurrency: MAX_FETCH_CONCURRENCY }).concurrency,
    MAX_FETCH_CONCURRENCY,
  )
  for (const concurrency of [0, 1.5, MAX_FETCH_CONCURRENCY + 1]) {
    assert.throws(
      () => normalizeRateControls({ concurrency }),
      /Fetch concurrency must be an integer from 1 to 16/,
    )
  }
})
