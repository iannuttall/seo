import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
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
