import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  DataForSeoAiMentionMetricsSnapshot,
  DataForSeoAiMentionSearchSnapshot,
} from './ai-mention-client.js'
import { DataForSeoAiMentionProvider } from './ai-mentions.js'

const snapshot = {
  observedAt: '2026-07-22T10:00:00.000Z',
  returnedRows: 1,
  cache: { status: 'miss' as const, storedAt: null, expiresAt: null },
  cost: {
    currency: 'USD' as const,
    estimatedMicros: 101_000,
    actualMicros: 101_000,
    taskIds: ['task-1'],
  },
  spendNotice: null,
  warnings: [],
}

const input = {
  target: { key: 'target', label: 'Target', aliases: ['Target'] },
  competitors: [],
  domain: 'example.com',
  market: {
    countryCode: 'US',
    languageCode: 'en',
    location: { code: 2840 },
    surface: 'google-ai-overview' as const,
  },
  sampleLimit: 10,
}

test('AI mention provider preserves observed zero metrics and normalizes sources', async () => {
  const provider = new DataForSeoAiMentionProvider({
    client: {
      aiMentionMetrics: async () =>
        ({
          ...snapshot,
          response: {
            status_code: 20000,
            status_message: 'Ok.',
            cost: 0.101,
            tasks_count: 1,
            tasks_error: 0,
            tasks: [
              {
                id: 'task-1',
                status_code: 20000,
                status_message: 'Ok.',
                cost: 0.101,
                result_count: 1,
                result: [
                  {
                    total_count: 0,
                    items_count: 0,
                    aggregated_metrics: {
                      total: { mentions: 0, ai_search_volume: 0 },
                      sources_domain: [
                        {
                          key: 'www.example.com',
                          mentions: 0,
                          ai_search_volume: 0,
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        }) as DataForSeoAiMentionMetricsSnapshot,
      aiMentionSearch: async () => assert.fail('unexpected sample request'),
    },
  })
  const evidence = await provider.aiMentionMetrics(input)

  assert.deepEqual(evidence.data.targets[0]?.mentions, {
    state: 'observed',
    value: 0,
  })
  assert.deepEqual(evidence.data.targets[0]?.sourceDomains, [
    { domain: 'example.com', mentions: 0, aiSearchVolume: 0 },
  ])
  assert.equal(evidence.coverage.completeness, 'complete')
})

test('AI mention provider bounds answers, sources and duplicate questions', async () => {
  const provider = new DataForSeoAiMentionProvider({
    client: {
      aiMentionMetrics: async () => assert.fail('unexpected metrics request'),
      aiMentionSearch: async () =>
        ({
          ...snapshot,
          returnedRows: 3,
          response: {
            status_code: 20000,
            status_message: 'Ok.',
            cost: 0.103,
            tasks_count: 1,
            tasks_error: 0,
            tasks: [
              {
                id: 'task-1',
                status_code: 20000,
                status_message: 'Ok.',
                cost: 0.103,
                result_count: 1,
                result: [
                  {
                    total_count: 40,
                    items_count: 3,
                    search_after_token: 'next',
                    items: [
                      {
                        question: 'Which target is best?',
                        answer: 'x'.repeat(2_100),
                        ai_search_volume: 0,
                        first_response_at: '2026-06-01 10:00:00 +00:00',
                        last_response_at: 'bad-date',
                        is_web_search_based: false,
                        sources: [
                          {
                            rank: 1,
                            domain: 'www.example.com',
                            url: 'https://example.com/page',
                            title: 'Owned page',
                          },
                          {
                            rank: 2,
                            domain: 'bad source',
                            url: 'javascript:alert(1)',
                          },
                        ],
                      },
                      {
                        question: 'which target is best?',
                        answer: 'duplicate',
                      },
                      { question: '', answer: 'invalid' },
                    ],
                  },
                ],
              },
            ],
          },
        }) as DataForSeoAiMentionSearchSnapshot,
    },
  })
  const evidence = await provider.aiMentionSamples(input)

  assert.equal(evidence.data.length, 1)
  assert.equal(evidence.data[0]?.answerExcerpt.length, 2_000)
  assert.equal(evidence.data[0]?.answerTruncated, true)
  assert.deepEqual(evidence.data[0]?.aiSearchVolume, {
    state: 'observed',
    value: 0,
  })
  assert.equal(evidence.data[0]?.lastObservedAt.state, 'invalid')
  assert.equal(evidence.data[0]?.sources.length, 1)
  assert.equal(evidence.coverage.completeness, 'partial')
  assert.equal(evidence.coverage.nextCursor, 'next')
})

test('AI mention provider rejects unsupported ChatGPT markets before client work', async () => {
  let calls = 0
  const provider = new DataForSeoAiMentionProvider({
    client: {
      aiMentionMetrics: async () => {
        calls += 1
        throw new Error('unexpected')
      },
      aiMentionSearch: async () => {
        calls += 1
        throw new Error('unexpected')
      },
    },
  })
  await assert.rejects(
    provider.aiMentionMetrics({
      ...input,
      market: {
        countryCode: 'GB',
        languageCode: 'en',
        location: { code: 2826 },
        surface: 'chatgpt',
      },
    }),
    /United States English only/,
  )
  assert.equal(calls, 0)
})
