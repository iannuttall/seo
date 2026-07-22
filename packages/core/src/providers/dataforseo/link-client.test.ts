import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import { DataForSeoClient } from './client.js'
import {
  database,
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

test('link client estimates cost, sends bounded requests and reuses local cache', async () => {
  const requests: Array<{ url: string; body: unknown }> = []
  const client = new DataForSeoClient({
    database: database(),
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    now: () => new Date('2026-07-22T08:00:00.000Z'),
    fetch: async (url, init) => {
      const value = String(url)
      if (value.endsWith('/appendix/user_data')) {
        return new Response(JSON.stringify(userDataFixture()))
      }
      requests.push({
        url: value,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      })
      if (value.endsWith('/summary/live')) {
        return new Response(
          JSON.stringify(
            paidResponse({
              id: 'summary-task',
              cost: 0.024036,
              result: [{ target: 'example.com', backlinks: 20 }],
            }),
          ),
        )
      }
      if (value.endsWith('/referring_domains/live')) {
        return new Response(
          JSON.stringify(
            paidResponse({
              id: 'domains-task',
              cost: 0.02436,
              result: [
                {
                  total_count: 20,
                  items_count: 1,
                  items: [{ domain: 'source.example', backlinks: 5 }],
                },
              ],
            }),
          ),
        )
      }
      return new Response(
        JSON.stringify(
          paidResponse({
            id: 'backlinks-task',
            cost: 0.0276,
            result: [
              {
                total_count: 20,
                items_count: 1,
                items: [
                  {
                    url_from: 'https://source.example/post',
                    url_to: 'https://example.com/page',
                  },
                ],
              },
            ],
          }),
        ),
      )
    },
  })
  const context = {
    reportId: 'link-evidence',
    reportRunId: 'run-1',
  }
  const summary = await client.linkSummary({
    target: 'example.com',
    scope: 'domain',
    includeSubdomains: true,
    context,
  })
  const backlinks = await client.backlinks({
    target: 'example.com',
    scope: 'domain',
    includeSubdomains: true,
    mode: 'one_per_domain',
    status: 'live',
    limit: 100,
    offset: 0,
    orderBy: ['rank,desc'],
    context,
  })
  assert.equal(summary.cost.estimatedMicros, 24_036)
  assert.equal(summary.cost.actualMicros, 24_036)
  assert.equal(backlinks.cost.estimatedMicros, 27_600)
  assert.equal(backlinks.cost.actualMicros, 27_600)
  assert.deepEqual(requests[0]?.body, [
    {
      target: 'example.com',
      include_subdomains: true,
      include_indirect_links: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: 'live',
      rank_scale: 'one_hundred',
    },
  ])
  assert.deepEqual(requests[1]?.body, [
    {
      target: 'example.com',
      include_subdomains: true,
      include_indirect_links: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: 'live',
      rank_scale: 'one_hundred',
      mode: 'one_per_domain',
      limit: 100,
      offset: 0,
      order_by: ['rank,desc'],
    },
  ])

  const domains = await client.referringDomains({
    target: 'example.com',
    scope: 'domain',
    includeSubdomains: true,
    limit: 10,
    offset: 0,
    orderBy: ['backlinks,desc'],
    context,
  })
  assert.equal(domains.cost.estimatedMicros, 24_360)
  assert.equal(domains.cost.actualMicros, 24_360)
  assert.deepEqual(requests[2]?.body, [
    {
      target: 'example.com',
      include_subdomains: true,
      include_indirect_links: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: 'live',
      rank_scale: 'one_hundred',
      limit: 10,
      offset: 0,
      order_by: ['backlinks,desc'],
    },
  ])

  const cached = await client.backlinks({
    target: 'example.com',
    scope: 'domain',
    includeSubdomains: true,
    mode: 'one_per_domain',
    status: 'live',
    limit: 100,
    offset: 0,
    orderBy: ['rank,desc'],
    context: { ...context, reportRunId: 'run-2' },
  })
  assert.equal(cached.cache.status, 'hit')
  assert.equal(cached.cost.actualMicros, 0)
  assert.equal(requests.length, 3)
})

test('link client blocks a paid request when account pricing is unavailable', async () => {
  const account = userDataFixture()
  const first = account.tasks[0]?.result?.[0]
  assert.ok(first)
  first.price = {}
  let calls = 0
  const client = new DataForSeoClient({
    database: database(),
    spendLimits: spendLimits(),
    credentials: () => ({ login: 'user', password: 'password' }),
    fetch: async () => {
      calls += 1
      return new Response(JSON.stringify(account))
    },
  })
  await assert.rejects(
    client.linkSummary({
      target: 'example.com',
      scope: 'domain',
      includeSubdomains: true,
      context: { reportId: 'link-evidence', reportRunId: 'run-1' },
    }),
    /pricing.*unavailable/,
  )
  assert.equal(calls, 1)
})
