import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import { PROVIDER_SPEND_SCHEMA_SQL } from '../../storage/provider-spend-schema.js'
import Database from '../../storage/sqlite.js'
import type { ProviderSpendLimits } from '../cost-limits.js'
import { ProviderError } from '../errors.js'
import {
  DataForSeoClient,
  type DataForSeoKeywordDiscoveryRequest,
} from './client.js'

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
                keyword_ideas: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_result', cost: 0.00012 },
                      { cost_type: 'per_request', cost: 0.012 },
                    ],
                  },
                },
                keyword_suggestions: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_result', cost: 0.00012 },
                      { cost_type: 'per_request', cost: 0.012 },
                    ],
                  },
                },
                related_keywords: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_result', cost: 0.00012 },
                      { cost_type: 'per_request', cost: 0.012 },
                    ],
                  },
                },
              },
              serp: {
                task_post: {
                  priority_normal: [{ cost_type: 'per_request', cost: 0.0006 }],
                },
                live: {
                  advanced: {
                    priority_normal: [
                      { cost_type: 'per_request', cost: 0.002 },
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
  input: {
    statusCode?: number
    tasksError?: number
    cost?: number
    items?: unknown[] | null
  } = {},
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
                  items_count: input.items === null ? 0 : 2,
                  items:
                    input.items === undefined
                      ? [
                          { keyword: 'first query' },
                          { keyword: 'second query' },
                        ]
                      : input.items,
                },
              ]
            : null,
      },
    ],
  }
}

function keywordDiscoveryFixture() {
  return {
    status_code: 20000,
    status_message: 'Ok.',
    cost: 0.01236,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: 'discovery-task-id',
        status_code: 20000,
        status_message: 'Ok.',
        cost: 0.01236,
        result_count: 1,
        result: [
          {
            seed_keywords: ['first query', 'second query'],
            total_count: 300,
            items_count: 3,
            offset_token: 'next-page-token',
            items: [
              { keyword: 'first idea' },
              { keyword: 'second idea' },
              { keyword: 'third idea' },
            ],
          },
        ],
      },
    ],
  }
}

function serpFixture() {
  return {
    status_code: 20000,
    status_message: 'Ok.',
    cost: 0.004,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: 'serp-task-id',
        status_code: 20000,
        status_message: 'Ok.',
        cost: 0.004,
        result_count: 1,
        result: [
          {
            keyword: 'first query',
            datetime: '2026-07-21 12:00:00 +00:00',
            items_count: 2,
            items: [
              {
                type: 'organic',
                rank_group: 1,
                rank_absolute: 1,
                page: 1,
                domain: 'example.test',
                url: 'https://example.test/page',
              },
              { type: 'people_also_ask', rank_absolute: 2, page: 1 },
            ],
          },
        ],
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
    keywordDiscoveryPrices: {
      ideas: { perRequestMicros: 12_000, perResultMicros: 120 },
      related: { perRequestMicros: 12_000, perResultMicros: 120 },
      suggestions: { perRequestMicros: 12_000, perResultMicros: 120 },
    },
    serpLiveAdvancedPrice: {
      perRequestMicros: 2_000,
      perResultMicros: 0,
    },
    serpTaskPostPrice: {
      perRequestMicros: 600,
      perResultMicros: 0,
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

test('keyword overview accepts a named location and requests SERP evidence', async () => {
  let paidBody: unknown
  const client = new DataForSeoClient({
    database: database(),
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async (url, init) => {
      if (String(url).includes('/appendix/user_data')) {
        return new Response(JSON.stringify(userDataFixture()))
      }
      paidBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(keywordOverviewFixture()))
    },
  })

  await client.keywordOverview(
    keywordRequest({
      locationCode: undefined,
      locationName: 'United Kingdom',
      includeSerpInfo: true,
    }),
  )
  assert.deepEqual(paidBody, [
    {
      keywords: ['first query', 'second query'],
      language_code: 'en',
      location_name: 'United Kingdom',
      include_serp_info: true,
    },
  ])
})

test('keyword overview accepts bounded extended monthly histories', async () => {
  const monthlySearches = Array.from({ length: 36 }, (_, index) => ({
    year: 2023 + Math.floor(index / 12),
    month: (index % 12) + 1,
    search_volume: index,
  }))
  const client = new DataForSeoClient({
    database: database(),
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async (url) =>
      new Response(
        JSON.stringify(
          String(url).includes('/appendix/user_data')
            ? userDataFixture()
            : keywordOverviewFixture({
                items: [
                  {
                    keyword: 'first query',
                    keyword_info: { monthly_searches: monthlySearches },
                  },
                ],
              }),
        ),
      ),
  })

  const result = await client.keywordOverview(
    keywordRequest({ keywords: ['first query'] }),
  )
  const rows =
    result.response.tasks[0]?.result?.[0]?.items?.[0]?.keyword_info
      ?.monthly_searches
  assert.equal(rows?.length, 36)
})

test('keyword overview accepts a successful empty result with null items', async () => {
  const db = database()
  const client = new DataForSeoClient({
    database: db,
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async (url) =>
      new Response(
        JSON.stringify(
          String(url).includes('/appendix/user_data')
            ? userDataFixture()
            : keywordOverviewFixture({ items: null, cost: 0.01 }),
        ),
      ),
  })

  const result = await client.keywordOverview(
    keywordRequest({ keywords: ['no provider row'] }),
  )

  assert.equal(result.returnedRows, 0)
  assert.equal(result.response.tasks[0]?.result?.[0]?.items, null)
  assert.equal(result.cost.actualMicros, 10_000)
  const ledger = db
    .prepare('SELECT state FROM provider_spend_ledger')
    .get() as { state: string }
  assert.equal(ledger.state, 'succeeded')
})

test('keyword discovery estimates cost and preserves pagination evidence', async () => {
  const db = database()
  let calls = 0
  let requestedUrl = ''
  let requestBody: unknown
  const client = new DataForSeoClient({
    database: db,
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    now: () => new Date('2026-07-21T12:00:00.000Z'),
    fetch: async (url, init) => {
      calls += 1
      if (String(url).includes('/appendix/user_data')) {
        return new Response(JSON.stringify(userDataFixture()))
      }
      requestedUrl = String(url)
      requestBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(keywordDiscoveryFixture()))
    },
  })

  const request: DataForSeoKeywordDiscoveryRequest = {
    source: 'ideas',
    seeds: ['first query', 'second query'],
    languageCode: 'en',
    locationCode: 2840,
    limit: 3,
    context: { reportId: 'keyword-research', reportRunId: 'run-1' },
  }
  const result = await client.keywordDiscovery(request)

  assert.equal(
    requestedUrl,
    'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live',
  )
  assert.deepEqual(requestBody, [
    {
      keywords: ['first query', 'second query'],
      language_code: 'en',
      location_code: 2840,
      include_serp_info: true,
      limit: 3,
    },
  ])
  assert.equal(result.returnedRows, 3)
  assert.equal(result.providerTotalRows, 300)
  assert.equal(result.nextCursor, 'next-page-token')
  assert.equal(result.cost.estimatedMicros, 12_360)
  assert.equal(result.cost.actualMicros, 12_360)
  assert.equal(calls, 2)

  const cached = await client.keywordDiscovery(request)
  assert.equal(cached.cache.status, 'hit')
  assert.equal(cached.cost.estimatedMicros, 0)
  assert.equal(cached.cost.actualMicros, 0)
  assert.equal(calls, 2)

  const ledger = db
    .prepare('SELECT * FROM provider_spend_ledger')
    .all() as Array<Record<string, unknown>>
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0]?.state, 'succeeded')
  assert.equal(ledger[0]?.estimated_cost_micros, 12_360)
  assert.equal(ledger[0]?.actual_cost_micros, 12_360)
})

test('live SERP estimates each ten-result billing unit', async () => {
  const db = database()
  let requestBody: unknown
  const client = new DataForSeoClient({
    database: db,
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async (url, init) => {
      if (String(url).includes('/appendix/user_data')) {
        return new Response(JSON.stringify(userDataFixture()))
      }
      requestBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(serpFixture()))
    },
  })

  const result = await client.serpLive({
    keyword: 'first query',
    languageCode: 'en',
    locationName: 'United States',
    device: 'mobile',
    depth: 20,
    context: { reportId: 'serp-results', reportRunId: 'run-1' },
  })

  assert.deepEqual(requestBody, [
    {
      keyword: 'first query',
      language_code: 'en',
      location_name: 'United States',
      device: 'mobile',
      depth: 20,
      remove_from_url: ['srsltid'],
    },
  ])
  assert.equal(result.returnedRows, 2)
  assert.equal(result.cost.estimatedMicros, 4_000)
  assert.equal(result.cost.actualMicros, 4_000)
})

test('live SERP rejects multiplied-price operators before acquisition', async () => {
  let calls = 0
  const client = new DataForSeoClient({
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => {
      calls += 1
      return new Response('{}')
    },
  })

  await assert.rejects(
    client.serpLive({
      keyword: 'site:example.test query',
      languageCode: 'en',
      locationCode: 2840,
      device: 'desktop',
      depth: 10,
      context: { reportId: 'serp-results', reportRunId: 'run-1' },
    }),
    /multiplied provider pricing/,
  )
  assert.equal(calls, 0)
})

test('queued SERP posts bounded tasks and maps reordered receipts by tag', async () => {
  const db = database()
  let requestBody: unknown
  const client = new DataForSeoClient({
    database: db,
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async (url, init) => {
      if (String(url).includes('/appendix/user_data')) {
        return new Response(JSON.stringify(userDataFixture()))
      }
      requestBody = JSON.parse(String(init?.body))
      return new Response(
        JSON.stringify({
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0.0024,
          tasks_count: 2,
          tasks_error: 0,
          tasks: [
            {
              id: 'remote-2',
              status_code: 20100,
              status_message: 'Task Created.',
              cost: 0.0012,
              result_count: 0,
              data: { tag: 'local-2' },
            },
            {
              id: 'remote-1',
              status_code: 20100,
              status_message: 'Task Created.',
              cost: 0.0012,
              result_count: 0,
              data: { tag: 'local-1' },
            },
          ],
        }),
      )
    },
  })

  const result = await client.serpTaskPost({
    tasks: [
      {
        tag: 'local-1',
        keyword: 'first query',
        languageCode: 'en',
        locationCode: 2826,
        device: 'desktop',
        depth: 20,
      },
      {
        tag: 'local-2',
        keyword: 'second query',
        languageCode: 'en',
        locationCode: 2826,
        device: 'mobile',
        depth: 20,
      },
    ],
    context: {
      projectId: 'project-1',
      reportId: 'rank-tracking',
      reportRunId: 'run-1',
    },
  })

  assert.deepEqual(requestBody, [
    {
      keyword: 'first query',
      language_code: 'en',
      location_code: 2826,
      device: 'desktop',
      depth: 20,
      tag: 'local-1',
      priority: 1,
      remove_from_url: ['srsltid'],
    },
    {
      keyword: 'second query',
      language_code: 'en',
      location_code: 2826,
      device: 'mobile',
      depth: 20,
      tag: 'local-2',
      priority: 1,
      remove_from_url: ['srsltid'],
    },
  ])
  assert.deepEqual(result.taskIds, ['remote-2', 'remote-1'])
  assert.deepEqual(result.taskReceipts, [
    { providerTaskId: 'remote-2', tag: 'local-2' },
    { providerTaskId: 'remote-1', tag: 'local-1' },
  ])
  assert.equal(result.estimatedCostMicros, 2_400)
  assert.equal(result.actualCostMicros, 2_400)
  const ledger = db
    .prepare('SELECT * FROM provider_spend_ledger')
    .all() as Array<Record<string, unknown>>
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0]?.endpoint, 'v3/serp/google/organic/task_post')
  assert.equal(ledger[0]?.state, 'succeeded')
})

test('queued SERP lists ready tags and collects advanced results for free', async () => {
  const urls: string[] = []
  const client = new DataForSeoClient({
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async (url) => {
      urls.push(String(url))
      if (String(url).endsWith('/tasks_ready')) {
        return new Response(
          JSON.stringify({
            status_code: 20000,
            status_message: 'Ok.',
            cost: 0,
            tasks_count: 1,
            tasks_error: 0,
            tasks: [
              {
                id: 'ready-list',
                status_code: 20000,
                status_message: 'Ok.',
                cost: 0,
                result: [
                  {
                    id: 'remote-1',
                    tag: 'local-1',
                    se: 'google',
                    se_type: 'organic',
                    endpoint_advanced:
                      '/v3/serp/google/organic/task_get/advanced/remote-1',
                  },
                ],
              },
            ],
          }),
        )
      }
      const fixture = serpFixture()
      fixture.cost = 0
      const [task] = fixture.tasks
      assert.ok(task)
      task.id = 'remote-1'
      task.cost = 0
      return new Response(JSON.stringify(fixture))
    },
  })

  assert.deepEqual(await client.serpTasksReady(), [
    { providerTaskId: 'remote-1', tag: 'local-1' },
  ])
  const result = await client.serpTaskGet('remote-1')
  assert.equal(result.returnedRows, 2)
  assert.equal(result.cost.actualMicros, 0)
  assert.deepEqual(result.cost.taskIds, ['remote-1'])
  assert.deepEqual(urls, [
    'https://api.dataforseo.com/v3/serp/google/organic/tasks_ready',
    'https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced/remote-1',
  ])
})

test('keyword overview rejects invalid keyword and location bounds before acquisition', async () => {
  let calls = 0
  const client = new DataForSeoClient({
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => {
      calls += 1
      return new Response('{}')
    },
  })

  await assert.rejects(
    client.keywordOverview(
      keywordRequest({
        keywords: ['one two three four five six seven eight nine ten eleven'],
      }),
    ),
    /at most 80 characters and 10 words/,
  )
  await assert.rejects(
    client.keywordOverview(keywordRequest({ locationName: 'United States' })),
    /exactly one location code or location name/,
  )
  await assert.rejects(
    client.keywordOverview(
      keywordRequest({ locationCode: undefined, locationName: undefined }),
    ),
    /exactly one location code or location name/,
  )
  assert.equal(calls, 0)
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
