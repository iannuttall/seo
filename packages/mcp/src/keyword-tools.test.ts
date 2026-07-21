import assert from 'node:assert/strict'
import test from 'node:test'
import { registerKeywordTools } from './keyword-tools.js'

type ToolResult = {
  structuredContent?: Record<string, unknown>
}

type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>

test('keyword metrics MCP forwards a bounded neutral market and budgets output', async () => {
  const handlers = new Map<string, ToolHandler>()
  let captured: unknown
  registerKeywordTools(
    {
      registerTool(name: string, _config: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    } as never,
    {
      keywordMetricsReport: async (input) => {
        captured = input
        return {
          schemaVersion: 1,
          generatedAt: '2026-07-21T12:00:00.000Z',
          dataStatus: 'complete',
          market: input.market,
          summary: {
            requestedKeywords: 1,
            providerRows: 1,
            keywordsWithObservedVolume: 1,
            observedZeroVolume: 0,
            missingOrInvalidVolume: 0,
            increasingTrends: 0,
            decreasingTrends: 0,
            stableTrends: 0,
            unavailableTrends: 1,
            verdict: 'One keyword has observed metrics.',
          },
          evidence: { data: [] },
          analysis: [],
          findings: [],
          caveats: [],
          nextSteps: [],
        } as never
      },
    },
  )

  const result = await handlers.get('seo_keyword_metrics')?.({
    keywords: ['local seo tool'],
    countryCode: 'GB',
    languageCode: 'en-GB',
    searchEngine: 'google',
    location: { name: 'London,England,United Kingdom' },
    device: 'mobile',
    provider: 'dataforseo',
    refresh: true,
  })
  assert.deepEqual(captured, {
    keywords: ['local seo tool'],
    market: {
      countryCode: 'GB',
      languageCode: 'en-GB',
      searchEngine: 'google',
      location: { name: 'London,England,United Kingdom' },
      device: 'mobile',
    },
    provider: 'dataforseo',
    refresh: true,
  })
  assert.equal(result?.structuredContent?.dataStatus, 'complete')
  const outputBudget = result?.structuredContent?.outputBudget as
    | Record<string, unknown>
    | undefined
  assert.equal(outputBudget?.schemaVersion, 1)
  assert.equal(outputBudget?.maxBytes, 98_304)
  assert.equal(outputBudget?.truncated, false)
  assert.deepEqual(outputBudget?.omissions, [])
  assert.equal(
    outputBudget?.detail,
    'The complete structured report fits within the agent output budget.',
  )
  assert.ok(Number(outputBudget?.returnedBytes) <= 98_304)
})

test('keyword metrics MCP schema bounds inputs before report work', () => {
  let schema: { safeParse(value: unknown): { success: boolean } } | undefined
  registerKeywordTools({
    registerTool(
      name: string,
      config: { inputSchema: Record<string, unknown> },
    ) {
      if (name === 'seo_keyword_metrics') {
        schema = {
          safeParse(value: unknown) {
            const input = value as Record<string, unknown>
            const fields = config.inputSchema as Record<
              string,
              { safeParse(value: unknown): { success: boolean } }
            >
            return {
              success: Object.entries(input).every(
                ([key, item]) => fields[key]?.safeParse(item).success,
              ),
            }
          },
        }
      }
    },
  } as never)
  assert.ok(schema)
  assert.equal(
    schema.safeParse({
      keywords: ['keyword'],
      countryCode: 'US',
      languageCode: 'en',
    }).success,
    true,
  )
  for (const input of [
    { keywords: [], countryCode: 'US', languageCode: 'en' },
    {
      keywords: ['one two three four five six seven eight nine ten eleven'],
      countryCode: 'US',
      languageCode: 'en',
    },
    { keywords: ['keyword'], countryCode: 'USA', languageCode: 'en' },
    { keywords: ['keyword'], countryCode: 'US', languageCode: 'english' },
    {
      keywords: ['keyword'],
      countryCode: 'US',
      languageCode: 'en',
      location: {},
    },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})

test('keyword opportunities MCP forwards opt-in market context and budgets output', async () => {
  const handlers = new Map<string, ToolHandler>()
  let captured: unknown
  registerKeywordTools(
    {
      registerTool(name: string, _config: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    } as never,
    {
      keywordOpportunitiesReport: async (input) => {
        captured = input
        return {
          schemaVersion: 1,
          site: input.site,
          generatedAt: '2026-07-21T12:00:00.000Z',
          range: { startDate: '2026-06-20', endDate: '2026-07-17' },
          rangeDays: 28,
          dataStatus: 'complete',
          summary: {
            verdict: 'One enriched keyword opportunity is available.',
          },
          methodology: {},
          firstParty: {},
          external: {},
          combined: [],
          candidateClusters: [],
          programmaticPatterns: [],
          findings: [],
          dataSourcePrompts: [],
          caveats: [],
          nextSteps: [],
        } as never
      },
    },
  )

  const result = await handlers.get('seo_keyword_opportunities')?.({
    site: 'sc-domain:example.com',
    days: 56,
    minImpressions: 25,
    limit: 20,
    keywordLimit: 40,
    queriesPerPage: 4,
    clusterLimit: 15,
    brandTerms: ['example'],
    includeBrand: false,
    includeExternal: true,
    countryCode: 'GB',
    languageCode: 'en-GB',
    searchEngine: 'google',
    location: {
      code: 1006886,
      name: 'London,England,United Kingdom',
    },
    device: 'mobile',
    provider: 'dataforseo',
    refresh: true,
  })

  assert.deepEqual(captured, {
    site: 'sc-domain:example.com',
    days: 56,
    minImpressions: 25,
    limit: 20,
    keywordLimit: 40,
    queriesPerPage: 4,
    clusterLimit: 15,
    brandTerms: ['example'],
    includeBrand: false,
    includeExternal: true,
    market: {
      countryCode: 'GB',
      languageCode: 'en-GB',
      searchEngine: 'google',
      location: {
        code: 1006886,
        name: 'London,England,United Kingdom',
      },
      device: 'mobile',
    },
    provider: 'dataforseo',
    refresh: true,
  })
  assert.equal(result?.structuredContent?.dataStatus, 'complete')
  const outputBudget = result?.structuredContent?.outputBudget as
    | Record<string, unknown>
    | undefined
  assert.equal(outputBudget?.maxBytes, 98_304)
  assert.equal(outputBudget?.truncated, false)
})

test('keyword opportunities MCP requires paid intent and bounds all work', () => {
  let schema: { safeParse(value: unknown): { success: boolean } } | undefined
  registerKeywordTools({
    registerTool(name: string, config: { inputSchema: unknown }) {
      if (name === 'seo_keyword_opportunities') {
        schema = config.inputSchema as typeof schema
      }
    },
  } as never)
  assert.ok(schema)
  assert.equal(
    schema.safeParse({ site: 'sc-domain:example.com' }).success,
    true,
  )
  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      includeExternal: true,
      countryCode: 'GB',
      languageCode: 'en',
      location: {
        code: 1006886,
        name: 'London,England,United Kingdom',
      },
    }).success,
    true,
  )
  for (const input of [
    { site: '' },
    { site: 'sc-domain:example.com', days: 549 },
    { site: 'sc-domain:example.com', minImpressions: -1 },
    { site: 'sc-domain:example.com', limit: 26 },
    { site: 'sc-domain:example.com', keywordLimit: 51 },
    { site: 'sc-domain:example.com', queriesPerPage: 6 },
    { site: 'sc-domain:example.com', clusterLimit: 21 },
    { site: 'sc-domain:example.com', includeExternal: true },
    {
      site: 'sc-domain:example.com',
      countryCode: 'GB',
      languageCode: 'en',
    },
    { site: 'sc-domain:example.com', provider: 'dataforseo' },
    {
      site: 'sc-domain:example.com',
      includeExternal: true,
      countryCode: 'GB',
      languageCode: 'en',
      location: {},
    },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})
