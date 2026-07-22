import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import { DataForSeoClient } from './client.js'
import {
  database,
  firstAccount,
  spendLimits,
  userDataFixture,
} from './client-test-fixtures.js'

function paidResponse(input: { id: string; cost: number; result: unknown[] }) {
  return {
    status_code: 20000,
    status_message: 'Ok.',
    cost: input.cost,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: input.id,
        status_code: 20000,
        status_message: 'Ok.',
        cost: input.cost,
        result_count: input.result.length,
        result: input.result,
      },
    ],
  }
}

test('AI mention client uses current endpoints, account pricing and local cache', async () => {
  const requests: Array<{ url: string; body: unknown }> = []
  const client = new DataForSeoClient({
    database: database(),
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    now: () => new Date('2026-07-22T10:00:00.000Z'),
    fetch: async (url, init) => {
      const value = String(url)
      if (value.endsWith('/appendix/user_data')) {
        return new Response(JSON.stringify(userDataFixture()))
      }
      requests.push({
        url: value,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      if (value.endsWith('/multi_target_metrics/live')) {
        return new Response(
          JSON.stringify(
            paidResponse({
              id: 'metrics-task',
              cost: 0.102,
              result: [
                {
                  total_count: 2,
                  items_count: 2,
                  aggregated_metrics: {
                    total: { mentions: 30, ai_search_volume: 300 },
                  },
                  items: [
                    { key: 'target', total: { mentions: 10 } },
                    { key: 'competitor-1', total: { mentions: 20 } },
                  ],
                },
              ],
            }),
          ),
        )
      }
      return new Response(
        JSON.stringify(
          paidResponse({
            id: 'samples-task',
            cost: 0.103,
            result: [
              {
                total_count: 20,
                items_count: 1,
                items: [{ question: 'example question', answer: 'answer' }],
              },
            ],
          }),
        ),
      )
    },
  })
  const context = { reportId: 'ai-mention-research', reportRunId: 'run-1' }
  const metrics = await client.aiMentionMetrics({
    target: { key: 'target', label: 'Target', aliases: ['Target'] },
    competitors: [
      {
        key: 'competitor-1',
        label: 'Competitor',
        aliases: ['Competitor'],
      },
    ],
    platform: 'google',
    languageCode: 'en',
    locationCode: 2840,
    context,
  })
  const samples = await client.aiMentionSearch({
    target: { key: 'target', label: 'Target', aliases: ['Target'] },
    platform: 'google',
    languageCode: 'en',
    locationCode: 2840,
    limit: 3,
    context,
  })
  assert.equal(metrics.cost.estimatedMicros, 102_000)
  assert.equal(metrics.cost.actualMicros, 102_000)
  assert.equal(samples.cost.estimatedMicros, 103_000)
  assert.equal(samples.cost.actualMicros, 103_000)
  assert.ok(requests[0]?.url.endsWith('/multi_target_metrics/live'))
  assert.deepEqual(requests[0]?.body, [
    {
      language_code: 'en',
      location_code: 2840,
      platform: 'google',
      targets: [
        {
          key: 'target',
          target: [
            {
              keyword: 'Target',
              match_type: 'word_match',
              search_scope: ['answer'],
              search_filter: 'include',
            },
          ],
        },
        {
          key: 'competitor-1',
          target: [
            {
              keyword: 'Competitor',
              match_type: 'word_match',
              search_scope: ['answer'],
              search_filter: 'include',
            },
          ],
        },
      ],
      order_by: ['total.mentions,desc'],
      limit: 2,
      internal_list_limit: 10,
    },
  ])
  assert.ok(requests[1]?.url.endsWith('/search_mentions/live'))
  assert.deepEqual(requests[1]?.body, [
    {
      language_code: 'en',
      location_code: 2840,
      platform: 'google',
      target: [
        {
          keyword: 'Target',
          match_type: 'word_match',
          search_scope: ['answer'],
          search_filter: 'include',
        },
      ],
      order_by: ['ai_search_volume,desc'],
      offset: 0,
      limit: 3,
    },
  ])

  const cached = await client.aiMentionMetrics({
    target: { key: 'target', label: 'Target', aliases: ['Target'] },
    competitors: [
      {
        key: 'competitor-1',
        label: 'Competitor',
        aliases: ['Competitor'],
      },
    ],
    platform: 'google',
    languageCode: 'en',
    locationCode: 2840,
    context: { ...context, reportRunId: 'run-2' },
  })
  assert.equal(cached.cache.status, 'hit')
  assert.equal(cached.cost.actualMicros, 0)
  assert.equal(requests.length, 2)
})

test('AI mention client blocks paid work when endpoint pricing is missing', async () => {
  const fixture = userDataFixture()
  const account = firstAccount(fixture)
  account.price = {}
  let calls = 0
  const client = new DataForSeoClient({
    database: database(),
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => {
      calls += 1
      return new Response(JSON.stringify(fixture))
    },
  })
  await assert.rejects(
    client.aiMentionMetrics({
      target: { key: 'target', label: 'Target', aliases: ['Target'] },
      competitors: [],
      platform: 'google',
      languageCode: 'en',
      locationCode: 2840,
      context: { reportId: 'ai-mention-research', reportRunId: 'run-1' },
    }),
    /pricing.*unavailable/,
  )
  assert.equal(calls, 1)
})

test('AI mention client enforces spend limits before a paid request', async () => {
  let paidCalls = 0
  const client = new DataForSeoClient({
    database: database(),
    spendLimits: spendLimits({ maxRowsPerReport: 1 }),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async (url) => {
      if (String(url).endsWith('/appendix/user_data')) {
        return new Response(JSON.stringify(userDataFixture()))
      }
      paidCalls += 1
      return new Response('{}')
    },
  })
  await assert.rejects(
    client.aiMentionMetrics({
      target: { key: 'target', label: 'Target', aliases: ['Target'] },
      competitors: [
        {
          key: 'competitor-1',
          label: 'Competitor',
          aliases: ['Competitor'],
        },
      ],
      platform: 'google',
      languageCode: 'en',
      locationCode: 2840,
      context: { reportId: 'ai-mention-research', reportRunId: 'run-1' },
    }),
    /row limit/i,
  )
  assert.equal(paidCalls, 0)
})

test('AI mention client preserves provider task diagnostics', async () => {
  const client = new DataForSeoClient({
    database: database(),
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async (url) => {
      if (String(url).endsWith('/appendix/user_data')) {
        return new Response(JSON.stringify(userDataFixture()))
      }
      return new Response(
        JSON.stringify({
          status_code: 20000,
          status_message: 'Ok.',
          cost: 0,
          tasks_count: 1,
          tasks_error: 1,
          tasks: [
            {
              id: 'failed-task',
              status_code: 40501,
              status_message: "Invalid Field: 'order_by'.",
              cost: 0,
              result_count: 0,
              result: null,
            },
          ],
        }),
      )
    },
  })
  await assert.rejects(
    client.aiMentionSearch({
      target: { key: 'target', label: 'Target', aliases: ['Target'] },
      platform: 'google',
      languageCode: 'en',
      locationCode: 2840,
      limit: 3,
      context: { reportId: 'ai-mention-research', reportRunId: 'run-1' },
    }),
    /40501: Invalid Field: 'order_by'/,
  )
})
