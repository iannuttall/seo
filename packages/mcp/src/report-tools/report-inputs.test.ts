import assert from 'node:assert/strict'
import test from 'node:test'
import * as z from 'zod/v4'
import { registerAiOpportunityTools } from '../ai-opportunity-tools.js'
import { registerDiagnosisTools } from '../diagnosis-tools.js'
import { registerExperimentTools } from '../experiment-tools.js'
import { registerOpportunityTools } from '../opportunity-tools.js'
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

test('AI referrals MCP bounds rows and validates agent inputs', () => {
  const schema = inputSchema(
    captureTools(registerAiOpportunityTools),
    'seo_ai_referrals',
  )

  assert.equal(
    schema.safeParse({
      property: '123',
      startDate: '2026-06-01',
      endDate: '2026-06-28',
      maxRows: 100_000,
      refresh: true,
    }).success,
    true,
  )
  assert.equal(
    schema.safeParse({
      property: '123',
      startDate: '28daysAgo',
      endDate: 'yesterday',
    }).success,
    true,
  )
  for (const input of [
    { property: '' },
    { property: '123', maxRows: 0 },
    { property: '123', maxRows: 1.5 },
    { property: '123', maxRows: 100_001 },
    { property: '123', startDate: 'last month' },
  ]) {
    assert.equal(schema.safeParse(input).success, false)
  }
})

test('query opportunity MCP bounds retained evidence inputs', () => {
  const tools = captureTools(registerAiOpportunityTools)
  for (const name of ['seo_to_ai_query', 'seo_community_intent']) {
    const schema = inputSchema(tools, name)
    assert.equal(
      schema.safeParse({
        site: 'sc-domain:example.com',
        startDate: '2026-06-01',
        endDate: '2026-06-28',
        limit: 100,
        minImpressions: 0,
        maxRows: 50_000,
        brandTerms: ['Example'],
        refresh: true,
      }).success,
      true,
    )
    for (const input of [
      { site: '' },
      { site: 'sc-domain:example.com', days: 0 },
      { site: 'sc-domain:example.com', days: 1.5 },
      { site: 'sc-domain:example.com', limit: 101 },
      { site: 'sc-domain:example.com', minImpressions: -1 },
      { site: 'sc-domain:example.com', maxRows: 50_001 },
      { site: 'sc-domain:example.com', startDate: 'last month' },
      { site: 'sc-domain:example.com', brandTerms: [''] },
    ]) {
      assert.equal(
        schema.safeParse(input).success,
        false,
        `${name}: ${JSON.stringify(input)}`,
      )
    }
  }
})

test('segment impact MCP bounds comparison and evidence inputs', () => {
  const schema = inputSchema(
    captureTools(registerDiagnosisTools),
    'seo_segment_impact',
  )

  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      dimension: 'page',
      days: 240,
      compareDays: 240,
      startDate: '2026-05-01',
      endDate: '2026-05-28',
      limit: 100,
      unmatchedLimit: 0,
      maxRows: 250_000,
      refresh: true,
    }).success,
    true,
  )
  for (const input of [
    { site: '' },
    { site: 'sc-domain:example.com', days: 0 },
    { site: 'sc-domain:example.com', days: 241 },
    { site: 'sc-domain:example.com', compareDays: 1.5 },
    { site: 'sc-domain:example.com', startDate: 'last month' },
    { site: 'sc-domain:example.com', limit: 101 },
    { site: 'sc-domain:example.com', unmatchedLimit: -1 },
    { site: 'sc-domain:example.com', maxRows: 250_001 },
  ]) {
    assert.equal(schema.safeParse(input).success, false)
  }
})

test('change measurement MCP bounds equal-window inputs', () => {
  const schema = inputSchema(
    captureTools(registerExperimentTools),
    'seo_measure_change',
  )

  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      scope: 'page',
      target: 'https://example.com/page',
      changedAt: '2026-06-01',
      beforeDays: 28,
      afterDays: 28,
    }).success,
    true,
  )
  for (const input of [
    { site: '' },
    { site: 'sc-domain:example.com', changedAt: 'last month' },
    { site: 'sc-domain:example.com', beforeDays: 0 },
    { site: 'sc-domain:example.com', beforeDays: 1.5 },
    { site: 'sc-domain:example.com', afterDays: 549 },
    { site: 'sc-domain:example.com', target: '' },
  ]) {
    assert.equal(schema.safeParse(input).success, false)
  }
})

test('cannibal MCP bounds discovery inputs and accepts brand terms', () => {
  const schema = inputSchema(
    captureTools(registerOpportunityTools),
    'seo_cannibal',
  )

  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      days: 548,
      limit: 100,
      minImpressions: 0,
      brandTerms: ['Example'],
      refresh: true,
    }).success,
    true,
  )
  for (const input of [
    { site: 'sc-domain:example.com', days: 0 },
    { site: 'sc-domain:example.com', limit: 101 },
    { site: 'sc-domain:example.com', minImpressions: -1 },
    { site: 'sc-domain:example.com', brandTerms: [''] },
  ]) {
    assert.equal(schema.safeParse(input).success, false)
  }
})

test('decaying MCP bounds comparison inputs and accepts brand terms', () => {
  const schema = inputSchema(
    captureTools(registerOpportunityTools),
    'seo_decaying',
  )

  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      days: 548,
      limit: 100,
      comparison: 'year-over-year',
      minDropPct: 100,
      minPreviousClicks: 0,
      minClickLoss: 0,
      brandTerms: ['Example'],
      refresh: true,
    }).success,
    true,
  )
  for (const input of [
    { site: 'sc-domain:example.com', days: 0 },
    { site: 'sc-domain:example.com', limit: 101 },
    { site: 'sc-domain:example.com', comparison: 'weekly' },
    { site: 'sc-domain:example.com', minDropPct: 101 },
    { site: 'sc-domain:example.com', minPreviousClicks: -1 },
    { site: 'sc-domain:example.com', brandTerms: [''] },
  ]) {
    assert.equal(schema.safeParse(input).success, false)
  }
})

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

test('quick-wins MCP bounds output, verification, fetch, and brand inputs', () => {
  const schema = inputSchema(
    captureTools(registerOpportunityTools),
    'seo_quick_wins',
  )

  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      days: 548,
      minImpressions: 0,
      limit: 100,
      verifyLimit: 0,
      brandTerms: ['Example'],
      fetchConcurrency: 16,
    }).success,
    true,
  )
  for (const input of [
    { site: 'sc-domain:example.com', days: 549 },
    { site: 'sc-domain:example.com', limit: 101 },
    { site: 'sc-domain:example.com', minImpressions: -1 },
    { site: 'sc-domain:example.com', verifyLimit: 1.5 },
    { site: 'sc-domain:example.com', fetchConcurrency: 17 },
    { site: 'sc-domain:example.com', brandTerms: [''] },
  ]) {
    assert.equal(schema.safeParse(input).success, false)
  }
})

test('internal-links MCP bounds matching, checking, fetch, and brand inputs', () => {
  const schema = inputSchema(
    captureTools(registerOpportunityTools),
    'seo_internal_links',
  )

  assert.equal(
    schema.safeParse({
      site: 'sc-domain:example.com',
      targetUrl: 'https://example.com/target',
      days: 548,
      limit: 100,
      checkLimit: 200,
      minImpressions: 0,
      brandTerms: ['Example'],
      fetchIntervalMs: 60_000,
    }).success,
    true,
  )
  for (const input of [
    {
      site: 'sc-domain:example.com',
      targetUrl: 'ftp://example.com/target',
    },
    {
      site: 'sc-domain:example.com',
      targetUrl: 'https://example.com/target',
      days: 0,
    },
    {
      site: 'sc-domain:example.com',
      targetUrl: 'https://example.com/target',
      checkLimit: 201,
    },
    {
      site: 'sc-domain:example.com',
      targetUrl: 'https://example.com/target',
      fetchIntervalMs: 99,
    },
    {
      site: 'sc-domain:example.com',
      targetUrl: 'https://example.com/target',
      brandTerms: [''],
    },
  ]) {
    assert.equal(schema.safeParse(input).success, false)
  }
})
