import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  AiReferralReport,
  CommunityIntentReport,
  SeoToAiQueryReport,
} from '@seo/core'
import { registerAiOpportunityTools } from './ai-opportunity-tools.js'

test('AI referrals MCP preserves the schema v3 structured contract', async () => {
  const fixture = {
    schemaVersion: 3,
    dataStatus: 'complete',
    summary: { sessions: 0, sources: 0 },
  } as unknown as AiReferralReport
  let handler:
    | ((input: { property: string }) => Promise<{
        content: Array<{ type: 'text'; text: string }>
        structuredContent?: Record<string, unknown>
      }>)
    | undefined

  registerAiOpportunityTools(
    {
      registerTool(
        name: string,
        _config: unknown,
        toolHandler: typeof handler,
      ) {
        if (name === 'seo_ai_referrals') handler = toolHandler
      },
    } as never,
    {
      aiReferralsReport: async () => fixture,
    },
  )

  assert.ok(handler)
  const result = await handler({ property: '123' })
  assert.equal(result.structuredContent, fixture)
  assert.match(result.content[0]?.text ?? '', /evidence is complete/)
})

test('AI referrals rejects conflicting row-limit aliases before provider work', async () => {
  let calls = 0
  let receivedResultLimit: number | undefined
  let handler:
    | ((input: {
        property: string
        maxRows?: number
        limit?: number
        resultLimit?: number
      }) => Promise<{
        isError?: boolean
        structuredContent?: Record<string, unknown>
      }>)
    | undefined

  registerAiOpportunityTools(
    {
      registerTool(
        name: string,
        _config: unknown,
        toolHandler: typeof handler,
      ) {
        if (name === 'seo_ai_referrals') handler = toolHandler
      },
    } as never,
    {
      aiReferralsReport: async (input) => {
        calls++
        receivedResultLimit = input.resultLimit
        return {
          dataStatus: 'complete',
          summary: { sessions: 0, sources: 0 },
        } as never
      },
    },
  )

  assert.ok(handler)
  const result = await handler({ property: '123', maxRows: 100, limit: 50 })
  assert.equal(calls, 0)
  assert.equal(result.isError, true)
  assert.deepEqual(result.structuredContent, {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message:
        'maxRows and the legacy limit option must match when both are provided.',
      retryable: false,
    },
  })

  const compatible = await handler({
    property: '123',
    maxRows: 100,
    limit: 100,
    resultLimit: 25,
  })
  assert.equal(calls, 1)
  assert.equal(receivedResultLimit, 25)
  assert.equal(compatible.isError, undefined)
})

test('query opportunity MCP preserves schema v2 evidence contracts', async () => {
  const promptFixture = {
    schemaVersion: 2,
    dataStatus: 'partial',
    summary: { prompts: 2, returnedQueries: 1 },
  } as unknown as SeoToAiQueryReport
  const intentFixture = {
    schemaVersion: 2,
    dataStatus: 'partial',
    summary: { verdict: 'Partial evidence: one retained query matched.' },
  } as unknown as CommunityIntentReport
  const handlers = new Map<
    string,
    (input: { site: string }) => Promise<{
      content: Array<{ type: 'text'; text: string }>
      structuredContent?: Record<string, unknown>
    }>
  >()

  registerAiOpportunityTools(
    {
      registerTool(name: string, _config: unknown, handler: never) {
        handlers.set(name, handler)
      },
    } as never,
    {
      seoToAiQueryReport: async () => promptFixture,
      communityIntentReport: async () => intentFixture,
    },
  )

  const prompt = await handlers.get('seo_to_ai_query')?.({ site: 'example' })
  const intent = await handlers.get('seo_community_intent')?.({
    site: 'example',
  })
  assert.equal(prompt?.structuredContent, promptFixture)
  assert.match(prompt?.content[0]?.text ?? '', /evidence is partial/)
  assert.equal(intent?.structuredContent, intentFixture)
  assert.equal(
    intent?.content[0]?.text,
    'Evidence status: partial. Partial evidence: one retained query matched.',
  )
})

test('AI page handlers preserve explicit JavaScript disablement and auto defaults', async () => {
  const handlers = new Map<
    string,
    (input: Record<string, unknown>) => Promise<unknown>
  >()
  const pageInputs: Array<Record<string, unknown>> = []
  const contentInputs: Array<Record<string, unknown>> = []

  registerAiOpportunityTools(
    {
      registerTool(name: string, _config: unknown, handler: never) {
        handlers.set(name, handler)
      },
    } as never,
    {
      pageOpportunitiesReport: async (input) => {
        pageInputs.push(input)
        return { summary: { verdict: 'Page fixture.' } } as never
      },
      contentOptimizationReport: async (input) => {
        contentInputs.push(input)
        return { summary: { verdict: 'Content fixture.' } } as never
      },
    },
  )

  const required = {
    site: 'sc-domain:example.com',
    url: 'https://example.com/page',
  }
  await handlers.get('seo_page_opportunities')?.({ ...required, js: false })
  await handlers.get('seo_page_opportunities')?.(required)
  await handlers.get('seo_content_optimization')?.({
    ...required,
    js: false,
  })
  await handlers.get('seo_content_optimization')?.(required)

  assert.deepEqual(
    pageInputs.map((input) => input.js),
    [false, 'auto'],
  )
  assert.deepEqual(
    contentInputs.map((input) => input.js),
    [false, 'auto'],
  )
})
