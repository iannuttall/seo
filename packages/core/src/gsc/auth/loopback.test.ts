import assert from 'node:assert/strict'
import { test } from 'node:test'
import { oauthCallbackPage } from './callback-page.js'
import { missingSharedClientLoginMessage } from './loopback.js'

test('missing shared OAuth configuration points installed users to GitHub', () => {
  const message = missingSharedClientLoginMessage()
  assert.match(message, /github\.com\/iannuttall\/seo\/issues/)
  assert.match(message, /setup-client/)
})

test('OAuth callback page confirms the next safe step without remote assets', () => {
  const page = oauthCallbackPage()

  assert.match(page, /SEO Skills is connected/)
  assert.match(page, /Google account connected/)
  assert.match(page, /seo start/)
  assert.match(page, /read-only access/)
  assert.match(page, /prefers-color-scheme: dark/)
  assert.doesNotMatch(page, /https?:\/\//)
})
