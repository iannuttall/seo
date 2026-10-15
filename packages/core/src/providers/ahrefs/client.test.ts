import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import { ProviderError } from '../errors.js'
import { AhrefsClient } from './client.js'

function limitsFixture(): {
  limits_and_usage: {
    api_key_expiration_date: string
    subscription: string
    units_limit_api_key: number | null
    units_limit_workspace: number | null
    units_usage_api_key: number
    units_usage_workspace: number | null
    usage_reset_date: string
  }
} {
  return {
    limits_and_usage: {
      api_key_expiration_date: '2027-07-24T00:00:00Z',
      subscription: 'Lite',
      units_limit_api_key: 100_000,
      units_limit_workspace: 250_000,
      units_usage_api_key: 1_250,
      units_usage_workspace: 2_500,
      usage_reset_date: '2026-08-01',
    },
  }
}

test('free limits request validates the key and keeps it out of evidence', async () => {
  const apiKey = 'ahrefs-test-secret'
  let requestedUrl = ''
  let authorization = ''
  const result = await new AhrefsClient({
    apiKey,
    baseUrl: 'https://provider.invalid/v3/',
    now: () => new Date('2026-07-24T15:00:00.000Z'),
    fetch: async (url, init) => {
      requestedUrl = String(url)
      authorization = String(
        (init?.headers as Record<string, string> | undefined)?.authorization,
      )
      return new Response(JSON.stringify(limitsFixture()))
    },
  }).limitsAndUsage()

  assert.equal(
    requestedUrl,
    'https://provider.invalid/v3/subscription-info/limits-and-usage',
  )
  assert.equal(authorization, `Bearer ${apiKey}`)
  assert.deepEqual(result, {
    provider: 'ahrefs',
    apiVersion: 3,
    subscription: 'Lite',
    apiKeyExpiresAt: '2027-07-24T00:00:00Z',
    usageResetsAt: '2026-08-01',
    apiKeyUnits: {
      limit: 100_000,
      used: 1_250,
      remaining: 98_750,
    },
    workspaceUnits: {
      limit: 250_000,
      used: 2_500,
      remaining: 247_500,
    },
    observedAt: '2026-07-24T15:00:00.000Z',
    requestCostUnits: 0,
  })
  assert.doesNotMatch(JSON.stringify(result), new RegExp(apiKey))
})

test('limits request reports missing and rejected keys safely', async () => {
  let called = false
  await assert.rejects(
    new AhrefsClient({
      apiKey: ' ',
      fetch: async () => {
        called = true
        return new Response('{}')
      },
    }).limitsAndUsage(),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'configuration')
      return true
    },
  )
  assert.equal(called, false)

  const apiKey = 'rejected-secret'
  await assert.rejects(
    new AhrefsClient({
      apiKey,
      fetch: async () => new Response('', { status: 401 }),
    }).limitsAndUsage(),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'authentication')
      assert.doesNotMatch(error.message, new RegExp(apiKey))
      return true
    },
  )
})
