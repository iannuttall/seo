import assert from 'node:assert/strict'

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

function firstTask(fixture: UserDataFixture): UserDataTaskFixture {
  const task = fixture.tasks[0]
  assert.ok(task)
  return task
}

export function firstAccount(fixture: UserDataFixture): UserDataAccountFixture {
  const account = firstTask(fixture).result[0]
  assert.ok(account)
  return account
}
