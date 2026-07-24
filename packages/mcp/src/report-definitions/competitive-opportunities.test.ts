import assert from 'node:assert/strict'
import test from 'node:test'
import {
  competitiveOpportunitiesInputSchema,
  createCompetitiveOpportunitiesHandler,
} from './competitive-opportunities.js'

test('competitive opportunities forwards one bounded provider-neutral request', async () => {
  const handler = createCompetitiveOpportunitiesHandler({
    competitiveOpportunitiesReport: async (input) => {
      assert.deepEqual(input, {
        target: 'example.com',
        seeds: ['seo tools'],
        market: {
          countryCode: 'GB',
          languageCode: 'en',
          searchEngine: 'google',
          device: 'desktop',
        },
        keywordProvider: 'semrush',
        discoverySources: ['ideas', 'related', 'suggestions'],
        discoveryLimit: 30,
        keywordLimit: 5,
        serpProvider: 'dataforseo',
        serpDepth: 10,
        competitorLimit: 5,
        competitionEvidence: 'domain-rating',
        linkProvider: undefined,
        projectId: 'keep',
        refresh: true,
      })
      return {
        summary: { verdict: 'Competitive opportunity evidence retained.' },
      } as never
    },
  })

  const result = await handler({
    target: 'example.com',
    seeds: ['seo tools'],
    countryCode: 'GB',
    languageCode: 'en',
    keywordProvider: 'semrush',
    serpProvider: 'dataforseo',
    projectId: 'keep',
    refresh: true,
  })

  assert.equal(result.isError, undefined)
  assert.equal(
    result.structuredContent?.summary &&
      (result.structuredContent.summary as Record<string, unknown>).verdict,
    'Competitive opportunity evidence retained.',
  )
})

test('competitive opportunities schema enforces market, cost, and acquisition bounds', () => {
  assert.equal(
    competitiveOpportunitiesInputSchema.safeParse({
      target: 'example.com',
      seeds: ['seo tools', 'seo audit'],
      countryCode: 'GB',
      languageCode: 'en',
      competitionEvidence: 'link-summary',
      linkProvider: 'ahrefs',
      discoveryLimit: 6,
      keywordLimit: 10,
      serpDepth: 20,
      competitorLimit: 10,
    }).success,
    true,
  )

  for (const input of [
    {
      target: 'example.com',
      seeds: [],
      countryCode: 'GB',
      languageCode: 'en',
    },
    {
      target: 'example.com',
      seeds: ['one', 'two'],
      countryCode: 'GB',
      languageCode: 'en',
      discoveryLimit: 5,
    },
    {
      target: 'example.com',
      seeds: ['seo tools'],
      countryCode: 'GB',
      languageCode: 'en',
      searchEngine: 'bing',
    },
    {
      target: 'example.com',
      seeds: ['seo tools'],
      countryCode: 'GB',
      languageCode: 'en',
      linkProvider: 'ahrefs',
    },
    {
      target: 'example.com',
      seeds: ['seo tools'],
      countryCode: 'GB',
      languageCode: 'en',
      location: { name: 'London,England,United Kingdom' },
    },
  ]) {
    assert.equal(
      competitiveOpportunitiesInputSchema.safeParse(input).success,
      false,
      JSON.stringify(input),
    )
  }
})

test('competitive opportunities keeps detail and byte budgets through compaction', async () => {
  const rows = Array.from({ length: 200 }, (_, index) => ({
    keyword: `competitive opportunity ${index}`,
    detail: 'x'.repeat(1_000),
  }))
  const handler = createCompetitiveOpportunitiesHandler({
    competitiveOpportunitiesReport: async () =>
      ({
        schemaVersion: 1,
        generatedAt: '2026-07-24T12:00:00.000Z',
        dataStatus: 'complete',
        summary: { verdict: 'Bounded competitive evidence retained.' },
        selection: { keywordLimit: 10, competitorLimit: 10, serpDepth: 20 },
        source: {
          keywordResearch: { evidence: { data: rows } },
          serps: { observations: rows },
        },
        detailBudget: {
          unit: 'competitive-synthesis-rows',
          limit: 200,
          returned: 200,
        },
        candidates: rows,
        competitors: rows,
        opportunities: rows,
        findings: rows,
        caveats: ['Every provider source is bounded.'],
        nextSteps: [],
      }) as never,
  })

  const result = await handler({
    target: 'example.com',
    seeds: ['seo tools'],
    countryCode: 'GB',
    languageCode: 'en',
  })
  const byteBudget = result.structuredContent?.outputBudget as Record<
    string,
    unknown
  >
  const detailBudget = result.structuredContent?.detailBudget as Record<
    string,
    unknown
  >

  assert.equal(byteBudget.truncated, true)
  assert.equal(detailBudget.limit, 200)
  assert.ok(
    Array.isArray(result.structuredContent?.opportunities) &&
      result.structuredContent.opportunities.length > 0,
  )
  assert.ok(
    Buffer.byteLength(JSON.stringify(result.structuredContent)) <= 98_304,
  )
})
