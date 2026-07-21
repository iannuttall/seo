import assert from 'node:assert/strict'
import test from 'node:test'
import { configSchema } from '../types.js'
import { DataForSeoProvider } from './dataforseo.js'
import { getKeywordProvider } from './router.js'
import { SemrushProvider } from './semrush.js'

function config(
  input: { semrush?: boolean; prefer?: 'cheap' | 'authoritative' } = {},
) {
  return configSchema.parse({
    providers: {
      prefer: input.prefer ?? 'cheap',
      ...(input.semrush ? { semrushApiKey: 'configured' } : {}),
    },
  })
}

test('keyword router sees DataForSEO through the secure credential boundary', async () => {
  let credentialChecks = 0
  const provider = await getKeywordProvider(undefined, {
    readConfig: () => config(),
    hasDataForSeoCredentials: () => {
      credentialChecks += 1
      return true
    },
  })

  assert.ok(provider instanceof DataForSeoProvider)
  assert.equal(credentialChecks, 1)
})

test('keyword router preserves preference and fallback behavior', async () => {
  let unnecessaryCredentialChecks = 0
  const authoritative = await getKeywordProvider('authoritative', {
    readConfig: () => config({ semrush: true }),
    hasDataForSeoCredentials: () => {
      unnecessaryCredentialChecks += 1
      return true
    },
  })
  assert.ok(authoritative instanceof SemrushProvider)
  assert.equal(unnecessaryCredentialChecks, 0)

  const cheap = await getKeywordProvider('cheap', {
    readConfig: () => config({ semrush: true }),
    hasDataForSeoCredentials: () => true,
  })
  assert.ok(cheap instanceof DataForSeoProvider)

  const fallback = await getKeywordProvider('authoritative', {
    readConfig: () => config(),
    hasDataForSeoCredentials: () => true,
  })
  assert.ok(fallback instanceof DataForSeoProvider)

  const missing = await getKeywordProvider(undefined, {
    readConfig: () => config(),
    hasDataForSeoCredentials: () => false,
  })
  assert.equal(missing, undefined)
})
