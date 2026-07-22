import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import { ProviderError } from '../errors.js'
import {
  DataForSeoClient,
  type DataForSeoKeywordDiscoveryRequest,
} from './client.js'
import {
  database,
  firstAccount,
  firstTask,
  keywordDiscoveryFixture,
  keywordOverviewFixture,
  keywordRequest,
  serpFixture,
  spendLimits,
  userDataFixture,
} from './client-test-fixtures.js'

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
    domainResearchPrices: {
      domainOverview: { perRequestMicros: 12_000, perResultMicros: 120 },
      rankedKeywords: { perRequestMicros: 12_000, perResultMicros: 120 },
      rankingPages: { perRequestMicros: 12_000, perResultMicros: 120 },
      serpCompetitors: { perRequestMicros: 12_000, perResultMicros: 120 },
    },
    linkPrices: {
      summary: { perRequestMicros: 24_000, perResultMicros: 36 },
      backlinks: { perRequestMicros: 24_000, perResultMicros: 36 },
      referringDomains: { perRequestMicros: 24_000, perResultMicros: 36 },
    },
    aiMentionPrices: {
      targetMetrics: { perRequestMicros: 100_000, perResultMicros: 1_000 },
      multiTargetMetrics: {
        perRequestMicros: 100_000,
        perResultMicros: 1_000,
      },
      searchMentions: { perRequestMicros: 100_000, perResultMicros: 1_000 },
    },
    aiPromptObservationPrice: {
      perRequestMicros: 600,
      perResultMicros: 0,
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

test('domain research endpoints send bounded requests and record dynamic costs', async () => {
  const requests = new Map<string, unknown>()
  const paidResponse = (result: unknown) => ({
    status_code: 20000,
    status_message: 'Ok.',
    cost: 0.01212,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: 'domain-task-id',
        status_code: 20000,
        status_message: 'Ok.',
        cost: 0.01212,
        result_count: 1,
        result: [result],
      },
    ],
  })
  const client = new DataForSeoClient({
    database: database(),
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    now: () => new Date('2026-07-21T12:00:00.000Z'),
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith('/appendix/user_data')) {
        return new Response(JSON.stringify(userDataFixture()))
      }
      requests.set(path, JSON.parse(String(init?.body)))
      if (path.endsWith('/domain_rank_overview/live')) {
        return new Response(
          JSON.stringify(
            paidResponse({
              target: 'example.com',
              total_count: 1,
              items_count: 1,
              items: [{ metrics: { organic: {} } }],
            }),
          ),
        )
      }
      if (path.endsWith('/ranked_keywords/live')) {
        return new Response(
          JSON.stringify(
            paidResponse({
              target: 'example.com',
              total_count: 1,
              items_count: 1,
              items: [
                {
                  keyword_data: { keyword: 'blue widget' },
                  ranked_serp_element: {
                    serp_item: {
                      type: 'organic',
                      rank_group: 4,
                      rank_absolute: 4,
                      url: 'https://example.com/blue',
                    },
                  },
                },
              ],
            }),
          ),
        )
      }
      if (path.endsWith('/relevant_pages/live')) {
        return new Response(
          JSON.stringify(
            paidResponse({
              target: 'example.com',
              total_count: 1,
              items_count: 1,
              items: [{ page_address: 'https://example.com/blue' }],
            }),
          ),
        )
      }
      return new Response(
        JSON.stringify(
          paidResponse({
            seed_keywords: ['blue widget', 'red widget'],
            total_count: 1,
            items_count: 1,
            items: [{ domain: 'example.com', keywords_count: 2 }],
          }),
        ),
      )
    },
  })
  const context = { reportId: 'domain-overview', reportRunId: 'run-1' }
  const snapshots = await Promise.all([
    client.domainOverview({
      target: 'example.com',
      languageCode: 'en',
      locationCode: 2826,
      context,
    }),
    client.rankedKeywords({
      target: 'example.com',
      includeSubdomains: true,
      resultTypes: ['organic'],
      languageCode: 'en',
      locationCode: 2826,
      filters: [['keyword_data.keyword_info.search_volume', '>=', 10]],
      orderBy: ['keyword_data.keyword,asc'],
      limit: 25,
      offset: 5,
      context: { ...context, reportId: 'ranked-keywords' },
    }),
    client.rankingPages({
      target: 'example.com',
      languageCode: 'en',
      locationCode: 2826,
      filters: [['metrics.organic.etv', '>=', 1]],
      orderBy: ['page_address,asc'],
      limit: 20,
      offset: 0,
      context: { ...context, reportId: 'ranking-pages' },
    }),
    client.serpCompetitors({
      keywords: ['blue widget', 'red widget'],
      includeSubdomains: false,
      resultTypes: ['organic'],
      languageCode: 'en',
      locationCode: 2826,
      orderBy: ['domain,asc'],
      limit: 10,
      offset: 0,
      context: { ...context, reportId: 'serp-competitors' },
    }),
  ])

  assert.deepEqual(
    requests.get('/v3/dataforseo_labs/google/domain_rank_overview/live'),
    [{ target: 'example.com', language_code: 'en', location_code: 2826 }],
  )
  assert.deepEqual(
    requests.get('/v3/dataforseo_labs/google/ranked_keywords/live'),
    [
      {
        target: 'example.com',
        language_code: 'en',
        location_code: 2826,
        include_subdomains: true,
        item_types: ['organic'],
        limit: 25,
        offset: 5,
        order_by: ['keyword_data.keyword,asc'],
        filters: [['keyword_data.keyword_info.search_volume', '>=', 10]],
      },
    ],
  )
  assert.deepEqual(
    requests.get('/v3/dataforseo_labs/google/relevant_pages/live'),
    [
      {
        target: 'example.com',
        language_code: 'en',
        location_code: 2826,
        limit: 20,
        offset: 0,
        order_by: ['page_address,asc'],
        filters: [['metrics.organic.etv', '>=', 1]],
      },
    ],
  )
  assert.deepEqual(
    requests.get('/v3/dataforseo_labs/google/serp_competitors/live'),
    [
      {
        keywords: ['blue widget', 'red widget'],
        language_code: 'en',
        location_code: 2826,
        include_subdomains: false,
        item_types: ['organic'],
        limit: 10,
        offset: 0,
        order_by: ['domain,asc'],
      },
    ],
  )
  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.cost.estimatedMicros),
    [12_120, 15_000, 14_400, 13_200],
  )
  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.returnedRows),
    [1, 1, 1, 1],
  )
  assert.ok(
    snapshots.every((snapshot) => snapshot.cost.actualMicros === 12_120),
  )
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
