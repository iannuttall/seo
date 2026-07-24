import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseSemrushLiveArguments,
  SEMRUSH_LIVE_PLAN,
} from './semrush-live-acceptance.mjs'

test('Semrush live plan has one exact bounded spend ceiling', () => {
  const maximumApiUnits = SEMRUSH_LIVE_PLAN.checks.reduce(
    (sum, check) => sum + check.maximumRows * check.unitsPerRow,
    0,
  )
  assert.equal(maximumApiUnits, 180)
  assert.equal(SEMRUSH_LIVE_PLAN.maximumApiUnits, maximumApiUnits)
  assert.equal(SEMRUSH_LIVE_PLAN.paidRequests, SEMRUSH_LIVE_PLAN.checks.length)
})

test('Semrush live arguments require explicit spend acceptance', () => {
  assert.deepEqual(parseSemrushLiveArguments(['--plan']), { mode: 'plan' })
  assert.deepEqual(parseSemrushLiveArguments(['--help']), { mode: 'help' })
  assert.deepEqual(parseSemrushLiveArguments(['--', '--plan']), {
    mode: 'plan',
  })
  assert.deepEqual(parseSemrushLiveArguments(['--accept-api-units', '180']), {
    mode: 'live',
    acceptedApiUnits: 180,
  })
  assert.deepEqual(parseSemrushLiveArguments(['--accept-api-units=180']), {
    mode: 'live',
    acceptedApiUnits: 180,
  })
  assert.throws(() => parseSemrushLiveArguments([]), /requires/)
  assert.throws(
    () => parseSemrushLiveArguments(['--accept-api-units', '181']),
    /exactly 180/,
  )
  assert.throws(
    () =>
      parseSemrushLiveArguments(['--accept-api-units', '180', '--unexpected']),
    /requires/,
  )
})
