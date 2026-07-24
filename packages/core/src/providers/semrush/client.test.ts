import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Response } from 'undici'
import Database from '../../storage/sqlite.js'
import { ProviderError } from '../errors.js'
import { SemrushClient } from './client.js'

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

test('free balance request validates the key without exposing it', async () => {
  const apiKey = 'semrush-test-secret'
  const balance = await new SemrushClient({
    apiKey,
    balanceUrl: 'https://provider.invalid/balance',
    fetch: async (url) => {
      const parsed = new URL(url)
      assert.equal(parsed.searchParams.get('key'), apiKey)
      return new Response('1,234')
    },
  }).apiUnitBalance()

  assert.equal(balance.remainingUnits, 1_234)
  assert.match(balance.observedAt, /^\d{4}-\d{2}-\d{2}T/u)
  assert.doesNotMatch(JSON.stringify(balance), new RegExp(apiKey))
})

test('free balance request keeps provider error bodies private', async () => {
  const apiKey = 'semrush-test-secret'
  await assert.rejects(
    new SemrushClient({
      apiKey,
      fetch: async () =>
        new Response(`ERROR 120 :: WRONG KEY ${apiKey}`, { status: 200 }),
    }).apiUnitBalance(),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'authentication')
      assert.doesNotMatch(error.message, new RegExp(apiKey))
      return true
    },
  )
})

test('free balance request explains that Version 4 keys are unsupported', async () => {
  const apiKey = 'semrush-version-4-secret'
  await assert.rejects(
    new SemrushClient({
      apiKey,
      fetch: async () =>
        new Response(
          JSON.stringify({
            errors: [{ field: 'key', message: `invalid api key: ${apiKey}` }],
          }),
          { status: 400 },
        ),
    }).apiUnitBalance(),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'authentication')
      assert.match(error.message, /permanent Version 3 API Key/)
      assert.doesNotMatch(error.message, new RegExp(apiKey))
      return true
    },
  )
})

test('free balance request rejects malformed values and unsafe integers', async () => {
  for (const body of ['not-a-number', '999999999999999999999999']) {
    await assert.rejects(
      new SemrushClient({
        apiKey: 'semrush-test-secret',
        fetch: async () => new Response(body),
      }).apiUnitBalance(),
      (error) =>
        error instanceof ProviderError && error.code === 'invalid-response',
    )
  }
})

test('paid reports preflight units, parse CSV, and cache without the key', async () => {
  const database = cacheDatabase()
  const apiKey = 'semrush-paid-secret'
  let balanceCalls = 0
  let reportCalls = 0
  const client = new SemrushClient({
    apiKey,
    database,
    balanceUrl: 'https://provider.invalid/balance',
    baseUrl: 'https://provider.invalid/report',
    now: () => new Date('2026-07-24T12:00:00.000Z'),
    fetch: async (url) => {
      const parsed = new URL(url)
      assert.equal(parsed.searchParams.get('key'), apiKey)
      if (parsed.pathname === '/balance') {
        balanceCalls += 1
        return new Response('1000')
      }
      reportCalls += 1
      assert.equal(parsed.searchParams.get('type'), 'phrase_these')
      assert.equal(parsed.searchParams.get('export_columns'), 'Ph,Nq')
      return new Response('"Keyword";"Search Volume"\n"zero keyword";"0"\n')
    },
  })
  const request = {
    operation: 'keyword-metrics',
    reportType: 'phrase_these',
    parameters: {
      phrase: 'zero keyword',
      database: 'us',
    },
    columns: ['Ph', 'Nq'] as const,
    maximumResponseRows: 1,
    unitsPerLine: 10,
  }
  const first = await client.report(request)
  const cached = await client.report(request)

  assert.equal(balanceCalls, 1)
  assert.equal(reportCalls, 1)
  assert.equal(first.cost.native?.estimatedUnits, 10)
  assert.equal(first.cost.native?.actualUnits, 10)
  assert.equal(first.cost.actualMicros, null)
  assert.equal(cached.cache.status, 'hit')
  assert.equal(cached.cost.native?.actualUnits, 0)

  const stored = database
    .prepare(
      'SELECT credential_scope, request_json, response_json FROM provider_cache',
    )
    .get() as {
    credential_scope: string
    request_json: string
    response_json: string
  }
  assert.doesNotMatch(JSON.stringify(stored), new RegExp(apiKey))
  assert.equal('key' in JSON.parse(stored.request_json), false)
  database.close()
})

test('case-sensitive API keys never share cached Semrush data', async () => {
  const database = cacheDatabase()
  let reportCalls = 0
  const run = (apiKey: string) =>
    new SemrushClient({
      apiKey,
      database,
      balanceUrl: 'https://provider.invalid/balance',
      baseUrl: 'https://provider.invalid/report',
      fetch: async (url) => {
        if (new URL(url).pathname === '/balance') return new Response('1000')
        reportCalls += 1
        return new Response('Keyword\none')
      },
    }).report({
      operation: 'keyword-metrics',
      reportType: 'phrase_these',
      parameters: { phrase: 'one', database: 'us' },
      columns: ['Ph'],
      maximumResponseRows: 1,
      unitsPerLine: 10,
    })

  await run('CaseSensitiveKey')
  await run('casesensitivekey')
  assert.equal(reportCalls, 2)
  database.close()
})

test('paid reports stop before acquisition when the unit balance is too low', async () => {
  const database = cacheDatabase()
  let reportCalls = 0
  await assert.rejects(
    new SemrushClient({
      apiKey: 'semrush-test-secret',
      database,
      balanceUrl: 'https://provider.invalid/balance',
      baseUrl: 'https://provider.invalid/report',
      fetch: async (url) => {
        if (new URL(url).pathname === '/balance') return new Response('9')
        reportCalls += 1
        return new Response('Keyword\nunexpected')
      },
    }).report({
      operation: 'keyword-metrics',
      reportType: 'phrase_these',
      parameters: { phrase: 'one', database: 'us' },
      columns: ['Ph'],
      maximumResponseRows: 1,
      unitsPerLine: 10,
    }),
    (error) => error instanceof ProviderError && error.code === 'budget-limit',
  )
  assert.equal(reportCalls, 0)
  database.close()
})

test('paid reports distinguish empty results and redact provider errors', async () => {
  const database = cacheDatabase()
  const run = (body: string) =>
    new SemrushClient({
      apiKey: 'semrush-test-secret',
      database,
      balanceUrl: 'https://provider.invalid/balance',
      baseUrl: 'https://provider.invalid/report',
      fetch: async (url) =>
        new URL(url).pathname === '/balance'
          ? new Response('1000')
          : new Response(body),
    }).report({
      operation: 'keyword-metrics',
      reportType: 'phrase_these',
      parameters: { phrase: 'one', database: 'us' },
      columns: ['Ph'],
      maximumResponseRows: 1,
      unitsPerLine: 10,
      refresh: true,
    })

  assert.deepEqual((await run('ERROR :: 50 :: NOTHING FOUND')).table, {
    headers: ['Ph'],
    rows: [],
  })
  await assert.rejects(
    run('ERROR :: 120 :: WRONG KEY semrush-test-secret'),
    (error) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'authentication')
      assert.doesNotMatch(error.message, /semrush-test-secret/u)
      assert.equal(error.cause, undefined)
      return true
    },
  )
  database.close()
})

test('paid reports reject malformed, over-limit, and unexpected CSV columns', async () => {
  for (const body of ['Keyword\none\ntwo', '"Keyword\none']) {
    const database = cacheDatabase()
    await assert.rejects(
      new SemrushClient({
        apiKey: 'semrush-test-secret',
        database,
        balanceUrl: 'https://provider.invalid/balance',
        baseUrl: 'https://provider.invalid/report',
        fetch: async (url) =>
          new URL(url).pathname === '/balance'
            ? new Response('1000')
            : new Response(body),
      }).report({
        operation: 'keyword-metrics',
        reportType: 'phrase_these',
        parameters: { phrase: 'one', database: 'us' },
        columns: ['Ph'],
        maximumResponseRows: 1,
        unitsPerLine: 10,
        refresh: true,
      }),
      (error) =>
        error instanceof ProviderError && error.code === 'invalid-response',
    )
    database.close()
  }
})
