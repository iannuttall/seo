import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import { z } from 'zod'
import Database from '../../storage/sqlite.js'
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

function cacheDatabase(): Database.Database {
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE provider_cache (
      provider TEXT NOT NULL,
      credential_scope TEXT NOT NULL,
      operation TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      request_json TEXT NOT NULL,
      response_json TEXT NOT NULL,
      row_count INTEGER,
      source_cost_micros INTEGER,
      task_ids_json TEXT NOT NULL DEFAULT '[]',
      fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY(provider, credential_scope, operation, request_hash)
    ) WITHOUT ROWID;
  `)
  return database
}

const spendLimits = {
  dailyNoticeMicros: 5_000_000,
  dailyHardLimitMicros: null,
  monthlyHardLimitMicros: null,
  maxRequestsPerReport: 20,
  maxRowsPerReport: 10_000,
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

test('unlimited and unavailable account limits stay distinct', async () => {
  const fixture = limitsFixture()
  fixture.limits_and_usage.units_limit_api_key = null
  fixture.limits_and_usage.units_limit_workspace = null
  fixture.limits_and_usage.units_usage_workspace = null
  const result = await new AhrefsClient({
    apiKey: 'api-key',
    fetch: async () => new Response(JSON.stringify(fixture)),
  }).limitsAndUsage()

  assert.deepEqual(result.apiKeyUnits, {
    limit: null,
    used: 1_250,
    remaining: null,
  })
  assert.deepEqual(result.workspaceUnits, {
    limit: null,
    used: null,
    remaining: null,
  })
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
      assert.match(error.message, /seo providers ahrefs connect/)
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
      assert.match(error.message, /API v3 key/)
      assert.doesNotMatch(error.message, new RegExp(apiKey))
      return true
    },
  )
})

test('limits request rejects malformed provider data', async () => {
  await assert.rejects(
    new AhrefsClient({
      apiKey: 'api-key',
      fetch: async () =>
        new Response(
          JSON.stringify({
            limits_and_usage: {
              ...limitsFixture().limits_and_usage,
              units_usage_api_key: -1,
            },
          }),
        ),
    }).limitsAndUsage(),
    (error) =>
      error instanceof ProviderError && error.code === 'invalid-response',
  )
})

test('paid requests preflight units, retain headers, and use the local cache', async () => {
  const database = cacheDatabase()
  const apiKey = 'ahrefs-paid-secret'
  let accountCalls = 0
  let researchCalls = 0
  const schema = z
    .object({
      keywords: z
        .array(
          z
            .object({
              keyword: z.string(),
              volume: z.number().int().nonnegative(),
            })
            .strict(),
        )
        .max(100),
    })
    .strict()
  const client = new AhrefsClient({
    apiKey,
    database,
    spendLimits,
    baseUrl: 'https://provider.invalid/v3/',
    now: () => new Date('2026-07-24T15:00:00.000Z'),
    fetch: async (url, init) => {
      const parsed = new URL(url)
      const headers = init?.headers as Record<string, string> | undefined
      assert.equal(headers?.authorization, `Bearer ${apiKey}`)
      if (parsed.pathname.endsWith('/limits-and-usage')) {
        accountCalls += 1
        return new Response(JSON.stringify(limitsFixture()))
      }
      researchCalls += 1
      assert.equal(parsed.searchParams.get('keywords'), 'ahrefs')
      return new Response(
        JSON.stringify({
          keywords: [{ keyword: 'ahrefs', volume: 10 }],
        }),
        {
          headers: {
            'x-api-rows': '1',
            'x-api-units-cost-row': '11',
            'x-api-units-cost-total': '50',
            'x-api-units-cost-total-actual': '50',
            'x-api-cache': 'miss',
          },
        },
      )
    },
  })
  const request = {
    operation: 'keyword-metrics',
    capability: 'keyword-metrics' as const,
    path: 'keywords-explorer/overview',
    query: {
      country: 'us',
      keywords: 'ahrefs',
      select: 'keyword,volume',
    },
    schema,
    requestedRows: 1,
    perRowUnits: 11,
    rowCount: (response: z.infer<typeof schema>) => response.keywords.length,
    context: {
      reportId: 'keyword-metrics',
      reportRunId: 'run-1',
    },
  }
  const first = await client.request(request)
  const cached = await client.request(request)

  assert.equal(accountCalls, 1)
  assert.equal(researchCalls, 1)
  assert.equal(first.returnedRows, 1)
  assert.deepEqual(first.cost.native, {
    unit: 'api-unit',
    estimatedUnits: 50,
    actualUnits: 50,
    remainingBefore: 98_750,
  })
  assert.equal(first.cache.status, 'miss')
  assert.equal(first.providerCache, 'miss')
  assert.equal(cached.cache.status, 'hit')
  assert.equal(cached.cost.native?.actualUnits, 0)
  const cache = database
    .prepare(
      'SELECT credential_scope, request_json, response_json FROM provider_cache',
    )
    .get() as Record<string, string>
  assert.doesNotMatch(JSON.stringify(cache), new RegExp(apiKey))
})

test('paid requests stop before acquisition when account units are too low', async () => {
  const fixture = limitsFixture()
  fixture.limits_and_usage.units_limit_api_key = 1_300
  let researchCalls = 0
  const client = new AhrefsClient({
    apiKey: 'api-key',
    spendLimits,
    fetch: async (url) => {
      if (new URL(url).pathname.endsWith('/limits-and-usage')) {
        return new Response(JSON.stringify(fixture))
      }
      researchCalls += 1
      return new Response('{}')
    },
  })

  await assert.rejects(
    client.request({
      operation: 'keyword-metrics',
      capability: 'keyword-metrics',
      path: 'keywords-explorer/overview',
      query: { country: 'us', keywords: 'paid keyword' },
      schema: z.object({ keywords: z.array(z.unknown()) }),
      requestedRows: 100,
      perRowUnits: 10,
      rowCount: () => 0,
      context: { reportId: 'keyword-metrics', reportRunId: 'run-low' },
    }),
    (error) => error instanceof ProviderError && error.code === 'budget-limit',
  )
  assert.equal(researchCalls, 0)
})

test('paid requests require complete unit headers', async () => {
  await assert.rejects(
    new AhrefsClient({
      apiKey: 'api-key',
      spendLimits,
      fetch: async (url) =>
        new URL(url).pathname.endsWith('/limits-and-usage')
          ? new Response(JSON.stringify(limitsFixture()))
          : new Response(JSON.stringify({ rows: [] })),
    }).request({
      operation: 'rows',
      capability: 'backlinks',
      path: 'site-explorer/all-backlinks',
      query: { target: 'ahrefs.com' },
      schema: z.object({ rows: z.array(z.unknown()) }),
      requestedRows: 1,
      perRowUnits: 1,
      rowCount: () => 0,
      context: { reportId: 'links', reportRunId: 'run-headers' },
    }),
    (error) =>
      error instanceof ProviderError && error.code === 'invalid-response',
  )
})

test('research requests map provider HTTP 400 responses to invalid input', async () => {
  await assert.rejects(
    new AhrefsClient({
      apiKey: 'api-key',
      spendLimits,
      fetch: async () => new Response('', { status: 400 }),
    }).request({
      operation: 'domain-rating',
      capability: 'domain-rating',
      path: 'public/domain-rating-free',
      query: { target: 'does-not-exist.invalid' },
      schema: z.object({ domain_rating: z.unknown() }),
      requestedRows: 1,
      perRowUnits: 0,
      rowCount: () => 1,
      free: true,
      context: { reportId: 'domain-rating', reportRunId: 'run-invalid' },
    }),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'configuration')
      assert.equal(error.status, 400)
      assert.match(error.message, /target or research parameters/)
      return true
    },
  )
})

test('request and report unit caps stop oversized work before network calls', async () => {
  let calls = 0
  await assert.rejects(
    new AhrefsClient({
      apiKey: 'api-key',
      spendLimits,
      fetch: async () => {
        calls += 1
        return new Response('{}')
      },
    }).request({
      operation: 'oversized',
      capability: 'ranked-keywords',
      path: 'site-explorer/organic-keywords',
      query: { target: 'example.com' },
      schema: z.object({ rows: z.array(z.unknown()) }),
      requestedRows: 1_000,
      perRowUnits: 26,
      rowCount: () => 0,
      context: { reportId: 'ranked-keywords', reportRunId: 'run-oversized' },
    }),
    (error) => error instanceof ProviderError && error.code === 'budget-limit',
  )
  assert.equal(calls, 0)
})
