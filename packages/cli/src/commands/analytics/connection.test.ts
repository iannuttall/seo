import assert from 'node:assert/strict'
import test from 'node:test'
import { analyticsConnectionFromArgs } from './connection.js'

test('analytics connection flags select one provider without a profile', () => {
  assert.deepEqual(analyticsConnectionFromArgs({ 'clicky-site-id': '123' }), {
    provider: 'clicky',
    siteId: '123',
  })
  assert.deepEqual(
    analyticsConnectionFromArgs({ 'google-analytics-property': '456' }),
    { provider: 'google', propertyId: '456' },
  )
})

test('analytics connection flags are mutually exclusive', () => {
  assert.throws(
    () =>
      analyticsConnectionFromArgs({
        'clicky-site-id': '123',
        'google-analytics-property': '456',
      }),
    /Pass either/u,
  )
})

test('saved analytics connection remains the fallback', () => {
  assert.deepEqual(
    analyticsConnectionFromArgs({}, { provider: 'clicky', siteId: '123' }),
    { provider: 'clicky', siteId: '123' },
  )
})
