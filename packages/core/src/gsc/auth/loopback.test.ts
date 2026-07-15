import assert from 'node:assert/strict'
import { test } from 'node:test'
import { oauthCallbackPage } from './callback-page.js'
import { missingSharedClientLoginMessage } from './loopback.js'

test('missing shared OAuth configuration points installed users to GitHub', () => {
  const message = missingSharedClientLoginMessage()
  assert.match(message, /github\.com\/iannuttall\/seo\/issues/)
  assert.match(message, /setup-client/)
})

test('OAuth callback page stays plain and confirms the completed login', () => {
  const page = oauthCallbackPage()

  assert.match(page, /Google account connected/)
  assert.match(page, /This tab can be closed/)
  assert.doesNotMatch(page, /<(?:img|link|script|style)\b/i)
})

test('OAuth callback page explains when required permissions were not granted', () => {
  const page = oauthCallbackPage({
    status: 'permissions-missing',
    missing: ['Search Console', 'Google Analytics'],
  })

  assert.match(page, /Google permissions were not granted/)
  assert.match(page, /Select all permission boxes/)
  assert.match(page, /Search Console and Google Analytics/)
})
