import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import { PROVIDER_SPEND_SCHEMA_SQL } from '../../storage/provider-spend-schema.js'
import Database from '../../storage/sqlite.js'
import type { ProviderSpendLimits } from '../cost-limits.js'
import { ProviderError } from '../errors.js'
import { DataForSeoClient } from './client.js'

type UserDataAccountFixture = {
  login: string
  timezone: string
  rates: unknown
  money: {
    total?: number
    balance?: number
    limits?: unknown
    statistics?: unknown
  }
  price: unknown
  backlinks_subscription_expiry_date: string | null
  llm_mentions_subscription_expiry_date: string | null
}

type UserDataTaskFixture = {
  id: string
  status_code: number
  status_message: string
  cost: number
  result_count: number
  result: UserDataAccountFixture[]
}

type UserDataFixture = {
  version: string
  status_code: number
  status_message: string
  time: string
  cost: number
  tasks_count: number
  tasks_error: number
  tasks: UserDataTaskFixture[]
}

function userDataFixture(): UserDataFixture {
  return {
    version: '0.1.test',
    status_code: 20000,
    status_message: 'Ok.',
    time: '0.1 sec.',
    cost: 0,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: 'account-task-id',
        status_code: 20000,
        status_message: 'Ok.',
        cost: 0,
        result_count: 1,
        result: [
          {
            login: 'api-owner@example.test',
            timezone: 'Europe/London',
            rates: { limits: { minute: { total: 2000 } } },
            money: {
              total: 25.5,
              balance: 7.125001,
              limits: { day: { total: 5 } },
              statistics: {
                day: { total: 0.557935, value: '2026-07-21' },
              },
            },
            price: {
              dataforseo_labs: {
                keyword_overview: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_result', cost: 0.0001 },
                      { cost_type: 'per_request', cost: 0.01 },
                    ],
                  },
                },
              },
            },
            backlinks_subscription_expiry_date: null,
            llm_mentions_subscription_expiry_date: '2026-08-01 00:00:00 +00:00',
          },
        ],
      },
    ],
  }
}

function firstTask(fixture: UserDataFixture): UserDataTaskFixture {
  const task = fixture.tasks[0]
  assert.ok(task)
  return task
}

function firstAccount(fixture: UserDataFixture): UserDataAccountFixture {
  const account = firstTask(fixture).result[0]
  assert.ok(account)
  return account
}

function database(): Database.Database {
  const db = new Database(':memory:')
  db.exec(PROVIDER_SPEND_SCHEMA_SQL)
  db.exec(`
    CREATE TABLE provider_cache (
      provider TEXT NOT NULL, credential_scope TEXT NOT NULL,
      operation TEXT NOT NULL, request_hash TEXT NOT NULL,
      request_json TEXT NOT NULL, response_json TEXT NOT NULL,
      row_count INTEGER, source_cost_micros INTEGER,
      task_ids_json TEXT NOT NULL, fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY(provider, credential_scope, operation, request_hash)
    ) WITHOUT ROWID;
  `)
  return db
}

function spendLimits(
  overrides: Partial<ProviderSpendLimits> = {},
): ProviderSpendLimits {
  return {
    dailyNoticeMicros: 5_000_000,
    dailyHardLimitMicros: null,
    monthlyHardLimitMicros: null,
    maxRequestsPerReport: 20,
    maxRowsPerReport: 10_000,
    ...overrides,
  }
}

function keywordOverviewFixture(
  input: { statusCode?: number; tasksError?: number; cost?: number } = {},
) {
  const statusCode = input.statusCode ?? 20000
  return {
    status_code: 20000,
    status_message: 'Ok.',
    cost: input.cost ?? 0.0202,
    tasks_count: 1,
    tasks_error: input.tasksError ?? 0,
    tasks: [
      {
        id: 'keyword-task-id',
        status_code: statusCode,
        status_message: statusCode === 20000 ? 'Ok.' : 'Task failed.',
        cost: input.cost ?? 0.0202,
        result_count: statusCode === 20000 ? 1 : 0,
        result:
          statusCode === 20000
            ? [
                {
                  items_count: 2,
                  items: [
                    { keyword: 'first query' },
                    { keyword: 'second query' },
                  ],
                },
              ]
            : null,
      },
    ],
  }
}

function keywordRequest(
  overrides: Partial<Parameters<DataForSeoClient['keywordOverview']>[0]> = {},
) {
  return {
    keywords: ['first query', 'second query'],
    languageCode: 'en',
    locationCode: 2840,
    reportId: 'keyword-metrics',
    reportRunId: 'run-1',
    ...overrides,
  }
}

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
    accountDailySpendMicros: 557_935,
    accountDailySpendPeriod: '2026-07-21',
    accountDailyLimitMicros: 5_000_000,
    keywordOverviewPrice: {
      perRequestMicros: 10_000,
      perResultMicros: 100,
    },
    backlinksSubscriptionExpiresAt: null,
    aiMentionsSubscriptionExpiresAt: '2026-08-01 00:00:00 +00:00',
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

test('user data accepts a provider-reported negative balance', async () => {
  const fixture = userDataFixture()
  firstAccount(fixture).money.balance = -3.25
  const client = new DataForSeoClient({
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => new Response(JSON.stringify(fixture)),
  })

  assert.equal((await client.userData()).balanceMicros, -3_250_000)
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
    assert.match(error.message, /seo providers dataforseo connect/)
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
    assert.match(error.message, /API login or API password/)
    assert.doesNotMatch(error.message, /wrong/)
    return true
  })
})

test('user data validates provider status and account rows', async () => {
  const failedFixture = userDataFixture()
  failedFixture.tasks_error = 1
  const failedTask = firstTask(failedFixture)
  failedTask.status_code = 40202
  failedTask.status_message = 'Rate limit exceeded.'
  failedTask.result = []
  const limited = new DataForSeoClient({
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => new Response(JSON.stringify(failedFixture)),
  })
  await assert.rejects(
    limited.userData(),
    (error) =>
      error instanceof ProviderError &&
      error.code === 'rate-limit' &&
      error.retryable,
  )

  const emptyFixture = userDataFixture()
  firstTask(emptyFixture).result = []
  const empty = new DataForSeoClient({
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => new Response(JSON.stringify(emptyFixture)),
  })
  await assert.rejects(
    empty.userData(),
    (error) =>
      error instanceof ProviderError && error.code === 'invalid-response',
  )
})

test('keyword overview reserves estimated spend, records actual cost, and caches safely', async () => {
  const db = database()
  const urls: string[] = []
  let paidBody: unknown
  const client = new DataForSeoClient({
    database: db,
    spendLimits: spendLimits(),
    credentials: () => ({
      login: 'api-owner@example.test',
      password: 'do-not-store-this-password',
    }),
    now: () => new Date('2026-07-21T08:00:00.000Z'),
    fetch: async (url, init) => {
      urls.push(String(url))
      if (String(url).includes('/appendix/user_data')) {
        return new Response(JSON.stringify(userDataFixture()))
      }
      paidBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(keywordOverviewFixture()))
    },
  })

  const first = await client.keywordOverview(keywordRequest())
  assert.equal(first.cache.status, 'miss')
  assert.equal(first.returnedRows, 2)
  assert.deepEqual(first.cost, {
    currency: 'USD',
    estimatedMicros: 10_200,
    actualMicros: 20_200,
    taskIds: ['keyword-task-id'],
  })
  assert.deepEqual(paidBody, [
    {
      keywords: ['first query', 'second query'],
      language_code: 'en',
      location_code: 2840,
    },
  ])
  assert.equal(urls.length, 2)

  const second = await client.keywordOverview(keywordRequest())
  assert.equal(second.cache.status, 'hit')
  assert.equal(second.cost.actualMicros, 0)
  assert.equal(urls.length, 2)

  const ledger = db
    .prepare('SELECT * FROM provider_spend_ledger')
    .all() as Array<Record<string, unknown>>
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0]?.state, 'succeeded')
  assert.equal(ledger[0]?.estimated_cost_micros, 10_200)
  assert.equal(ledger[0]?.actual_cost_micros, 20_200)

  const cache = db.prepare('SELECT * FROM provider_cache').get() as Record<
    string,
    unknown
  >
  assert.equal(
    JSON.stringify(cache).includes('do-not-store-this-password'),
    false,
  )
  assert.equal(String(cache.credential_scope).length, 64)
})

test('keyword overview blocks paid acquisition when pricing or budget evidence is unsafe', async () => {
  const missingPrice = userDataFixture()
  firstAccount(missingPrice).price = {}
  let missingPriceCalls = 0
  const missingPriceClient = new DataForSeoClient({
    database: database(),
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => {
      missingPriceCalls += 1
      return new Response(JSON.stringify(missingPrice))
    },
  })
  await assert.rejects(
    missingPriceClient.keywordOverview(keywordRequest()),
    (error) =>
      error instanceof ProviderError && error.code === 'invalid-response',
  )
  assert.equal(missingPriceCalls, 1)

  let budgetCalls = 0
  const budgetClient = new DataForSeoClient({
    database: database(),
    spendLimits: spendLimits({ dailyHardLimitMicros: 10_199 }),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => {
      budgetCalls += 1
      return new Response(JSON.stringify(userDataFixture()))
    },
  })
  await assert.rejects(
    budgetClient.keywordOverview(keywordRequest()),
    (error) => error instanceof ProviderError && error.code === 'budget-limit',
  )
  assert.equal(budgetCalls, 1)
})

test('keyword overview records charged task failures without retrying', async () => {
  const db = database()
  let calls = 0
  const client = new DataForSeoClient({
    database: db,
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async (url) => {
      calls += 1
      return new Response(
        JSON.stringify(
          String(url).includes('/appendix/user_data')
            ? userDataFixture()
            : keywordOverviewFixture({
                statusCode: 40501,
                tasksError: 1,
                cost: 0.002,
              }),
        ),
      )
    },
  })

  await assert.rejects(
    client.keywordOverview(keywordRequest()),
    (error) => error instanceof ProviderError && error.code === 'remote-error',
  )
  assert.equal(calls, 2)
  const ledger = db
    .prepare('SELECT * FROM provider_spend_ledger')
    .get() as Record<string, unknown>
  assert.equal(ledger.state, 'failed')
  assert.equal(ledger.actual_cost_micros, 2_000)
  assert.equal(ledger.task_ids_json, '["keyword-task-id"]')
})

test('keyword overview keeps an unknown estimate after an invalid paid response', async () => {
  const db = database()
  let calls = 0
  const client = new DataForSeoClient({
    database: db,
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async (url) => {
      calls += 1
      return String(url).includes('/appendix/user_data')
        ? new Response(JSON.stringify(userDataFixture()))
        : new Response('{"invalid":true}')
    },
  })

  await assert.rejects(
    client.keywordOverview(keywordRequest()),
    (error) =>
      error instanceof ProviderError && error.code === 'invalid-response',
  )
  assert.equal(calls, 2)
  const ledger = db
    .prepare('SELECT * FROM provider_spend_ledger')
    .get() as Record<string, unknown>
  assert.equal(ledger.state, 'failed')
  assert.equal(ledger.actual_cost_micros, null)
  assert.equal(ledger.estimated_cost_micros, 10_200)
})
