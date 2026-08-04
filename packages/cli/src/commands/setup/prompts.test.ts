import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyticsSetupOptions, authSetupOptions } from './prompts.js'

test('setup offers Clicky as a traffic analytics option', () => {
  assert.deepEqual(analyticsSetupOptions(), [
    {
      value: 'google',
      label: 'Google Analytics',
      hint: 'Use a property available to your Google login',
    },
    {
      value: 'clicky',
      label: 'Clicky',
      hint: 'Use a site ID and sitekey from Clicky',
    },
    { value: 'skip', label: 'Skip traffic analytics' },
  ])
})

test('setup can preserve, replace, or remove existing traffic analytics', () => {
  assert.deepEqual(
    analyticsSetupOptions({ provider: 'clicky', siteId: '123' }),
    [
      {
        value: 'keep',
        label: 'Keep Clicky site 123',
        hint: 'Leave this project connection unchanged',
      },
      {
        value: 'google',
        label: 'Google Analytics',
        hint: 'Use a property available to your Google login',
      },
      {
        value: 'clicky',
        label: 'Clicky',
        hint: 'Use a site ID and sitekey from Clicky',
      },
      { value: 'remove', label: 'Remove traffic analytics' },
    ],
  )
})

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
      hint: 'Opens your browser for read-only Search Console and Google Analytics access',
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
