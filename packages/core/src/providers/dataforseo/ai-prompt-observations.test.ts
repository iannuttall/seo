import assert from 'node:assert/strict'
import test from 'node:test'
import { DataForSeoAiPromptObservationProvider } from './ai-prompt-observations.js'
import type {
  DataForSeoAiPromptModelsResponse,
  DataForSeoAiPromptResponse,
} from './ai-prompt-schema.js'

function modelsResponse(): DataForSeoAiPromptModelsResponse {
  return {
    status_code: 20000,
    tasks_error: 0,
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            model_name: 'model-current',
            reasoning: false,
            web_search_supported: true,
            task_post_supported: true,
          },
        ],
      },
    ],
  }
}

function observationResponse(): DataForSeoAiPromptResponse {
  return {
    status_code: 20000,
    cost: 0.0018,
    tasks_error: 0,
    tasks: [
      {
        id: 'task-1',
        status_code: 20000,
        cost: 0.0018,
        result: [
          {
            model_name: 'model-current-20260722',
            input_tokens: 12,
            output_tokens: 34,
            reasoning_tokens: 0,
            web_search: true,
            money_spent: 0.0012,
            datetime: '2026-07-22 12:30:00 +00:00',
            items: [
              {
                type: 'reasoning',
                sections: [{ type: 'summary_text', text: 'Do not retain.' }],
              },
              {
                type: 'message',
                sections: [
                  {
                    type: 'text',
                    text: 'Target is one option.',
                    annotations: [
                      {
                        title: 'Useful source',
                        url: 'https://example.com/source',
                      },
                      {
                        title: 'Duplicate',
                        url: 'https://example.com/source',
                      },
                      { title: 'Unsafe', url: 'javascript:alert(1)' },
                    ],
                  },
                ],
              },
            ],
            fan_out_queries: [
              'secondary question',
              'secondary question',
              ...Array.from({ length: 25 }, (_, index) => `query ${index}`),
            ],
          },
        ],
      },
    ],
  }
}

test('AI prompt provider validates the free catalog and maps bounded evidence', async () => {
  let paidCalls = 0
  const provider = new DataForSeoAiPromptObservationProvider({
    client: {
      aiPromptModels: async () => modelsResponse(),
      aiPromptObservation: async () => {
        paidCalls += 1
        return {
          response: observationResponse(),
          observedAt: '2026-07-22T12:30:01.000Z',
          returnedRows: 1,
          cache: { status: 'miss', storedAt: null, expiresAt: null },
          cost: {
            currency: 'USD',
            estimatedMicros: 600,
            actualMicros: 1_800,
            taskIds: ['task-1'],
          },
          spendNotice: null,
          warnings: [],
        }
      },
    },
  })

  const evidence = await provider.observeAiPrompt({
    prompt: 'Which option is best?',
    surface: 'chatgpt',
    model: 'model-current',
    market: { countryCode: 'US', languageCode: 'en' },
    webSearch: true,
    maxOutputTokens: 2_048,
  })

  assert.equal(paidCalls, 1)
  assert.equal(evidence.data.answer, 'Target is one option.')
  assert.doesNotMatch(evidence.data.answer, /Do not retain/)
  assert.deepEqual(evidence.data.citations, [
    {
      title: 'Useful source',
      url: 'https://example.com/source',
      domain: 'example.com',
    },
  ])
  assert.equal(evidence.data.fanOutQueries.length, 20)
  assert.equal(evidence.data.modelCostMicros, 1_200)
  assert.equal(evidence.data.checkedAt, '2026-07-22T12:30:00.000Z')
  assert.equal(evidence.cost.actualMicros, 1_800)
  assert.equal(evidence.market, null)
  assert.ok(
    evidence.warnings.some((warning) => warning.code === 'invalid-citations'),
  )
})

test('AI prompt provider rejects retired models before paid work', async () => {
  let paidCalls = 0
  const provider = new DataForSeoAiPromptObservationProvider({
    client: {
      aiPromptModels: async () => modelsResponse(),
      aiPromptObservation: async () => {
        paidCalls += 1
        throw new Error('unexpected')
      },
    },
  })
  await assert.rejects(
    provider.observeAiPrompt({
      prompt: 'Which option is best?',
      surface: 'chatgpt',
      model: 'retired-model',
      market: { countryCode: 'US', languageCode: 'en' },
      webSearch: true,
      maxOutputTokens: 2_048,
    }),
    /not in the current chatgpt model catalog/i,
  )
  assert.equal(paidCalls, 0)
})

test('AI prompt provider rejects an implausible future provider datetime', async () => {
  const response = observationResponse()
  const row = response.tasks[0]?.result?.[0]
  if (row) row.datetime = '2026-07-22 17:30:00 +00:00'
  const provider = new DataForSeoAiPromptObservationProvider({
    client: {
      aiPromptModels: async () => modelsResponse(),
      aiPromptObservation: async () => ({
        response,
        observedAt: '2026-07-22T14:30:01.000Z',
        returnedRows: 1,
        cache: { status: 'miss', storedAt: null, expiresAt: null },
        cost: {
          currency: 'USD',
          estimatedMicros: 600,
          actualMicros: 1_800,
          taskIds: ['task-1'],
        },
        spendNotice: null,
        warnings: [],
      }),
    },
  })

  const evidence = await provider.observeAiPrompt({
    prompt: 'Which option is best?',
    surface: 'chatgpt',
    model: 'model-current',
    market: { countryCode: 'US', languageCode: 'en' },
    webSearch: true,
    maxOutputTokens: 2_048,
  })

  assert.equal(evidence.data.checkedAt, '2026-07-22T14:30:01.000Z')
  assert.ok(
    evidence.warnings.some(
      (warning) => warning.code === 'provider-datetime-invalid',
    ),
  )
})
