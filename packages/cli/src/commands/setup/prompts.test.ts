import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RegisteredProviderExtension } from '@seo/core'
import { analyticsSetupOptions, authSetupOptions } from './prompts.js'

const installedProvider: RegisteredProviderExtension = {
  id: 'fathom',
  displayName: 'Fathom',
  description: 'Add Fathom analytics evidence.',
  package: '@usefathom/seo-provider',
  version: '1.2.3',
  kinds: ['traffic-analytics'],
  connection: {
    fields: [{ id: 'siteId', label: 'Site ID', kind: 'account' }],
    verify: async () => undefined,
  },
  capabilities: [
    {
      id: 'landing-page-visits',
      run: async () => ({
        metric: 'landing-page-visits',
        rows: [],
        returnedRows: 0,
        retainedRowLimit: 100,
        retainedRowLimitReached: false,
        dataStatus: 'complete',
        qualityWarnings: [],
      }),
    },
  ],
}

test('setup offers the supported traffic analytics providers', () => {
  assert.deepEqual(analyticsSetupOptions(), [
    {
      value: 'google',
      label: 'Google Analytics',
      hint: 'Use a property available to your Google login',
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
      { value: 'remove', label: 'Remove traffic analytics' },
    ],
  )
})

test('setup offers an installed analytics provider without a new core option', () => {
  const options = analyticsSetupOptions(undefined, [installedProvider])
  assert.deepEqual(options.at(-2), {
    value: 'extension:fathom',
    label: 'Fathom',
    hint: 'Installed provider from @usefathom/seo-provider',
  })
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
