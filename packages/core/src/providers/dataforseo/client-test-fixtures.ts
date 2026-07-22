import assert from 'node:assert/strict'
import { PROVIDER_SPEND_SCHEMA_SQL } from '../../storage/provider-spend-schema.js'
import Database from '../../storage/sqlite.js'
import type { ProviderSpendLimits } from '../cost-limits.js'
import type { DataForSeoClient } from './client.js'

export type UserDataAccountFixture = {
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

export type UserDataTaskFixture = {
  id: string
  status_code: number
  status_message: string
  cost: number
  result_count: number
  result: UserDataAccountFixture[]
}

export type UserDataFixture = {
  version: string
  status_code: number
  status_message: string
  time: string
  cost: number
  tasks_count: number
  tasks_error: number
  tasks: UserDataTaskFixture[]
}

export function userDataFixture(): UserDataFixture {
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
              ai_optimization: {
                llm_responses: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_request', cost: 0.0006 },
                    ],
                  },
                },
                llm_mentions: {
                  target_metrics: {
                    live: {
                      priority_normal: [
                        { cost_type: 'per_request', cost: 0.1 },
                        { cost_type: 'per_result', cost: 0.001 },
                      ],
                    },
                  },
                  multi_target_metrics: {
                    live: {
                      priority_normal: [
                        { cost_type: 'per_request', cost: 0.1 },
                        { cost_type: 'per_result', cost: 0.001 },
                      ],
                    },
                  },
                  search_mentions: {
                    live: {
                      priority_normal: [
                        { cost_type: 'per_request', cost: 0.1 },
                        { cost_type: 'per_result', cost: 0.001 },
                      ],
                    },
                  },
                },
              },
              backlinks: {
                summary: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_result', cost: 0.000036 },
                      { cost_type: 'per_request', cost: 0.024 },
                    ],
                  },
                },
                backlinks: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_result', cost: 0.000036 },
                      { cost_type: 'per_request', cost: 0.024 },
                    ],
                  },
                },
                referring_domains: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_result', cost: 0.000036 },
                      { cost_type: 'per_request', cost: 0.024 },
                    ],
                  },
                },
              },
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
                domain_rank_overview: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_result', cost: 0.00012 },
                      { cost_type: 'per_request', cost: 0.012 },
                    ],
                  },
                },
                ranked_keywords: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_result', cost: 0.00012 },
                      { cost_type: 'per_request', cost: 0.012 },
                    ],
                  },
                },
                relevant_pages: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_result', cost: 0.00012 },
                      { cost_type: 'per_request', cost: 0.012 },
                    ],
                  },
                },
                serp_competitors: {
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

export function firstTask(fixture: UserDataFixture): UserDataTaskFixture {
  const task = fixture.tasks[0]
  assert.ok(task)
  return task
}

export function firstAccount(fixture: UserDataFixture): UserDataAccountFixture {
  const account = firstTask(fixture).result[0]
  assert.ok(account)
  return account
}

export function database(): Database.Database {
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

export function spendLimits(
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

export function keywordOverviewFixture(
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

export function keywordDiscoveryFixture() {
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

export function serpFixture() {
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

export function keywordRequest(
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
