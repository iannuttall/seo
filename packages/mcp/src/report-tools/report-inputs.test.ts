import assert from 'node:assert/strict'
import test from 'node:test'
import * as z from 'zod/v4'
import { registerDiagnosisTools } from '../diagnosis-tools.js'
import { registerSecondPageTool } from './second-page.js'

type ToolConfig = { inputSchema: z.ZodRawShape }

function captureTools(
  register: (server: never) => void,
): Map<string, ToolConfig> {
  const tools = new Map<string, ToolConfig>()
  register({
    registerTool(name: string, config: ToolConfig) {
      tools.set(name, config)
    },
  } as never)
  return tools
}

function inputSchema(tools: Map<string, ToolConfig>, name: string) {
  const config = tools.get(name)
  assert.ok(config)
  return z.object(config.inputSchema)
}

test('second-page MCP bounds agent inputs and accepts explicit brand terms', () => {
  const schema = inputSchema(
    captureTools(registerSecondPageTool),
    'seo_second_page',
  )
  const valid = schema.safeParse({
    site: 'sc-domain:example.co.uk',
    range: 548,
    minImpressions: 0,
    limit: 100,
    verifyLimit: 0,
    brandTerms: ['Example'],
    fetchConcurrency: 16,
  })

  assert.equal(valid.success, true)
  for (const input of [
    { site: 'sc-domain:example.com', range: 0 },
    { site: 'sc-domain:example.com', limit: 101 },
    { site: 'sc-domain:example.com', verifyLimit: 1.5 },
    { site: 'sc-domain:example.com', fetchConcurrency: 17 },
    { site: 'sc-domain:example.com', brandTerms: [''] },
  ]) {
    assert.equal(schema.safeParse(input).success, false)
  }
})

test('striking-distance MCP uses the same bounded numeric contract', () => {
  const schema = inputSchema(
    captureTools(registerDiagnosisTools),
    'seo_striking_distance',
  )

  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      days: 28,
      minImpressions: 10,
      limit: 25,
      verifyLimit: 5,
      brandTerms: ['Example'],
    }).success,
    true,
  )
  assert.equal(
    schema.safeParse({ site: 'sc-domain:example.com', days: 549 }).success,
    false,
  )
  assert.equal(
    schema.safeParse({ site: 'sc-domain:example.com', limit: -1 }).success,
    false,
  )
})
