import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import { ProviderError } from './errors.js'
import { DataForSeoProvider } from './dataforseo.js'

type FixtureItem = {
  keyword: string
  keyword_info: {
    search_volume: number | null
    cpc: number | null
    competition: number | null
  }
  keyword_properties: { keyword_difficulty: number | null }
  serp_info: { se_results_count: string | number | null }
  search_intent_info: {
    main_intent:
      | 'informational'
      | 'navigational'
      | 'commercial'
      | 'transactional'
      | null
  }
}

type FixtureTask = {
  id?: string
  status_code: number
  status_message: string
  cost?: number
  result_count?: number
  result: Array<{ items_count: number; items: FixtureItem[] }> | null
}

type Fixture = {
  status_code: number
  status_message: string
  cost: number
  tasks_count: number
  tasks_error: number
  tasks: FixtureTask[]
}

function responseFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    status_code: 20000,
    status_message: 'Ok.',
    cost: 0.0201,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: 'task-id',
        status_code: 20000,
        status_message: 'Ok.',
        cost: 0.0201,
        result_count: 1,
        result: [
          {
            items_count: 1,
            items: [
              {
                keyword: 'zero query',
                keyword_info: {
                  search_volume: 0,
                  cpc: 0,
                  competition: 0,
                },
                keyword_properties: { keyword_difficulty: 0 },
                serp_info: { se_results_count: '0' },
                search_intent_info: { main_intent: 'informational' },
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

test('DataForSEO sends the documented request and maps nested zero metrics', async () => {
  let requestBody: unknown
  let authorization: string | null = null
  const provider = new DataForSeoProvider({
    credentials: () => ({ login: 'local-user', password: 'local-password' }),
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body))
      authorization = (init?.headers as Record<string, string> | undefined)
        ?.authorization ?? null
      return new Response(JSON.stringify(responseFixture()))
    },
  })

  const result = await provider.keywordOverview('zero query')

  assert.deepEqual(requestBody, [
    {
      keywords: ['zero query'],
      language_code: 'en',
      location_code: 2840,
    },
  ])
  assert.equal(
    authorization,
    `Basic ${Buffer.from('local-user:local-password').toString('base64')}`,
  )
  assert.deepEqual(result.data, {
    phrase: 'zero query',
    volume: 0,
    competition: 0,
    cpc: 0,
    difficulty: 0,
    intent: 'informational',
    results: 0,
  })
  assert.equal(result.usage.estimatedUsd, 0.0201)
})

test('DataForSEO keeps documented null metrics unavailable', async () => {
  const fixture = responseFixture()
  const item = fixture.tasks[0]?.result?.[0]?.items?.[0]
  assert.ok(item)
  item.keyword_info = {
    search_volume: null,
    cpc: null,
    competition: null,
  }
  item.keyword_properties = { keyword_difficulty: null }
  item.serp_info = { se_results_count: null }
  item.search_intent_info = { main_intent: null }

  const provider = new DataForSeoProvider({
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => new Response(JSON.stringify(fixture)),
  })
  assert.deepEqual((await provider.keywordOverview('query')).data, {
    phrase: 'zero query',
    volume: undefined,
    competition: undefined,
    cpc: undefined,
    difficulty: undefined,
    intent: undefined,
    results: undefined,
  })
})

test('DataForSEO rejects malformed payloads and task failures', async () => {
  const malformed = new DataForSeoProvider({
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => new Response('{"status_code":"wrong"}'),
  })
  await assert.rejects(
    malformed.keywordOverview('query'),
    (error) =>
      error instanceof ProviderError && error.code === 'invalid-response',
  )

  const failed = new DataForSeoProvider({
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () =>
      new Response(
        JSON.stringify(
          responseFixture({
            tasks_error: 1,
            tasks: [
              {
                status_code: 40501,
                status_message: 'Task failed.',
                result: null,
              },
            ],
          }),
        ),
      ),
  })
  await assert.rejects(
    failed.keywordOverview('query'),
    (error) => error instanceof ProviderError && error.code === 'remote-error',
  )
})

test('DataForSEO reports missing credentials without making a request', async () => {
  let called = false
  const provider = new DataForSeoProvider({
    credentials: () => undefined,
    fetch: async () => {
      called = true
      return new Response('{}')
    },
  })
  await assert.rejects(
    provider.keywordOverview('query'),
    (error) => error instanceof ProviderError && error.code === 'configuration',
  )
  assert.equal(called, false)
})
