import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProviderAdapter, ProviderId } from './contracts.js'
import { type ProviderCandidate, resolveProvider } from './resolver.js'

function candidate(input: {
  provider: ProviderId
  connected?: boolean
  priority?: number
  countries?: string[]
  capability?: 'keyword-metrics' | 'ai-mentions'
}): ProviderCandidate {
  const adapter: ProviderAdapter = {
    provider: input.provider,
    capabilitySupport: [
      {
        capability: input.capability ?? 'keyword-metrics',
        status: 'available',
        markets: [
          {
            searchEngines: ['google'],
            countryCodes: input.countries ?? ['US'],
            languageCodes: ['en'],
            location: 'country-only',
          },
        ],
      },
    ],
  }
  return {
    adapter,
    connected: input.connected ?? true,
    priority: input.priority ?? 0,
  }
}

const market = {
  searchEngine: 'google' as const,
  countryCode: 'US',
  languageCode: 'en',
}

test('provider resolution is deterministic by priority and provider id', () => {
  const result = resolveProvider({
    capability: 'keyword-metrics',
    market,
    candidates: [
      candidate({ provider: 'semrush', priority: 2 }),
      candidate({ provider: 'dataforseo', priority: 1 }),
      candidate({ provider: 'ahrefs', priority: 1 }),
    ],
  })
  assert.equal(result.status, 'available')
  if (result.status === 'available') {
    assert.equal(result.provider.provider, 'ahrefs')
  }
  assert.deepEqual(result.considered, ['ahrefs', 'dataforseo', 'semrush'])
})

test('explicit provider selection never falls through silently', () => {
  const result = resolveProvider({
    capability: 'keyword-metrics',
    market,
    provider: 'dataforseo',
    candidates: [
      candidate({ provider: 'dataforseo', connected: false }),
      candidate({ provider: 'semrush', connected: true }),
    ],
  })
  assert.deepEqual(result, {
    status: 'unavailable',
    reason: 'provider-not-connected',
    considered: ['dataforseo', 'semrush'],
  })
})
