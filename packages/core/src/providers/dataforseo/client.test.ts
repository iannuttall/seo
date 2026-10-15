import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import { ProviderError } from '../errors.js'
import { DataForSeoClient } from './client.js'
import { firstAccount, userDataFixture } from './client-test-fixtures.js'

test('user data uses the free account endpoint and returns owned fields', async () => {
  let requestedUrl = ''
  let requestedMethod = ''
  let authorization = ''
  const client = new DataForSeoClient({
    credentials: () => ({
      login: 'api-owner@example.test',
      password: 'api-password',
    }),
    now: () => new Date('2026-07-21T08:00:00.000Z'),
    fetch: async (url, init) => {
      requestedUrl = String(url)
      requestedMethod = String(init?.method)
      authorization = String(
        (init?.headers as Record<string, string> | undefined)?.authorization,
      )
      return new Response(JSON.stringify(userDataFixture()))
    },
  })

  assert.deepEqual(await client.userData(), {
    provider: 'dataforseo',
    login: 'api-owner@example.test',
    timezone: 'Europe/London',
    balanceMicros: 7_125_001,
    depositedMicros: 25_500_000,
    apiVersion: '0.1.test',
    requestCostMicros: 0,
    taskIds: ['account-task-id'],
    observedAt: '2026-07-21T08:00:00.000Z',
  })
  assert.equal(requestedUrl, 'https://api.dataforseo.com/v3/appendix/user_data')
  assert.equal(requestedMethod, 'GET')
  assert.equal(
    authorization,
    `Basic ${Buffer.from('api-owner@example.test:api-password').toString(
      'base64',
    )}`,
  )
})

test('user data keeps missing optional money distinct from zero', async () => {
  const fixture = userDataFixture()
  firstAccount(fixture).money = {}
  const client = new DataForSeoClient({
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => new Response(JSON.stringify(fixture)),
  })

  const account = await client.userData()
  assert.equal(account.balanceMicros, null)
  assert.equal(account.depositedMicros, null)
  assert.equal(account.requestCostMicros, 0)
})

test('user data reports missing and rejected credentials safely', async () => {
  let called = false
  const missing = new DataForSeoClient({
    credentials: () => undefined,
    fetch: async () => {
      called = true
      return new Response('{}')
    },
  })
  await assert.rejects(missing.userData(), (error) => {
    assert.ok(error instanceof ProviderError)
    assert.equal(error.code, 'configuration')
    return true
  })
  assert.equal(called, false)

  const rejected = new DataForSeoClient({
    credentials: () => ({ login: 'user', password: 'wrong' }),
    fetch: async () => new Response('', { status: 401 }),
  })
  await assert.rejects(rejected.userData(), (error) => {
    assert.ok(error instanceof ProviderError)
    assert.equal(error.code, 'authentication')
    assert.doesNotMatch(error.message, /wrong/)
    return true
  })
})
