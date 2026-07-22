import assert from 'node:assert/strict'
import test from 'node:test'
import type * as z from 'zod/v4'
import { registerDomainResearchTools } from './domain-research-tools.js'

type ToolResult = {
  structuredContent?: Record<string, unknown>
}

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>

function server() {
  const handlers = new Map<string, ToolHandler>()
  const schemas = new Map<string, z.ZodType>()
  return {
    handlers,
    schemas,
    value: {
      registerTool(
        name: string,
        config: { inputSchema: z.ZodType },
        handler: ToolHandler,
      ) {
        handlers.set(name, handler)
        schemas.set(name, config.inputSchema)
      },
    } as never,
  }
}

test('domain research tools register one report surface with bounded inputs', () => {
  const captured = server()
  registerDomainResearchTools(captured.value)

  assert.deepEqual([...captured.handlers.keys()].sort(), [
    'seo_competitor_keyword_gap',
    'seo_domain_overview',
    'seo_ranked_keywords',
    'seo_ranking_pages',
    'seo_serp_competitors',
  ])
  assert.equal(
    captured.schemas.get('seo_serp_competitors')?.safeParse({
      keywords: ['only one'],
      countryCode: 'GB',
      languageCode: 'en',
    }).success,
    false,
  )
  assert.equal(
    captured.schemas.get('seo_serp_competitors')?.safeParse({
      keywords: ['one term', 'two terms'],
      declaredCompetitors: [{ domain: 'one.test' }],
      countryCode: 'GB',
      languageCode: 'en',
    }).success,
    false,
  )
  assert.equal(
    captured.schemas.get('seo_competitor_keyword_gap')?.safeParse({
      site: 'sc-domain:example.com',
      competitors: [
        { domain: 'one.test' },
        { domain: 'two.test' },
        { domain: 'three.test' },
        { domain: 'four.test' },
      ],
      countryCode: 'GB',
      languageCode: 'en',
    }).success,
    false,
  )
  assert.equal(
    captured.schemas.get('seo_competitor_keyword_gap')?.safeParse({
      site: 'sc-domain:example.com',
      competitors: [{ domain: 'one.test' }],
      countryCode: 'GB',
      languageCode: 'en',
    }).success,
    false,
  )
})

test('competitor gap forwards the neutral market and applies one output budget', async () => {
  const captured = server()
  let forwarded: unknown
  registerDomainResearchTools(captured.value, {
    competitorKeywordGapReport: async (input) => {
      forwarded = input
      return {
        schemaVersion: 1,
        methodology: 'competitor_keyword_gap_v1',
        generatedAt: '2026-07-21T12:00:00.000Z',
        dataStatus: 'partial',
        market: input.market,
        summary: { verdict: 'One candidate was retained.' },
        source: {},
        selection: {},
        candidates: [],
        repeatedCompetitorPatterns: [],
        dataSourceBriefs: [],
        findings: [],
        caveats: [],
        nextSteps: [],
      } as never
    },
  })
  const result = await captured.handlers.get('seo_competitor_keyword_gap')?.({
    site: 'sc-domain:example.com',
    competitors: [{ domain: 'one.test', siteType: 'business' }],
    countryCode: 'GB',
    languageCode: 'en',
    searchEngine: 'google',
    limitPerDomain: 100,
    candidateLimit: 50,
  })

  assert.deepEqual(forwarded, {
    site: 'sc-domain:example.com',
    competitors: [{ domain: 'one.test', siteType: 'business' }],
    countryCode: 'GB',
    languageCode: 'en',
    searchEngine: 'google',
    limitPerDomain: 100,
    candidateLimit: 50,
    market: {
      countryCode: 'GB',
      languageCode: 'en',
      searchEngine: 'google',
    },
  })
  assert.equal(result?.structuredContent?.dataStatus, 'partial')
  assert.equal(
    (result?.structuredContent?.outputBudget as Record<string, unknown>)
      ?.maxBytes,
    98_304,
  )
})

test('competitor gap keeps oversized evidence inside the agent output budget', async () => {
  const captured = server()
  const oversizedRows = Array.from({ length: 1_000 }, (_, index) => ({
    keyword: `bounded keyword ${index} ${'detail '.repeat(40)}`,
    classification: 'relevant-gap-candidate',
    competitors: [`competitor-${index}.test`],
  }))
  registerDomainResearchTools(captured.value, {
    competitorKeywordGapReport: async (input) =>
      ({
        schemaVersion: 1,
        methodology: 'competitor_keyword_gap_v1',
        generatedAt: '2026-07-21T12:00:00.000Z',
        dataStatus: 'partial',
        market: input.market,
        summary: { verdict: 'Bounded competitor evidence was retained.' },
        source: { evidence: oversizedRows },
        selection: {},
        candidates: oversizedRows,
        repeatedCompetitorPatterns: oversizedRows,
        dataSourceBriefs: oversizedRows,
        findings: oversizedRows,
        caveats: ['Provider rows are bounded and may be incomplete.'],
        nextSteps: [],
      }) as never,
  })

  const result = await captured.handlers.get('seo_competitor_keyword_gap')?.({
    site: 'sc-domain:example.com',
    competitors: [{ domain: 'one.test', siteType: 'business' }],
    countryCode: 'GB',
    languageCode: 'en',
    searchEngine: 'google',
  })

  const outputBudget = result?.structuredContent?.outputBudget as Record<
    string,
    unknown
  >
  assert.equal(outputBudget.truncated, true)
  assert.ok(
    Buffer.byteLength(JSON.stringify(result?.structuredContent)) <= 98_304,
  )
})
