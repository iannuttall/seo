import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AiReferralReport } from '@seo/core'
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
