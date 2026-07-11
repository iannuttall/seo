import assert from 'node:assert/strict'
import { test } from 'node:test'
import { missingSharedClientLoginMessage } from './loopback.js'

test('missing shared OAuth configuration points installed users to GitHub', () => {
  const message = missingSharedClientLoginMessage()
  assert.match(message, /github\.com\/iannuttall\/seo\/issues/)
  assert.match(message, /setup-client/)
})
