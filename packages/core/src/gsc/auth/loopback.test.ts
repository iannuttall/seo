import assert from 'node:assert/strict'
import { test } from 'node:test'
import { oauthCallbackPage } from './callback-page.js'
import { missingSharedClientLoginMessage } from './loopback.js'

test('missing shared OAuth configuration points installed users to GitHub', () => {
  const message = missingSharedClientLoginMessage()
  assert.match(message, /github\.com\/iannuttall\/seo\/issues/)
  assert.match(message, /setup-client/)
})

test('OAuth callback page matches the local product style without remote assets', () => {
  const page = oauthCallbackPage()

  assert.match(page, /SEO Skills is connected/)
  assert.match(page, /Google account connected/)
  assert.match(page, /Go back to your terminal to continue/)
  assert.match(page, /Read-only access/)
  assert.match(page, /You can start your first SEO report/)
  assert.match(page, /viewBox="0 0 24 24"/)
  assert.match(page, /--background/)
  assert.match(page, /prefers-color-scheme: dark/)
  assert.doesNotMatch(page, /https?:\/\//)
})
