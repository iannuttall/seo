import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aiPromptObservationsInputSchema,
  createAiPromptObservationsHandler,
} from './ai-prompt-observations.js'

const validInput = {
  prompts: [{ id: 'choice', prompt: 'Which analytics tool should I use?' }],
  models: [{ surface: 'chatgpt', model: 'current-model' }],
  target: {
    label: 'Example Analytics',
    aliases: ['Example'],
    domains: ['example.test'],
  },
  competitors: [{ label: 'Rival Analytics' }],
  countryCode: 'GB',
  languageCode: 'en',
  webSearch: true,
  maxOutputTokens: 2_048,
}

test('AI prompt report forwards one bounded provider-neutral prompt set', async () => {
  const handler = createAiPromptObservationsHandler({
    aiPromptObservationsReport: async (input) => {
      assert.equal(input.prompts.length, 1)
      assert.equal(input.models[0]?.surface, 'chatgpt')
      assert.equal(input.market.countryCode, 'GB')
      assert.equal(input.webSearch, true)
      assert.equal(input.maxOutputTokens, 2_048)
      return { summary: { verdict: 'Evidence retained.' } } as never
    },
  })
  await handler(validInput)
})

test('AI prompt report schema bounds all paid request dimensions', () => {
  assert.equal(
    aiPromptObservationsInputSchema.safeParse(validInput).success,
    true,
  )
  for (const input of [
    { ...validInput, prompts: [] },
    {
      ...validInput,
      prompts: Array.from({ length: 6 }, (_, index) => ({
        prompt: `Question ${index}`,
      })),
    },
    {
      ...validInput,
      models: Array.from({ length: 5 }, (_, index) => ({
        surface: 'chatgpt',
        model: `model-${index}`,
      })),
    },
    { ...validInput, maxOutputTokens: 4_097 },
  ]) {
    assert.equal(
      aiPromptObservationsInputSchema.safeParse(input).success,
      false,
      JSON.stringify(input),
    )
  }
})

test('AI prompt report advertises only the currently supported live provider', () => {
  assert.equal(
    aiPromptObservationsInputSchema.safeParse({
      ...validInput,
      provider: 'dataforseo',
    }).success,
    true,
  )
  for (const provider of ['semrush', 'ahrefs']) {
    assert.equal(
      aiPromptObservationsInputSchema.safeParse({
        ...validInput,
        provider,
      }).success,
      false,
      provider,
    )
  }
})

test('AI prompt report keeps large answers inside one agent output budget', async () => {
  const answer = 'Bounded answer evidence. '.repeat(1_000)
  const observations = Array.from({ length: 20 }, (_, index) => ({
    state: 'complete',
    observationKey: `prompt-${index}:chatgpt:model`,
    promptId: `prompt-${index}`,
    promptGroup: null,
    prompt: `Question ${index}`,
    surface: 'chatgpt',
    fanOutQueries: [],
    targets: [],
    comparison: { status: 'no-prior' },
    evidence: {
      data: { answer },
      coverage: { completeness: 'complete' },
      cache: { status: 'miss' },
      cost: { actualMicros: 1_000 },
    },
  }))
  const handler = createAiPromptObservationsHandler({
    aiPromptObservationsReport: async () =>
      ({
        schemaVersion: 1,
        generatedAt: '2026-07-22T12:00:00.000Z',
        dataStatus: 'complete',
        summary: { verdict: 'Large fixed basket retained.' },
        observations,
        caveats: ['Each answer is one bounded observation.'],
        nextSteps: [],
      }) as never,
  })

  const result = await handler(validInput)
  const outputBudget = result.structuredContent?.outputBudget as Record<
    string,
    unknown
  >
  assert.equal(outputBudget.truncated, true)
  assert.ok(
    Buffer.byteLength(JSON.stringify(result.structuredContent)) <= 98_304,
  )
})
