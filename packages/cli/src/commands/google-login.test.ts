import assert from 'node:assert/strict'
import { test } from 'node:test'
import { googleLoginGuidance } from './google-login.js'

test('Google login guidance explains every browser step and the time limit', () => {
  const guidance = googleLoginGuidance()

  assert.match(guidance, /browser will open/i)
  assert.match(guidance, /choose your Google account/i)
  assert.match(guidance, /select all permission boxes/i)
  assert.match(guidance, /read-only access/i)
  assert.match(guidance, /keep this terminal open/i)
  assert.match(guidance, /within five minutes/i)
})
