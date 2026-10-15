import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ProviderExtensionRegistry } from './registry.js'

const fixture = {
  id: 'fixture',
  displayName: 'Fixture',
  description: 'Fixture provider.',
  kinds: ['traffic-analytics'] as const,
  connection: {
    fields: [{ id: 'account', label: 'Account', kind: 'account' as const }],
    verify: async () => undefined,
  },
  capabilities: [
    {
      id: 'landing-page-visits' as const,
      run: async () => ({
        metric: 'landing-page-visits' as const,
        rows: [],
        returnedRows: 0,
        retainedRowLimit: 100,
        retainedRowLimitReached: false,
        dataStatus: 'complete' as const,
        qualityWarnings: [],
      }),
    },
  ],
}

test('provider registry rejects duplicate ids', () => {
  const registry = new ProviderExtensionRegistry()
  const host = registry.hostFor({
    package: '@example/fixture',
    version: '1.0.0',
  })
  host.registerProvider(fixture)
  assert.throws(() => host.registerProvider(fixture), /already registered/i)
})
