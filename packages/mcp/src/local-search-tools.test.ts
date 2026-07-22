import assert from 'node:assert/strict'
import test from 'node:test'
import type * as z from 'zod/v4'
import { registerLocalSearchTools } from './local-search-tools.js'

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>

function server() {
  let schema: z.ZodType | undefined
  let handler: ToolHandler | undefined
  return {
    get schema() {
      return schema
    },
    get handler() {
      return handler
    },
    value: {
      registerTool(
        _name: string,
        config: { inputSchema: z.ZodType },
        run: ToolHandler,
      ) {
        schema = config.inputSchema
        handler = run
      },
    } as never,
  }
}

test('local search tool passes first-party and local SERP inputs to core', async () => {
  const captured = server()
  registerLocalSearchTools(captured.value, {
    localSearchReport: async (input) => {
      assert.equal(input.site, 'sc-domain:example.com')
      assert.deepEqual(input.locationTerms, ['London'])
      assert.equal(input.includeSerps, true)
      assert.equal(
        input.market?.location?.name,
        'London,England,United Kingdom',
      )
      return {
        summary: { verdict: 'Local evidence retained.' },
      } as never
    },
  })
  const parsed = captured.schema?.safeParse({
    site: 'sc-domain:example.com',
    locationTerms: ['London'],
    includeSerps: true,
    countryCode: 'GB',
    languageCode: 'en',
    location: { name: 'London,England,United Kingdom' },
  })
  assert.equal(parsed?.success, true)
  assert.ok(captured.handler)
  await captured.handler({
    site: 'sc-domain:example.com',
    locationTerms: ['London'],
    includeSerps: true,
    countryCode: 'GB',
    languageCode: 'en',
    searchEngine: 'google',
    location: { name: 'London,England,United Kingdom' },
  })
})

test('local search schema keeps paid local SERPs explicit and bounded', () => {
  const captured = server()
  registerLocalSearchTools(captured.value)
  assert.equal(
    captured.schema?.safeParse({ site: 'sc-domain:example.com' }).success,
    true,
  )
  for (const input of [
    { site: 'sc-domain:example.com', countryCode: 'GB' },
    { site: 'sc-domain:example.com', includeSerps: true },
    {
      site: 'sc-domain:example.com',
      includeSerps: true,
      countryCode: 'GB',
      languageCode: 'en',
      location: { name: 'London,England,United Kingdom' },
      serpLimit: 4,
    },
    { site: 'sc-domain:example.com', maxRows: 50_001 },
    {
      site: 'sc-domain:example.com',
      locationTerms: Array.from({ length: 101 }, (_, index) => `area ${index}`),
    },
  ]) {
    assert.equal(
      captured.schema?.safeParse(input).success,
      false,
      JSON.stringify(input),
    )
  }
})
