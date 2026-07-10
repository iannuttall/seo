import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  AiReferralReport,
  CommunityIntentReport,
  SeoToAiQueryReport,
} from '@seo/core'
import { registerAiOpportunityTools } from './ai-opportunity-tools.js'

test('AI referrals MCP preserves the schema v2 structured contract', async () => {
  const fixture = {
    schemaVersion: 2,
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
