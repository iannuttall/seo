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

test('provider registry retains package ownership and stable ordering', () => {
  const registry = new ProviderExtensionRegistry()
  registry
    .hostFor({ package: '@example/zulu', version: '1.0.0' })
    .registerProvider({
      ...fixture,
      id: 'zulu',
    })
  registry
    .hostFor({ package: '@example/alpha', version: '2.0.0' })
    .registerProvider({
      ...fixture,
      id: 'alpha',
    })

  assert.deepEqual(
    registry
      .list()
      .map((provider) => [provider.id, provider.package, provider.version]),
    [
      ['alpha', '@example/alpha', '2.0.0'],
      ['zulu', '@example/zulu', '1.0.0'],
    ],
  )
})

test('provider registry rejects duplicate ids', () => {
  const registry = new ProviderExtensionRegistry()
  const host = registry.hostFor({
    package: '@example/fixture',
    version: '1.0.0',
  })
  host.registerProvider(fixture)
  assert.throws(() => host.registerProvider(fixture), /already registered/i)
})

test('providers register small capabilities instead of broad adapter types', () => {
  const registry = new ProviderExtensionRegistry()
  const serpSnapshot = {
    id: 'serp-snapshot' as const,
    defaultDepth: 10,
    maxDepth: 100,
    maxRequests: 10,
    markets: [
      { searchEngines: ['google' as const], location: 'country-only' as const },
    ],
    estimateCostMicros: () => 500,
    estimateRequests: () => 1,
    run: async () => {
      throw new Error('Not used in this registry test.')
    },
  }
  registry
    .hostFor({ package: '@example/broad', version: '1.0.0' })
    .registerProvider({
      ...fixture,
      id: 'broad',
      kinds: ['traffic-analytics', 'search-results'],
      capabilities: [...fixture.capabilities, serpSnapshot],
    })
  registry
    .hostFor({ package: '@example/serp-only', version: '1.0.0' })
    .registerProvider({
      ...fixture,
      id: 'serp-only',
      kinds: ['search-results'],
      capabilities: [serpSnapshot],
    })

  assert.deepEqual(
    registry.providersFor('landing-page-visits').map((item) => item.id),
    ['broad'],
  )
  assert.deepEqual(
    registry.providersFor('serp-snapshot').map((item) => item.id),
    ['broad', 'serp-only'],
  )
})
