import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import { PROVIDER_SPEND_SCHEMA_SQL } from '../../storage/provider-spend-schema.js'
import Database from '../../storage/sqlite.js'
import { ProviderError } from '../errors.js'
import {
  SERPBASE_SEARCH_ESTIMATED_COST_MICROS,
  SerpBaseClient,
} from './client.js'

const NOW = new Date('2026-08-11T08:00:00.000Z')
const LIMITS = {
  dailyNoticeMicros: 5_000_000,
  dailyHardLimitMicros: null,
  monthlyHardLimitMicros: null,
  maxRequestsPerReport: 20,
  maxRowsPerReport: 10_000,
}

function database(): Database.Database {
  const db = new Database(':memory:')
  db.exec(PROVIDER_SPEND_SCHEMA_SQL)
  db.exec(`
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
  return db
}

function response(page = 1) {
  return {
    status: 0,
    request_id: `request-${page}`,
    elapsed_ms: 125,
    credits_charged: 1,
    search_type: 'search',
    query: 'technical seo',
    page,
    organic: [
      {
        rank: 1,
        position: 1,
        title: 'Technical SEO',
        link: 'https://example.test/technical-seo',
        snippet: 'A result.',
      },
    ],
    ai_overview: { summary: 'Observed answer' },
  }
}

function request() {
  return {
    keyword: 'technical seo',
    countryCode: 'GB',
    languageCode: 'en',
    device: 'desktop' as const,
    page: 1,
    requestedRows: 10,
    context: {
      projectId: 'project-1',
      reportId: 'serp-results',
      reportRunId: 'run-1',
    },
  }
}

test('Search uses bounded POST input and records conservative cost evidence', async () => {
  const db = database()
  let requestedUrl = ''
  let headers: Record<string, string> = {}
  let body = ''
  const snapshot = await new SerpBaseClient({
    apiKey: 'secret-api-key',
    baseUrl: 'https://provider.invalid/',
    database: db,
    spendLimits: LIMITS,
    now: () => NOW,
    fetch: async (url, init) => {
      requestedUrl = String(url)
      headers = init?.headers as Record<string, string>
      body = String(init?.body)
      return new Response(JSON.stringify(response()))
    },
  }).search(request())

  assert.equal(requestedUrl, 'https://provider.invalid/google/search')
  assert.equal(headers['x-api-key'], 'secret-api-key')
  assert.equal(headers['x-serpbase-source'], 'seo')
  assert.deepEqual(JSON.parse(body), {
    q: 'technical seo',
    hl: 'en',
    gl: 'gb',
    page: 1,
    device: 'pc',
  })
  assert.equal(snapshot.cost.estimatedMicros, 500)
  assert.equal(snapshot.cost.actualMicros, null)
  assert.deepEqual(snapshot.cost.native, {
    unit: 'credit',
    estimatedUnits: 1,
    actualUnits: 1,
    remainingBefore: null,
  })
  const ledger = db
    .prepare(
      'SELECT state, estimated_cost_micros, actual_cost_micros FROM provider_spend_ledger',
    )
    .get() as Record<string, unknown>
  assert.deepEqual(ledger, {
    state: 'succeeded',
    estimated_cost_micros: SERPBASE_SEARCH_ESTIMATED_COST_MICROS,
    actual_cost_micros: null,
  })
  const cache = db
    .prepare('SELECT request_json, response_json FROM provider_cache')
    .get() as { request_json: string; response_json: string }
  assert.doesNotMatch(`${cache.request_json}${cache.response_json}`, /secret/)
})

test('Search reuses a credential-scoped cache without another charged request', async () => {
  const db = database()
  let calls = 0
  const client = new SerpBaseClient({
    apiKey: 'api-key',
    database: db,
    spendLimits: LIMITS,
    now: () => NOW,
    fetch: async () => {
      calls += 1
      return new Response(JSON.stringify(response()))
    },
  })
  await client.search(request())
  const cached = await client.search(request())

  assert.equal(calls, 1)
  assert.equal(cached.cache.status, 'hit')
  assert.equal(cached.cost.estimatedMicros, 0)
  assert.equal(cached.cost.actualMicros, 0)
})

test('Search caches each requested result page separately', async () => {
  const db = database()
  let calls = 0
  const client = new SerpBaseClient({
    apiKey: 'api-key',
    database: db,
    spendLimits: LIMITS,
    now: () => NOW,
    fetch: async (_url, init) => {
      calls += 1
      const page = (JSON.parse(String(init?.body)) as { page: number }).page
      return new Response(JSON.stringify(response(page)))
    },
  })

  await client.search(request())
  await client.search({ ...request(), page: 2 })
  const first = await client.search(request())
  const second = await client.search({ ...request(), page: 2 })

  assert.equal(calls, 2)
  assert.equal(first.response.page, 1)
  assert.equal(second.response.page, 2)
  assert.equal(first.cache.status, 'hit')
  assert.equal(second.cache.status, 'hit')
})

test('Search maps business errors and closes the spend reservation', async () => {
  const db = database()
  await assert.rejects(
    new SerpBaseClient({
      apiKey: 'api-key',
      database: db,
      spendLimits: LIMITS,
      now: () => NOW,
      fetch: async () =>
        new Response(
          JSON.stringify({
            status: 1029,
            error: 'rate limited',
            request_id: 'failed-request',
            elapsed_ms: 2,
            credits_charged: 0,
          }),
        ),
    }).search(request()),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'rate-limit')
      assert.equal(error.retryable, true)
      return true
    },
  )
  assert.deepEqual(
    db
      .prepare(
        'SELECT state, actual_cost_micros, returned_rows FROM provider_spend_ledger',
      )
      .get(),
    { state: 'failed', actual_cost_micros: 0, returned_rows: 0 },
  )
})

test('Search applies the local hard limit before network acquisition', async () => {
  let called = false
  await assert.rejects(
    new SerpBaseClient({
      apiKey: 'api-key',
      database: database(),
      spendLimits: { ...LIMITS, dailyHardLimitMicros: 499 },
      now: () => NOW,
      fetch: async () => {
        called = true
        return new Response(JSON.stringify(response()))
      },
    }).search(request()),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'budget-limit')
      return true
    },
  )
  assert.equal(called, false)
})

test('Search rejects a response for a different result page', async () => {
  const db = database()
  await assert.rejects(
    new SerpBaseClient({
      apiKey: 'api-key',
      database: db,
      spendLimits: LIMITS,
      now: () => NOW,
      fetch: async () => new Response(JSON.stringify(response())),
    }).search({ ...request(), page: 2 }),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'invalid-response')
      return true
    },
  )
  assert.deepEqual(
    db.prepare('SELECT state, returned_rows FROM provider_spend_ledger').get(),
    { state: 'failed', returned_rows: 0 },
  )
})
