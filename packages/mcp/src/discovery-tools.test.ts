import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createServer, startMcpServer } from './index.js'
import { listReportDefinitions } from './report-registry.js'

type JsonRecord = Record<string, unknown>

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const server: McpServer = createServer()
  const client = new Client({ name: 'seo-mcp-test', version: '1.0.0' })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    return await run(client)
  } finally {
    await client.close()
    await server.close()
  }
}

function resultRecord(result: unknown): JsonRecord {
  assert.ok(result && typeof result === 'object')
  return result as JsonRecord
}

function structured(result: unknown): JsonRecord {
  const value = resultRecord(result).structuredContent
  assert.ok(value && typeof value === 'object')
  return value as JsonRecord
}

test('default MCP server exposes only the compact discovery surface', async () => {
  await withClient(async (client) => {
    const result = await client.listTools()
    assert.deepEqual(
      result.tools.map((tool) => tool.name),
      ['seo_list_reports', 'seo_describe_report', 'seo_run_report'],
    )
    assert.ok(result.tools.every((tool) => tool.outputSchema))
  })
})

test('report catalog is stable, sorted, and excludes raw or mutable tools', () => {
  const reports = listReportDefinitions()
  const ids = reports.map((report) => report.id)
  assert.deepEqual(ids, [
    'affected-urls',
    'ai-readiness',
    'ai-referrals',
    'audit-page',
    'audit-urls',
    'cannibal',
    'community-intent',
    'compare-crawl-reports',
    'content-optimization',
    'crawl-diff',
    'crawl-site',
    'ctr-underperformers',
    'decaying',
    'diagnose-property',
    'doctor',
    'entity-readiness',
    'explain-issue',
    'geo-gaps',
    'get-crawl-report',
    'index-coverage-plan',
    'index-monitor',
    'index-watch',
    'internal-links',
    'link-recover',
    'list-crawl-reports',
    'list-rules',
    'llms-txt-audit',
    'llms-txt-generate',
    'measure-change',
    'monthly-report',
    'okf-build',
    'okf-validate',
    'page-opportunities',
    'performance-audit',
    'pseo-audit',
    'query-cluster',
    'quick-wins',
    'redirect-trace',
    'report-narrative',
    'second-page',
    'segment-impact',
    'striking-distance',
    'to-ai-query',
    'top-fixes',
    'traffic-anomaly',
    'update-correlate',
    'workflow-diagnose-property',
    'workflow-monthly-report',
    'workflow-refresh-priorities',
    'workflow-technical-watch',
    'workflow-update-postmortem',
  ])
  for (const excluded of [
    'client',
    'clients',
    'content-groups',
    'change-log',
    'gsc-query',
    'ga4-run-report',
    'semrush-call',
  ]) {
    assert.equal(ids.includes(excluded), false, excluded)
  }
  assert.equal(new Set(ids).size, ids.length)
})

test('list and describe return compact ordered metadata and parameter schema', async () => {
  await withClient(async (client) => {
    const listed = structured(
      await client.callTool({
        name: 'seo_list_reports',
        arguments: { category: 'reporting' },
      }),
    )
    const reports = listed.reports as Array<JsonRecord>
    assert.deepEqual(
      reports.map((report) => report.id),
      [...reports.map((report) => report.id)].sort(),
    )
    assert.ok(reports.every((report) => report.category === 'reporting'))
    assert.ok(
      reports.every(
        (report) =>
          typeof report.description === 'string' &&
          report.description.length > 0,
      ),
    )

    const described = structured(
      await client.callTool({
        name: 'seo_describe_report',
        arguments: { id: 'audit-page' },
      }),
    )
    const report = described.report as JsonRecord
    const inputSchema = report.inputSchema as JsonRecord
    const properties = inputSchema.properties as JsonRecord
    assert.equal(report.id, 'audit-page')
    assert.equal(report.category, 'reporting')
    assert.deepEqual(inputSchema.required, ['url'])
    assert.equal((properties.url as JsonRecord).format, 'uri')
    assert.equal(inputSchema.additionalProperties, false)

    const listedRules = structured(
      await client.callTool({
        name: 'seo_describe_report',
        arguments: { id: 'list-rules' },
      }),
    )
    const ruleReport = listedRules.report as JsonRecord
    const ruleInputSchema = ruleReport.inputSchema as JsonRecord
    const ruleProperties = ruleInputSchema.properties as JsonRecord
    assert.deepEqual((ruleProperties.category as JsonRecord).enum, [
      'canonical',
      'content',
      'response',
      'headings',
      'images',
      'indexability',
      'international',
      'links',
      'metadata',
      'mobile',
      'performance',
      'security',
      'social',
      'structured-data',
      'geo',
    ])
  })
})

test('run validates the selected report and returns structured errors', async () => {
  await withClient(async (client) => {
    const unknown = await client.callTool({
      name: 'seo_run_report',
      arguments: { id: 'not-a-report' },
    })
    assert.equal(resultRecord(unknown).isError, true)
    assert.deepEqual(structured(unknown), {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Unknown report: not-a-report.',
        retryable: false,
      },
    })

    const invalid = await client.callTool({
      name: 'seo_run_report',
      arguments: {
        id: 'audit-page',
        params: { url: 'not a URL', unexpected: true },
      },
    })
    assert.equal(resultRecord(invalid).isError, true)
    const invalidError = structured(invalid).error as JsonRecord
    assert.equal(invalidError.code, 'INVALID_INPUT')
    assert.match(
      String(invalidError.message),
      /Invalid parameters for audit-page/,
    )

    const invalidRuleCategory = await client.callTool({
      name: 'seo_run_report',
      arguments: {
        id: 'list-rules',
        params: { category: 'not-a-category' },
      },
    })
    assert.equal(resultRecord(invalidRuleCategory).isError, true)
    const invalidRuleError = structured(invalidRuleCategory).error as JsonRecord
    assert.equal(invalidRuleError.code, 'INVALID_INPUT')
    assert.match(
      String(invalidRuleError.message),
      /Invalid parameters for list-rules/,
    )

    const success = await client.callTool({
      name: 'seo_run_report',
      arguments: { id: 'list-rules', params: { category: 'metadata' } },
    })
    const successResult = resultRecord(success)
    assert.equal(successResult.isError, undefined)
    const successData = structured(success)
    assert.ok(Array.isArray(successData.rules))
    assert.ok(
      (successData.rules as JsonRecord[]).every(
        (rule) => rule.category === 'metadata',
      ),
    )
    const content = successResult.content as Array<{
      type: string
      text?: string
    }>
    assert.match(
      content.find((item) => item.type === 'text')?.text ?? '',
      /crawler rules/,
    )
  })
})

test('test mode constructs the real discovery server', async () => {
  await startMcpServer({ test: true })
})
