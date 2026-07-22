import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aiMentionResearchInputSchema,
  createAiMentionResearchHandler,
} from './ai-mention-research.js'

test('AI mention report forwards a bounded provider-neutral request', async () => {
  const handler = createAiMentionResearchHandler({
    aiMentionResearchReport: async (input) => {
      assert.equal(input.target.label, 'Example')
      assert.equal(input.market.surface, 'google-ai-overview')
      assert.equal(input.market.location.code, 2840)
      assert.equal(input.includeSamples, true)
      assert.equal(input.sampleLimit, 10)
      return { summary: { verdict: 'Evidence retained.' } } as never
    },
  })
  await handler({
    target: { label: 'Example' },
    competitors: [],
    surface: 'google-ai-overview',
    countryCode: 'US',
    languageCode: 'en',
    location: { code: 2840 },
    includeSamples: true,
    sampleLimit: 10,
  })
})

test('AI mention report schema bounds targets and sample acquisition', () => {
  assert.equal(
    aiMentionResearchInputSchema.safeParse({
      target: { label: 'Example', aliases: ['Example App'] },
      competitors: [{ label: 'Competitor' }],
      surface: 'chatgpt',
      countryCode: 'US',
      languageCode: 'en',
      location: { code: 2840 },
      includeSamples: false,
      sampleLimit: 25,
    }).success,
    true,
  )
  for (const input of [
    {
      target: { label: 'Example' },
      surface: 'chatgpt',
      countryCode: 'US',
      languageCode: 'en',
    },
    {
      target: { label: 'Example' },
      competitors: Array.from({ length: 6 }, (_, index) => ({
        label: `Competitor ${index}`,
      })),
      surface: 'google-ai-overview',
      countryCode: 'US',
      languageCode: 'en',
      location: { code: 2840 },
    },
    {
      target: { label: 'Example' },
      surface: 'google-ai-overview',
      countryCode: 'US',
      languageCode: 'en',
      location: { code: 2840 },
      sampleLimit: 26,
    },
  ]) {
    assert.equal(
      aiMentionResearchInputSchema.safeParse(input).success,
      false,
      JSON.stringify(input),
    )
  }
})

test('AI mention report keeps oversized evidence inside one agent output budget', async () => {
  const oversizedSamples = Array.from({ length: 25 }, (_, index) => ({
    question: `Which analytics platform should I use for case ${index}?`,
    answerExcerpt: 'Bounded answer evidence. '.repeat(400),
    sources: Array.from({ length: 10 }, (_, sourceIndex) => ({
      domain: `source-${sourceIndex}.test`,
      url: `https://source-${sourceIndex}.test/evidence/${index}`,
    })),
  }))
  const handler = createAiMentionResearchHandler({
    aiMentionResearchReport: async () =>
      ({
        schemaVersion: 1,
        generatedAt: '2026-07-22T12:00:00.000Z',
        dataStatus: 'partial',
        summary: { verdict: 'Bounded AI mention evidence was retained.' },
        source: { samples: { evidence: { data: oversizedSamples } } },
        processing: { firstPartyRows: 100_000 },
        samples: oversizedSamples,
        questionPatterns: oversizedSamples,
        dataSourceBriefs: oversizedSamples,
        findings: oversizedSamples,
        caveats: ['Provider samples are bounded and may be incomplete.'],
        nextSteps: [],
      }) as never,
  })

  const result = await handler({
    target: { label: 'Example Analytics' },
    surface: 'google-ai-overview',
    countryCode: 'GB',
    languageCode: 'en',
    location: { code: 2826 },
    includeSamples: true,
    sampleLimit: 25,
  })
  const outputBudget = result.structuredContent?.outputBudget as Record<
    string,
    unknown
  >
  assert.equal(outputBudget.truncated, true)
  assert.ok(
    Buffer.byteLength(JSON.stringify(result.structuredContent)) <= 98_304,
  )
})
