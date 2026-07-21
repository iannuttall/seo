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
    {
      keywords: ['keyword'],
      countryCode: 'US',
      languageCode: 'en',
      location: { code: 2840, name: 'United States' },
    },
  ]) {
    assert.equal(schema.safeParse(input).success, false, JSON.stringify(input))
  }
})
