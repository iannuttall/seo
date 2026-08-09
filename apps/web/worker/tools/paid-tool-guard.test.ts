import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PAID_TOOL_GUARD_MAX_SQL_STATEMENTS_PER_RESERVATION,
  PUBLIC_TOOL_GUARD_MAX_SQL_STATEMENTS_PER_RESERVATION,
} from './paid-tool-guard.ts'
import {
  decidePaidToolQuota,
  decideToolIdentityQuota,
  derivePaidToolIdentityFromRequest,
  derivePaidToolIdentityHash,
  MAX_PROVIDER_DAILY_LIMIT,
  PAID_TOOL_DAILY_LIMIT,
  PAID_TOOL_GUARD_RETENTION_DAYS,
  PAID_TOOL_PROVIDERS,
  paidToolQuotaCleanupAt,
  paidToolQuotaObjectName,
  utcDay,
  verifyTurnstile,
} from './paid-tool-guard-core.ts'

const identitySecret = 'a-development-only-secret-with-32-bytes'

test('guard reservations have a hard SQL statement ceiling', () => {
  assert.equal(PAID_TOOL_GUARD_MAX_SQL_STATEMENTS_PER_RESERVATION, 7)
  assert.equal(PUBLIC_TOOL_GUARD_MAX_SQL_STATEMENTS_PER_RESERVATION, 4)
})

test('public Worker tools use the same exact daily identity allowance', () => {
  assert.deepEqual(decideToolIdentityQuota(9), {
    allowed: true,
    identityUsed: 10,
    identityRemaining: 0,
  })
  assert.deepEqual(decideToolIdentityQuota(10), {
    allowed: false,
    reason: 'identity-limit',
    identityUsed: 10,
    identityRemaining: 0,
  })
})

function turnstileResponse(input: {
  success?: boolean
  action?: string
  hostname?: string
}): Response {
  return Response.json(input)
}

test('quota allows exactly ten daily calls for one identity and tool', () => {
  let identityUsed = 0
  let providerUsed = 0
  for (let index = 0; index < PAID_TOOL_DAILY_LIMIT; index += 1) {
    const result = decidePaidToolQuota({
      identityUsed,
      providerUsed,
      providerDailyLimit: 100,
    })
    assert.equal(result.allowed, true)
    identityUsed = result.identityUsed
    providerUsed = result.providerUsed
  }

  const denied = decidePaidToolQuota({
    identityUsed,
    providerUsed,
    providerDailyLimit: 100,
  })
  assert.deepEqual(denied, {
    allowed: false,
    reason: 'identity-limit',
    identityUsed: 10,
    identityRemaining: 0,
    providerUsed: 10,
    providerRemaining: 90,
  })
})

test('provider budget is a separate global ceiling', () => {
  const finalCall = decidePaidToolQuota({
    identityUsed: 0,
    providerUsed: 19,
    providerDailyLimit: 20,
  })
  assert.deepEqual(finalCall, {
    allowed: true,
    identityUsed: 1,
    identityRemaining: 9,
    providerUsed: 20,
    providerRemaining: 0,
  })

  const denied = decidePaidToolQuota({
    identityUsed: 0,
    providerUsed: 20,
    providerDailyLimit: 20,
  })
  assert.equal(denied.allowed, false)
  assert.equal(denied.reason, 'provider-limit')
  assert.throws(
    () =>
      decidePaidToolQuota({
        identityUsed: 0,
        providerUsed: 0,
        providerDailyLimit: MAX_PROVIDER_DAILY_LIMIT + 1,
      }),
    /Invalid provider daily limit/,
  )
})

test('daily object names and cleanup are deterministic and UTC based', () => {
  const now = new Date('2026-08-09T23:59:59.999-07:00')
  assert.equal(utcDay(now), '2026-08-10')
  assert.equal(paidToolQuotaObjectName('2026-08-10'), 'paid-tools:2026-08-10')
  assert.equal(
    paidToolQuotaCleanupAt('2026-08-10'),
    Date.parse('2026-08-12T00:00:00.000Z'),
  )
  assert.equal(PAID_TOOL_GUARD_RETENTION_DAYS, 2)
  assert.throws(() => paidToolQuotaObjectName('2026-02-30'), /Invalid UTC day/)
  assert.deepEqual(PAID_TOOL_PROVIDERS, {
    'spam-score': 'dataforseo-spam',
    'domain-rating': 'ahrefs',
    'website-traffic': 'dataforseo-traffic',
  })
})

test('identity hashes retain no raw IP and rotate by UTC day', async () => {
  const first = await derivePaidToolIdentityHash(
    '203.0.113.7',
    '2026-08-09',
    identitySecret,
  )
  const repeat = await derivePaidToolIdentityHash(
    '203.0.113.7',
    '2026-08-09',
    identitySecret,
  )
  const nextDay = await derivePaidToolIdentityHash(
    '203.0.113.7',
    '2026-08-10',
    identitySecret,
  )
  const otherIp = await derivePaidToolIdentityHash(
    '203.0.113.8',
    '2026-08-09',
    identitySecret,
  )

  assert.match(first, /^[0-9a-f]{64}$/)
  assert.equal(first, repeat)
  assert.notEqual(first, nextDay)
  assert.notEqual(first, otherIp)
  assert.doesNotMatch(first, /203\.0\.113\.7/)
})

test('request identity uses only the trusted Cloudflare connecting IP header', async () => {
  const missing = await derivePaidToolIdentityFromRequest(
    new Request('https://seoskill.dev', {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    }),
    '2026-08-09',
    identitySecret,
  )
  const present = await derivePaidToolIdentityFromRequest(
    new Request('https://seoskill.dev', {
      headers: { 'cf-connecting-ip': '2001:DB8::1' },
    }),
    '2026-08-09',
    identitySecret,
  )

  assert.equal(missing, undefined)
  assert.match(present ?? '', /^[0-9a-f]{64}$/)
})

test('Turnstile validates the token server side with action and hostname', async () => {
  let capturedUrl = ''
  let capturedInit: RequestInit | undefined
  const result = await verifyTurnstile({
    token: 'verified-token',
    secretKey: 'turnstile-secret',
    expectedAction: 'spam-score',
    remoteIp: '203.0.113.7',
    idempotencyKey: 'turnstile-test-id',
    fetcher: async (input, init) => {
      capturedUrl = input.toString()
      capturedInit = init
      return turnstileResponse({
        success: true,
        action: 'spam-score',
        hostname: 'seoskill.dev',
      })
    },
  })

  assert.deepEqual(result, {
    ok: true,
    action: 'spam-score',
    hostname: 'seoskill.dev',
  })
  assert.equal(
    capturedUrl,
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  )
  assert.equal(capturedInit?.method, 'POST')
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    secret: 'turnstile-secret',
    response: 'verified-token',
    remoteip: '203.0.113.7',
    idempotency_key: 'turnstile-test-id',
  })
})

test('Turnstile rejects mismatched actions, hostnames, and failed tokens', async () => {
  const action = await verifyTurnstile({
    token: 'verified-token',
    secretKey: 'turnstile-secret',
    expectedAction: 'spam-score',
    fetcher: async () =>
      turnstileResponse({
        success: true,
        action: 'domain-rating',
        hostname: 'seoskill.dev',
      }),
  })
  const hostname = await verifyTurnstile({
    token: 'verified-token',
    secretKey: 'turnstile-secret',
    expectedAction: 'spam-score',
    fetcher: async () =>
      turnstileResponse({
        success: true,
        action: 'spam-score',
        hostname: 'example.com',
      }),
  })
  const failed = await verifyTurnstile({
    token: 'forged-token',
    secretKey: 'turnstile-secret',
    expectedAction: 'spam-score',
    fetcher: async () => turnstileResponse({ success: false }),
  })

  assert.deepEqual(action, {
    ok: false,
    reason: 'action-mismatch',
    retryable: true,
  })
  assert.deepEqual(hostname, {
    ok: false,
    reason: 'hostname-mismatch',
    retryable: false,
  })
  assert.deepEqual(failed, {
    ok: false,
    reason: 'invalid-token',
    retryable: true,
  })
})

test('localhost Turnstile responses require explicit test mode', async () => {
  const fetcher = async () =>
    turnstileResponse({
      success: true,
      action: 'website-traffic',
      hostname: 'localhost',
    })
  const production = await verifyTurnstile({
    token: 'verified-token',
    secretKey: 'turnstile-secret',
    expectedAction: 'website-traffic',
    fetcher,
  })
  const localTest = await verifyTurnstile({
    token: 'verified-token',
    secretKey: 'turnstile-secret',
    expectedAction: 'website-traffic',
    allowLocalhostForTests: true,
    fetcher,
  })

  assert.equal(production.ok, false)
  assert.deepEqual(localTest, {
    ok: true,
    action: 'website-traffic',
    hostname: 'localhost',
  })
})

test('Cloudflare always-pass responses require explicit localhost test mode', async () => {
  const fetcher = async () =>
    turnstileResponse({
      success: true,
      hostname: 'example.com',
      metadata: { result_with_testing_key: true },
    })
  const production = await verifyTurnstile({
    token: 'XXXX.DUMMY.TOKEN.XXXX',
    secretKey: 'turnstile-secret',
    expectedAction: 'website-traffic',
    fetcher,
  })
  const localTest = await verifyTurnstile({
    token: 'XXXX.DUMMY.TOKEN.XXXX',
    secretKey: 'turnstile-secret',
    expectedAction: 'website-traffic',
    allowLocalhostForTests: true,
    fetcher,
  })
  const missingMarker = await verifyTurnstile({
    token: 'XXXX.DUMMY.TOKEN.XXXX',
    secretKey: 'turnstile-secret',
    expectedAction: 'website-traffic',
    allowLocalhostForTests: true,
    fetcher: async () =>
      turnstileResponse({ success: true, hostname: 'example.com' }),
  })

  assert.deepEqual(production, {
    ok: false,
    reason: 'action-mismatch',
    retryable: true,
  })
  assert.deepEqual(localTest, {
    ok: true,
    action: 'website-traffic',
    hostname: 'example.com',
  })
  assert.deepEqual(missingMarker, {
    ok: false,
    reason: 'action-mismatch',
    retryable: true,
  })
})

test('Turnstile fails closed on oversized or unavailable responses', async () => {
  const oversized = await verifyTurnstile({
    token: 'verified-token',
    secretKey: 'turnstile-secret',
    expectedAction: 'spam-score',
    fetcher: async () =>
      new Response('x'.repeat(16_385), {
        headers: { 'content-length': '16385' },
      }),
  })
  const unavailable = await verifyTurnstile({
    token: 'verified-token',
    secretKey: 'turnstile-secret',
    expectedAction: 'spam-score',
    fetcher: async () => new Response('down', { status: 503 }),
  })

  assert.deepEqual(oversized, {
    ok: false,
    reason: 'unavailable',
    retryable: true,
  })
  assert.deepEqual(unavailable, {
    ok: false,
    reason: 'unavailable',
    retryable: true,
  })
})
