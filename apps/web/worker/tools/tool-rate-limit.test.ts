import assert from 'node:assert/strict'
import test from 'node:test'
import { applyToolRateLimit } from './tool-rate-limit.ts'

function limiter(success: boolean) {
  const keys: string[] = []
  return {
    keys,
    binding: {
      async limit(input: { key: string }) {
        keys.push(input.key)
        return { success }
      },
    },
  }
}

test('rate limits tool posts by trusted client and route', async () => {
  const client = limiter(true)
  const route = limiter(true)
  const response = await applyToolRateLimit(
    new Request('https://seoskill.dev/api/tools/sitemap-extractor', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.8' },
    }),
    {
      TOOL_CLIENT_RATE_LIMITER: client.binding,
      TOOL_ROUTE_RATE_LIMITER: route.binding,
    } as never,
  )

  assert.equal(response, undefined)
  assert.deepEqual(client.keys, ['203.0.113.8\n/api/tools/sitemap-extractor'])
  assert.deepEqual(route.keys, ['/api/tools/sitemap-extractor'])
})

test('fails closed when identity is missing or either limit is reached', async () => {
  const allowed = limiter(true)
  const blocked = limiter(false)
  const missingIdentity = await applyToolRateLimit(
    new Request('https://seoskill.dev/api/tools/favicon-checker', {
      method: 'POST',
    }),
    {
      TOOL_CLIENT_RATE_LIMITER: allowed.binding,
      TOOL_ROUTE_RATE_LIMITER: allowed.binding,
    } as never,
  )
  const limited = await applyToolRateLimit(
    new Request('https://seoskill.dev/api/tools/favicon-checker', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.9' },
    }),
    {
      TOOL_CLIENT_RATE_LIMITER: allowed.binding,
      TOOL_ROUTE_RATE_LIMITER: blocked.binding,
    } as never,
  )

  assert.equal(missingIdentity?.status, 503)
  assert.equal(limited?.status, 429)
  assert.deepEqual(await limited?.json(), {
    error: 'Too many checks. Wait a minute and try again.',
  })
})

test('does not spend rate-limit counters on non-post requests', async () => {
  const client = limiter(false)
  const route = limiter(false)
  const response = await applyToolRateLimit(
    new Request('https://seoskill.dev/api/tools/robots-txt'),
    {
      TOOL_CLIENT_RATE_LIMITER: client.binding,
      TOOL_ROUTE_RATE_LIMITER: route.binding,
    } as never,
  )

  assert.equal(response, undefined)
  assert.deepEqual(client.keys, [])
  assert.deepEqual(route.keys, [])
})
