import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { TELEMETRY_REPORTS } from '@seo/core'
import { createServer, startMcpServer } from './index.js'
import { REPORT_DEPTH } from './report-depth.js'
import { REPORT_GUIDANCE } from './report-guidance.js'
import {
  getReportDefinition,
  listReportDefinitions,
} from './report-registry.js'

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
    'agent-readiness',
    'ai-readiness',
    'ai-referrals',
    'ai-search-scorecard',
    'audit-page',
    'audit-urls',
    'bing-webmaster-overview',
    'cannibalisation',
    'community-intent',
    'compare-crawls',
    'content-optimization',
    'crawl-diff',
    'crawl-history',
    'crawl-report',
    'crawler-rules',
    'ctr-underperformers',
    'decaying-pages',
    'entity-readiness',
    'explain-crawl-issue',
    'generate-llms-txt',
    'geo-gaps',
    'index-coverage',
    'index-coverage-plan',
    'index-monitor',
    'index-watch',
    'internal-links',
    'link-evidence',
    'link-recovery',
    'llms-txt-audit',
    'measure-change',
    'monthly-action-plan',
    'monthly-report',
    'narrative-report',
    'okf-build',
    'okf-validate',
    'page-opportunities',
    'performance-audit',
    'pseo-audit',
    'query-clusters',
    'quick-wins',
    'redirect-trace',
    'refresh-priorities',
    'search-performance-overview',
    'second-page',
    'segment-impact',
    'seo-to-ai-query',
    'setup-check',
    'site-crawl',
    'striking-distance',
    'technical-watch',
    'top-fixes',
    'traffic-anomaly',
    'update-correlation',
    'update-postmortem',
  ])
  for (const excluded of [
    'client',
    'clients',
    'content-groups',
    'change-log',
    'gsc-query',
    'google-analytics-run-report',
    'semrush-call',
  ]) {
    assert.equal(ids.includes(excluded), false, excluded)
  }
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(Object.keys(REPORT_GUIDANCE).sort(), ids)
  assert.deepEqual([...TELEMETRY_REPORTS].sort(), ids)
  for (const report of reports) {
    assert.ok(report.name.length > 0, report.id)
    assert.ok(report.description.length > 0, report.id)
  }
  for (const [id, guidance] of Object.entries(REPORT_GUIDANCE)) {
    assert.ok(guidance.useWhen.length >= 1 && guidance.useWhen.length <= 3, id)
    assert.ok(
      guidance.avoidWhen.length >= 1 && guidance.avoidWhen.length <= 2,
      id,
    )
    assert.ok(guidance.outcome.length > 0, id)
  }
})

test('every report has populated depth guidance with valid related ids', () => {
  const reports = listReportDefinitions()
  const ids = new Set(reports.map((report) => report.id))
  assert.deepEqual(Object.keys(REPORT_DEPTH).sort(), [...ids].sort())

  for (const report of reports) {
    const definition = getReportDefinition(report.id)
    assert.ok(definition, report.id)
    assert.ok(
      definition.readOrder.length >= 3 && definition.readOrder.length <= 6,
      `${report.id} readOrder length`,
    )
    assert.ok(
      definition.readOrder.every((entry) => entry.length > 0),
      `${report.id} readOrder entries`,
    )
    assert.ok(
      definition.doNotClaim.length >= 2 && definition.doNotClaim.length <= 4,
      `${report.id} doNotClaim length`,
    )
    assert.ok(
      definition.doNotClaim.every((entry) => entry.length > 0),
      `${report.id} doNotClaim entries`,
    )
    assert.ok(definition.verify.length > 0, `${report.id} verify`)
    assert.ok(definition.related.length <= 4, `${report.id} related count`)
    for (const item of definition.related) {
      assert.ok(item.reason.length > 0, `${report.id} related reason`)
      assert.notEqual(item.id, report.id, `${report.id} self-related`)
      assert.ok(ids.has(item.id), `${report.id} related id ${item.id}`)
    }
  }
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
          report.description.length > 0 &&
          typeof report.name === 'string' &&
          report.name.length > 0 &&
          !('useWhen' in report) &&
          !('avoidWhen' in report) &&
          !('outcome' in report) &&
          !('readOrder' in report) &&
          !('doNotClaim' in report) &&
          !('verify' in report) &&
          !('related' in report),
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
    assert.equal(report.name, 'Single-page SEO audit')
    assert.equal(
      report.description,
      'Check one URL for response, indexability, metadata, headings, links, and page content evidence.',
    )
    assert.deepEqual(report.useWhen, [
      'One page needs a technical review before you change it.',
      'A broader report points to a specific URL.',
    ])
    assert.deepEqual(report.avoidWhen, [
      'You need to discover issues across a whole site.',
      'The page requires a logged-in browser session.',
    ])
    assert.equal(
      report.outcome,
      'A page-level audit that separates observed evidence from review advice.',
    )
    assert.ok(
      Array.isArray(report.readOrder) &&
        (report.readOrder as unknown[]).length > 0,
    )
    assert.ok(
      Array.isArray(report.doNotClaim) &&
        (report.doNotClaim as unknown[]).length > 0,
    )
    assert.equal(typeof report.verify, 'string')
    assert.ok((report.verify as string).length > 0)
    assert.ok(Array.isArray(report.related))
    for (const item of report.related as Array<JsonRecord>) {
      assert.equal(typeof item.id, 'string')
      assert.equal(typeof item.reason, 'string')
    }
    assert.deepEqual(inputSchema.required, ['url'])
    assert.equal((properties.url as JsonRecord).format, 'uri')
    assert.equal(inputSchema.additionalProperties, false)

    const listedRules = structured(
      await client.callTool({
        name: 'seo_describe_report',
        arguments: { id: 'crawler-rules' },
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
        id: 'crawler-rules',
        params: { category: 'not-a-category' },
      },
    })
    assert.equal(resultRecord(invalidRuleCategory).isError, true)
    const invalidRuleError = structured(invalidRuleCategory).error as JsonRecord
    assert.equal(invalidRuleError.code, 'INVALID_INPUT')
    assert.match(
      String(invalidRuleError.message),
      /Invalid parameters for crawler-rules/,
    )

    const success = await client.callTool({
      name: 'seo_run_report',
      arguments: { id: 'crawler-rules', params: { category: 'metadata' } },
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

test('describe returns per-check fix guidance for agent-readiness', async () => {
  await withClient(async (client) => {
    const described = structured(
      await client.callTool({
        name: 'seo_describe_report',
        arguments: { id: 'agent-readiness' },
      }),
    )
    const report = described.report as JsonRecord
    assert.ok(Array.isArray(report.fixableChecks))
    assert.ok((report.fixableChecks as string[]).includes('link-headers'))

    const fix = structured(
      await client.callTool({
        name: 'seo_describe_report',
        arguments: { id: 'agent-readiness', check: 'link-headers' },
      }),
    )
    const fixReport = fix.report as JsonRecord
    assert.equal(fixReport.id, 'agent-readiness')
    assert.equal(fixReport.check, 'link-headers')
    const checkFix = fixReport.checkFix as JsonRecord
    for (const field of ['goal', 'fix', 'prompt', 'verify'] as const) {
      assert.ok(String(checkFix[field]).length > 0, field)
    }
    assert.ok(Array.isArray(checkFix.resources))

    const unknown = await client.callTool({
      name: 'seo_describe_report',
      arguments: { id: 'agent-readiness', check: 'not-a-check' },
    })
    assert.equal(resultRecord(unknown).isError, true)
    const unknownError = structured(unknown).error as JsonRecord
    assert.equal(unknownError.code, 'INVALID_INPUT')
    assert.match(String(unknownError.message), /Fix guidance exists for/)

    const noFixes = await client.callTool({
      name: 'seo_describe_report',
      arguments: { id: 'audit-page', check: 'anything' },
    })
    assert.equal(resultRecord(noFixes).isError, true)
    assert.match(
      String((structured(noFixes).error as JsonRecord).message),
      /no per-check fix guidance/,
    )
  })
})
