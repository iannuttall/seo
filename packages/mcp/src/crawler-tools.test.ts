import assert from 'node:assert/strict'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { test } from 'node:test'
import { registerCrawlerTools } from './crawler-tools.js'

type JsonRecord = Record<string, unknown>
type CapturedTool = {
  config: JsonRecord
  handler: (input: JsonRecord) => Promise<JsonRecord>
}

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        ;(server as Server).close((error) => {
          if (error) reject(error)
          else resolve()
        })
      }),
  }
}

function keys(value: unknown): string[] {
  return Object.keys((value ?? {}) as JsonRecord).sort()
}

function firstRecord(value: unknown): JsonRecord {
  assert.ok(Array.isArray(value))
  assert.ok(value[0] && typeof value[0] === 'object')
  return value[0] as JsonRecord
}

function captureCrawlerTools(): Map<string, CapturedTool> {
  const tools = new Map<string, CapturedTool>()
  registerCrawlerTools({
    registerTool(
      name: string,
      config: JsonRecord,
      handler: (input: JsonRecord) => Promise<JsonRecord>,
    ) {
      tools.set(name, { config, handler })
    },
  } as never)
  return tools
}

function mcpCrawlerKeySnapshot(result: JsonRecord) {
  const structured = result.structuredContent as JsonRecord
  const firstFix = firstRecord(structured.topFixes)
  const dataSources = structured.dataSources as JsonRecord
  return {
    root: keys(result),
    contentItem: keys(firstRecord(result.content)),
    structured: keys(structured),
    summary: keys(structured.summary),
    dataSources: keys(dataSources),
    searchConsole: keys(dataSources.searchConsole),
    analytics: keys(dataSources.analytics),
    topFix: keys(firstFix),
    topFixScoreFactors: keys(firstFix.scoreFactors),
    topFixVerification: keys(firstFix.verification),
  }
}

test('crawler MCP structured output schema stays stable', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/llms.txt') {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain')
      res.end('missing')
      return
    }
    res.setHeader('content-type', 'text/html')
    res.end(
      '<title>MCP schema snapshot fixture page</title><h1>MCP schema snapshot fixture</h1><p>This page intentionally omits metadata, social tags, and schema so MCP contract tests have stable crawler issues.</p>',
    )
  })

  try {
    const tools = captureCrawlerTools()
    const crawlTool = tools.get('seo_crawl_site')
    assert.ok(crawlTool)
    assert.deepEqual(keys(crawlTool.config.inputSchema), [
      'concurrency',
      'exclude',
      'fetchIntervalCap',
      'fetchIntervalMs',
      'ga4PropertyId',
      'include',
      'includeIssues',
      'includePages',
      'js',
      'maxDepth',
      'maxPages',
      'refresh',
      'respectRobots',
      'saveReport',
      'site',
      'url',
      'useSitemap',
    ])

    const result = await crawlTool.handler({
      url: fixture.baseUrl,
      maxPages: 1,
      useSitemap: false,
      respectRobots: true,
    })

    assert.deepEqual(mcpCrawlerKeySnapshot(result), {
      root: ['content', 'structuredContent'],
      contentItem: ['text', 'type'],
      structured: [
        'caveats',
        'configHash',
        'dataSources',
        'definitionId',
        'headline',
        'id',
        'requestEvidenceStatus',
        'status',
        'summary',
        'topFixes',
        'warnings',
      ],
      dataSources: ['analytics', 'searchConsole'],
      searchConsole: [
        'joinedMetricPages',
        'joinedQueryPages',
        'pageLimit',
        'pageLimitReached',
        'queriedPages',
        'retainedRowLimitReached',
        'status',
        'totalPages',
        'warning',
      ],
      analytics: [
        'joinedPages',
        'queriedPages',
        'retainedRowLimit',
        'retainedRowLimitReached',
        'status',
        'totalPages',
        'warning',
      ],
      summary: [
        'abortedRequests',
        'attemptedRequests',
        'avgRequestMs',
        'avgResponseMs',
        'byCategory',
        'byStatus',
        'crawledUrls',
        'discoveredUrls',
        'extractionFailures',
        'failedRequests',
        'failedUrls',
        'geoReadinessScore',
        'geoScorePages',
        'healthScore',
        'highIssues',
        'indexablePages',
        'lowIssues',
        'mediumIssues',
        'nonIndexablePages',
        'queuedUrls',
        'requestByStatus',
        'responseRequests',
        'skippedUrls',
        'statusErrors',
        'technicalScorePages',
        'totalPages',
        'verifiedLinks',
      ],
      topFix: [
        'category',
        'count',
        'howToFix',
        'howToVerify',
        'ruleId',
        'sampleUrls',
        'score',
        'scoreFactors',
        'severity',
        'title',
        'verification',
        'whyThisRanks',
      ],
      topFixScoreFactors: [
        'affectedUrls',
        'avgPosition',
        'clicks',
        'conversions',
        'effort',
        'effortScore',
        'impressions',
        'searchVisibleUrls',
        'sessions',
        'severity',
        'totalUsers',
      ],
      topFixVerification: ['command', 'expected'],
    })

    const topFixTool = tools.get('seo_top_fixes')
    const affectedTool = tools.get('seo_affected_urls')
    assert.ok(topFixTool)
    assert.ok(affectedTool)
    const topFixResult = await topFixTool.handler({
      url: fixture.baseUrl,
      maxPages: 1,
    })
    const affectedResult = await affectedTool.handler({
      url: fixture.baseUrl,
      maxPages: 1,
    })
    const topFixStructured = topFixResult.structuredContent as JsonRecord
    const affectedStructured = affectedResult.structuredContent as JsonRecord
    assert.deepEqual(keys(topFixStructured.dataSources), [
      'analytics',
      'searchConsole',
    ])
    assert.deepEqual(keys(affectedStructured), [
      'affectedUrls',
      'caveats',
      'dataSources',
      'reportId',
      'url',
      'warnings',
    ])

    const okfTool = tools.get('seo_okf_build')
    assert.ok(okfTool)
    assert.deepEqual(keys(okfTool.config.inputSchema), [
      'fetchIntervalCap',
      'fetchIntervalMs',
      'includeFiles',
      'maxConcepts',
      'maxPages',
      'refresh',
      'reportId',
      'site',
      'title',
      'url',
    ])
    const okf = await okfTool.handler({
      url: fixture.baseUrl,
      maxPages: 1,
      maxConcepts: 1,
    })
    const okfStructured = okf.structuredContent as JsonRecord
    assert.deepEqual(keys(okfStructured), ['manifest', 'validation'])
    assert.equal('files' in okfStructured, false)
    assert.deepEqual(keys(okfStructured.manifest), [
      'caveats',
      'conceptCount',
      'crawlStatus',
      'filePaths',
      'generatedAt',
      'reportId',
      'rootTitle',
      'schemaVersion',
      'selection',
      'sourceUrl',
      'warnings',
    ])
  } finally {
    await fixture.close()
  }
})
