import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SegmentImpactReport } from '@seo/core'
import { registerDiagnosisTools } from './diagnosis-tools.js'

test('segment impact MCP preserves structured evidence and verdict', async () => {
  const fixture = {
    schemaVersion: 2,
    dataStatus: 'partial',
    dimension: 'page',
    summary: {
      verdict:
        '1 of 1 matched retained segments returned. 2 one-window rows were not converted to zero.',
    },
  } as unknown as SegmentImpactReport
  let handler:
    | ((input: { site: string }) => Promise<{
        content: Array<{ type: 'text'; text: string }>
        structuredContent?: Record<string, unknown>
      }>)
    | undefined

  registerDiagnosisTools(
    {
      registerTool(
        name: string,
        _config: unknown,
        toolHandler: typeof handler,
      ) {
        if (name === 'seo_segment_impact') handler = toolHandler
      },
    } as never,
    { segmentImpact: async () => fixture },
  )

  assert.ok(handler)
  const result = await handler({ site: 'sc-domain:example.com' })
  assert.equal(result.structuredContent, fixture)
  assert.equal(result.content[0]?.text, fixture.summary.verdict)
})
