import assert from 'node:assert/strict'
import test from 'node:test'
import { applyDailyToolQuota } from './daily-tool-quota.ts'

const secret = 'quota-hash-secret-with-at-least-32-characters'
const now = new Date('2026-08-09T12:00:00.000Z')

function envFor(reservation: Record<string, unknown>) {
  let objectName = ''
  let input: Record<string, unknown> | undefined
  return {
    state: {
      get objectName() {
        return objectName
      },
      get input() {
        return input
      },
    },
    env: {
      TOOL_QUOTA_HASH_KEY: secret,
      PAID_TOOL_GUARD: {
        getByName(name: string) {
          objectName = name
          return {
            async fetch(_request: RequestInfo | URL, init?: RequestInit) {
              input = JSON.parse(String(init?.body)) as Record<string, unknown>
              return Response.json(reservation)
            },
          }
        },
      },
    },
  }
}

test('reserves one exact daily check for every Worker-backed public tool', async () => {
  const fixture = envFor({
    allowed: true,
    identityUsed: 1,
    identityRemaining: 9,
    day: '2026-08-09',
    tool: 'serp-preview',
    resetAt: Date.parse('2026-08-10T00:00:00.000Z'),
  })
  const response = await applyDailyToolQuota(
    new Request('https://seoskill.dev/api/tools/serp-preview', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.8' },
    }),
    fixture.env,
    now,
  )

  assert.equal(response, undefined)
  assert.equal(fixture.state.objectName, 'paid-tools:2026-08-09')
  assert.equal(fixture.state.input?.kind, 'identity')
  assert.equal(fixture.state.input?.tool, 'serp-preview')
  assert.match(String(fixture.state.input?.identityHash), /^[0-9a-f]{64}$/)
})

test('returns the daily-limit message only after the tenth reservation', async () => {
  const fixture = envFor({
    allowed: false,
    reason: 'identity-limit',
    identityUsed: 10,
    identityRemaining: 0,
    day: '2026-08-09',
    tool: 'robots-txt',
    resetAt: Date.parse('2026-08-10T00:00:00.000Z'),
  })
  const response = await applyDailyToolQuota(
    new Request('https://seoskill.dev/api/tools/robots-txt', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.8' },
    }),
    fixture.env,
    now,
  )

  assert.equal(response?.status, 429)
  assert.equal(response?.headers.get('retry-after'), '43200')
  assert.deepEqual(await response?.json(), {
    error: 'Daily check limit reached. Try again tomorrow.',
  })
})

test('does not add a second daily reservation to provider-backed tools', async () => {
  const fixture = envFor({})
  const response = await applyDailyToolQuota(
    new Request('https://seoskill.dev/api/tools/domain-rating', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.8' },
    }),
    fixture.env,
    now,
  )

  assert.equal(response, undefined)
  assert.equal(fixture.state.objectName, '')
})
