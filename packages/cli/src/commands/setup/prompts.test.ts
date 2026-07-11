import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authSetupOptions } from './prompts.js'

test('saved BYO OAuth clients go directly to Google sign-in', () => {
  const options = authSetupOptions({
    sharedConfigured: false,
    byoConfigured: true,
    canSkip: true,
  })

  assert.deepEqual(options, [
    {
      value: 'login',
      label: 'Connect Google',
      hint: 'Opens your browser for read-only Search Console and GA4 access',
    },
    { value: 'skip', label: 'Skip for now' },
  ])
  assert.doesNotMatch(JSON.stringify(options), /OAuth client ID|checkout/i)
})

test('source checkouts only ask for an OAuth client when none is saved', () => {
  const options = authSetupOptions({
    sharedConfigured: false,
    byoConfigured: false,
    canSkip: false,
  })

  assert.deepEqual(options, [
    {
      value: 'setup',
      label: 'Set up Google login for local development',
      hint: 'This source checkout does not include the public app credentials',
    },
  ])
})
