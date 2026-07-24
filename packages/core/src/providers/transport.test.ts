import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import { z } from 'zod'
import { ProviderError } from './errors.js'
import {
  type ProviderFetch,
  providerRequestJson,
  providerRequestText,
} from './transport.js'

const base = {
  provider: 'dataforseo' as const,
  operation: 'keyword-metrics',
  url: 'https://provider.invalid/metrics',
  maxResponseBytes: 1_024,
  timeoutMs: 1_000,
}

test('provider transport validates JSON before returning it', async () => {
  const data = await providerRequestJson({
    ...base,
    fetch: async () => new Response('{"value":0}'),
    schema: z.object({ value: z.number() }).strict(),
  })
  assert.deepEqual(data, { value: 0 })

  await assert.rejects(
    providerRequestJson({
      ...base,
      fetch: async () =>
        new Response(
          '{"tasks":[{"result":[{"items":[{"cost":"do-not-log-this-value"}]}]}]}',
        ),
      schema: z
        .object({
          tasks: z.array(
            z.object({
              result: z.array(
                z.object({ items: z.array(z.object({ cost: z.number() })) }),
              ),
            }),
          ),
        })
        .strict(),
    }),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'invalid-response')
      assert.match(
        error.message,
        /tasks\[0\]\.result\[0\]\.items\[0\]\.cost \(invalid_type\)/,
      )
      assert.doesNotMatch(error.message, /do-not-log-this-value/)
      return true
    },
  )
})

test('provider transport returns structured safe errors', async () => {
  await assert.rejects(
    providerRequestText({
      ...base,
      fetch: async () =>
        new Response('secret body that exceeds the configured response limit', {
          status: 401,
        }),
      maxResponseBytes: 5,
    }),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'authentication')
      assert.equal(error.status, 401)
      assert.doesNotMatch(error.message, /secret body/)
      assert.deepEqual(error.toJSON(), {
        name: 'ProviderError',
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'authentication',
        message: 'dataforseo rejected the configured credentials.',
        status: 401,
        retryable: false,
      })
      return true
    },
  )
})

test('provider transport bounds declared and streamed response bodies', async () => {
  for (const fetch of [
    async () =>
      new Response('small', { headers: { 'content-length': '2048' } }),
    async () => new Response('body over the limit'),
  ]) {
    await assert.rejects(
      providerRequestText({
        ...base,
        fetch,
        maxResponseBytes: 5,
      }),
      (error) =>
        error instanceof ProviderError && error.code === 'response-too-large',
    )
  }
})

test('provider transport retries only explicitly safe operations', async () => {
  let safeAttempts = 0
  const safeFetch: ProviderFetch = async () => {
    safeAttempts += 1
    return safeAttempts === 1
      ? new Response('oversized transient response body', { status: 503 })
      : new Response('ok')
  }
  assert.equal(
    await providerRequestText({
      ...base,
      fetch: safeFetch,
      maxResponseBytes: 5,
      retry: 'safe',
      retryDelayMs: 0,
    }),
    'ok',
  )
  assert.equal(safeAttempts, 2)

  let chargedAttempts = 0
  await assert.rejects(
    providerRequestText({
      ...base,
      fetch: async () => {
        chargedAttempts += 1
        return new Response('', { status: 503 })
      },
      retry: 'never',
    }),
    ProviderError,
  )
  assert.equal(chargedAttempts, 1)
})

test('provider transport exposes successful response metadata', async () => {
  let observedCost = ''
  const result = await providerRequestJson({
    provider: 'ahrefs',
    operation: 'metadata',
    url: 'https://example.test',
    fetch: async () =>
      new Response('{"ok":true}', {
        headers: { 'x-api-units-cost-total-actual': '50' },
      }),
    maxResponseBytes: 1_024,
    timeoutMs: 1_000,
    schema: z.object({ ok: z.literal(true) }),
    onResponse: (response) => {
      observedCost = response.headers.get('x-api-units-cost-total-actual') ?? ''
    },
  })

  assert.deepEqual(result, { ok: true })
  assert.equal(observedCost, '50')
})
