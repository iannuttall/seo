import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  PaidToolReservation,
  PaidToolReservationInput,
} from './paid-tool-guard.ts'
import {
  handleProtectedTool,
  PROTECTED_TOOL_LIMITS,
  type ProtectedToolEnvironment,
  type ProtectedToolParsedInput,
} from './protected-tool-handler.ts'

const endpoint = 'https://seoskill.dev/api/tools/spam-score'
const now = new Date('2026-08-09T12:00:00.000Z')
const resetAt = Date.parse('2026-08-10T00:00:00.000Z')

type ParsedProviderInput = { target: string }

function request(
  body: string = JSON.stringify({
    target: 'example.com',
    turnstileToken: 'test-token',
  }),
  overrides: {
    url?: string
    method?: string
    headers?: Record<string, string>
  } = {},
): Request {
  return new Request(overrides.url ?? endpoint, {
    method: overrides.method ?? 'POST',
    headers: {
      'cf-connecting-ip': '203.0.113.7',
      'content-type': 'application/json',
      origin: 'https://seoskill.dev',
      'sec-fetch-site': 'same-origin',
      ...overrides.headers,
    },
    body: overrides.method === 'GET' ? undefined : body,
  })
}

function parse(value: unknown): ProtectedToolParsedInput<ParsedProviderInput> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid input')
  }
  const body = value as Record<string, unknown>
  if (
    Object.keys(body).sort().join(',') !== 'target,turnstileToken' ||
    typeof body.target !== 'string' ||
    typeof body.turnstileToken !== 'string'
  ) {
    throw new TypeError('Invalid input')
  }
  return {
    target: body.target,
    turnstileToken: body.turnstileToken,
    providerInput: { target: body.target },
  }
}

function reservation(
  input: Partial<PaidToolReservation> = {},
): PaidToolReservation {
  return {
    allowed: true,
    day: '2026-08-09',
    identityUsed: 1,
    identityRemaining: 9,
    provider: 'dataforseo-spam',
    providerUsed: 1,
    providerRemaining: 99,
    resetAt,
    ...input,
  } as PaidToolReservation
}

function environment(
  reserve: (input: PaidToolReservationInput) => Promise<PaidToolReservation>,
  getByName: (name: string) => void = () => {},
): ProtectedToolEnvironment {
  return {
    PAID_TOOL_GUARD: {
      getByName(name) {
        getByName(name)
        return {
          async fetch(input, init) {
            assert.equal(
              input.toString(),
              'https://paid-tool-guard.internal/reserve',
            )
            assert.equal(init?.method, 'POST')
            const body = JSON.parse(
              String(init?.body),
            ) as PaidToolReservationInput
            return Response.json(await reserve(body))
          },
        }
      },
    },
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    TOOL_QUOTA_HASH_KEY: 'quota-hash-secret-with-at-least-32-characters',
  }
}

test('successful requests verify, reserve, then call the provider', async () => {
  const calls: string[] = []
  let reservedIdentity = ''
  const env = environment(
    async (input) => {
      calls.push('reserve')
      reservedIdentity = input.identityHash
      assert.deepEqual(
        {
          day: input.day,
          tool: input.tool,
          providerDailyLimit: input.providerDailyLimit,
        },
        {
          day: '2026-08-09',
          tool: 'spam-score',
          providerDailyLimit: 100,
        },
      )
      return reservation()
    },
    (name) => assert.equal(name, 'paid-tools:2026-08-09'),
  )

  const response = await handleProtectedTool(request(), env, {
    tool: 'spam-score',
    providerDailyLimit: 100,
    parse,
    now: () => now,
    verifyTurnstile: async (options) => {
      calls.push('verify')
      assert.equal(options.expectedAction, 'spam-score')
      assert.equal(options.secretKey, 'turnstile-secret')
      assert.equal(options.remoteIp, '203.0.113.7')
      return {
        ok: true,
        action: 'spam-score',
        hostname: 'seoskill.dev',
      }
    },
    provider: async (input) => {
      calls.push('provider')
      assert.deepEqual(input, { target: 'example.com' })
      return { target: input.target, spamScore: 12 }
    },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(calls, ['verify', 'reserve', 'provider'])
  assert.match(reservedIdentity, /^[0-9a-f]{64}$/)
  assert.doesNotMatch(reservedIdentity, /203\.0\.113\.7/)
  assert.deepEqual(await response.json(), {
    schema: 1,
    result: { target: 'example.com', spamScore: 12 },
  })
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('localhost preview can bypass Turnstile without weakening other requests', async () => {
  const calls: string[] = []
  const env = environment(async () => {
    calls.push('reserve')
    return reservation()
  })
  const response = await handleProtectedTool(
    request(
      JSON.stringify({
        target: 'example.com',
        turnstileToken: 'local-preview',
      }),
      {
        url: 'http://127.0.0.1:8787/api/tools/spam-score',
        headers: { origin: 'http://127.0.0.1:8787' },
      },
    ),
    { ...env, LOCAL_TOOL_PREVIEW: 'true' },
    {
      tool: 'spam-score',
      providerDailyLimit: 100,
      parse,
      now: () => now,
      verifyTurnstile: async () => {
        calls.push('verify')
        throw new Error('Verification should be skipped.')
      },
      provider: async () => {
        calls.push('provider')
        return { spamScore: 12 }
      },
    },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(calls, ['reserve', 'provider'])
})

test('the local bypass token still verifies when localhost mode is off', async () => {
  let verifyCalls = 0
  const response = await handleProtectedTool(
    request(
      JSON.stringify({
        target: 'example.com',
        turnstileToken: 'local-preview',
      }),
    ),
    environment(async () => reservation()),
    {
      tool: 'spam-score',
      providerDailyLimit: 100,
      parse,
      now: () => now,
      verifyTurnstile: async () => {
        verifyCalls += 1
        return { ok: false, reason: 'invalid-token', retryable: true }
      },
      provider: async () => ({}),
    },
  )

  assert.equal(response.status, 403)
  assert.equal(verifyCalls, 1)
})

test('request contract rejects methods, content types, cross-site calls, and large bodies', async () => {
  let calls = 0
  const env = environment(async () => {
    calls += 1
    return reservation()
  })
  const options = {
    tool: 'spam-score' as const,
    providerDailyLimit: 100,
    parse,
    provider: async () => {
      calls += 1
      return {}
    },
  }

  const method = await handleProtectedTool(
    request('', { method: 'GET' }),
    env,
    options,
  )
  const contentType = await handleProtectedTool(
    request(undefined, { headers: { 'content-type': 'text/plain' } }),
    env,
    options,
  )
  const crossSite = await handleProtectedTool(
    request(undefined, {
      headers: {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
      },
    }),
    env,
    options,
  )
  const oversized = await handleProtectedTool(
    request('x'.repeat(PROTECTED_TOOL_LIMITS.bodyBytes + 1), {
      headers: {
        'content-length': String(PROTECTED_TOOL_LIMITS.bodyBytes + 1),
      },
    }),
    env,
    options,
  )

  assert.equal(method.status, 405)
  assert.equal(method.headers.get('allow'), 'POST')
  assert.equal(contentType.status, 415)
  assert.equal(crossSite.status, 403)
  assert.equal(oversized.status, 400)
  assert.equal(calls, 0)
})

test('strict parser and handler output validation reject malformed fields', async () => {
  let reserveCalls = 0
  const env = environment(async () => {
    reserveCalls += 1
    return reservation()
  })
  const malformed = await handleProtectedTool(
    request(JSON.stringify({ target: 'example.com', extra: true })),
    env,
    {
      tool: 'spam-score',
      providerDailyLimit: 100,
      parse,
      provider: async () => ({}),
    },
  )
  const invalidParserOutput = await handleProtectedTool(request(), env, {
    tool: 'spam-score',
    providerDailyLimit: 100,
    parse: () => ({
      target: '',
      turnstileToken: 'token',
      providerInput: { target: '' },
    }),
    provider: async () => ({}),
  })

  assert.equal(malformed.status, 400)
  assert.equal(invalidParserOutput.status, 400)
  assert.equal(reserveCalls, 0)
})

test('Turnstile failures stop before quota reservation', async () => {
  let reserveCalls = 0
  const env = environment(async () => {
    reserveCalls += 1
    return reservation()
  })
  const invalid = await handleProtectedTool(request(), env, {
    tool: 'domain-rating',
    providerDailyLimit: 500,
    parse,
    verifyTurnstile: async () => ({
      ok: false,
      reason: 'action-mismatch',
      retryable: true,
    }),
    provider: async () => ({}),
  })
  const unavailable = await handleProtectedTool(request(), env, {
    tool: 'domain-rating',
    providerDailyLimit: 500,
    parse,
    verifyTurnstile: async () => {
      throw new Error('raw Turnstile failure')
    },
    provider: async () => ({}),
  })

  assert.equal(invalid.status, 403)
  assert.equal(unavailable.status, 503)
  assert.doesNotMatch(await unavailable.text(), /raw Turnstile failure/)
  assert.equal(reserveCalls, 0)
})

test('missing trusted identity data fails closed', async () => {
  const env = environment(async () => reservation())
  const missingIp = await handleProtectedTool(
    request(undefined, { headers: { 'cf-connecting-ip': '' } }),
    env,
    {
      tool: 'website-traffic',
      providerDailyLimit: 10,
      parse,
      provider: async () => ({}),
    },
  )
  const missingSecret = await handleProtectedTool(
    request(),
    { ...env, TOOL_QUOTA_HASH_KEY: '' },
    {
      tool: 'website-traffic',
      providerDailyLimit: 10,
      parse,
      provider: async () => ({}),
    },
  )

  assert.equal(missingIp.status, 503)
  assert.equal(missingSecret.status, 503)
})

test('identity quota maps to 429 with safe remaining and reset data', async () => {
  let providerCalls = 0
  const env = environment(async () =>
    reservation({
      allowed: false,
      reason: 'identity-limit',
      identityUsed: 10,
      identityRemaining: 0,
    }),
  )
  const response = await handleProtectedTool(request(), env, {
    tool: 'spam-score',
    providerDailyLimit: 100,
    parse,
    now: () => now,
    verifyTurnstile: async () => ({
      ok: true,
      action: 'spam-score',
      hostname: 'seoskill.dev',
    }),
    provider: async () => {
      providerCalls += 1
      return {}
    },
  })

  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '43200')
  assert.deepEqual(await response.json(), {
    error: 'Daily check limit reached. Try again tomorrow.',
  })
  assert.equal(providerCalls, 0)
})

test('provider quota maps to 503 without exposing the provider budget', async () => {
  let providerCalls = 0
  const env = environment(async () =>
    reservation({
      allowed: false,
      reason: 'provider-limit',
      identityUsed: 2,
      identityRemaining: 8,
      providerUsed: 100,
      providerRemaining: 0,
    }),
  )
  const response = await handleProtectedTool(request(), env, {
    tool: 'spam-score',
    providerDailyLimit: 100,
    parse,
    now: () => now,
    verifyTurnstile: async () => ({
      ok: true,
      action: 'spam-score',
      hostname: 'seoskill.dev',
    }),
    provider: async () => {
      providerCalls += 1
      return {}
    },
  })
  const body = await response.text()

  assert.equal(response.status, 503)
  assert.doesNotMatch(body, /remaining/)
  assert.doesNotMatch(body, /provider|100/)
  assert.equal(providerCalls, 0)
})

test('guard and provider exceptions return safe errors only', async () => {
  const guardFailure = await handleProtectedTool(
    request(),
    environment(async () => {
      throw new Error('raw guard storage failure')
    }),
    {
      tool: 'spam-score',
      providerDailyLimit: 100,
      parse,
      verifyTurnstile: async () => ({
        ok: true,
        action: 'spam-score',
        hostname: 'seoskill.dev',
      }),
      provider: async () => ({}),
    },
  )
  const providerFailure = await handleProtectedTool(
    request(),
    environment(async () => reservation()),
    {
      tool: 'spam-score',
      providerDailyLimit: 100,
      parse,
      verifyTurnstile: async () => ({
        ok: true,
        action: 'spam-score',
        hostname: 'seoskill.dev',
      }),
      provider: async () => {
        throw new Error('raw provider credentials and payload')
      },
    },
  )

  assert.equal(guardFailure.status, 503)
  assert.equal(providerFailure.status, 502)
  assert.doesNotMatch(await guardFailure.text(), /raw guard storage failure/)
  assert.doesNotMatch(
    await providerFailure.text(),
    /raw provider credentials and payload/,
  )
})
