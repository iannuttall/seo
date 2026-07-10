import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL('./index.js', import.meta.url))

type JsonRecord = Record<string, unknown>

async function runSeo(args: string[]): Promise<string> {
  const result = await execFileAsync(process.execPath, [cliPath, ...args], {
    env: {
      ...process.env,
      CI: '1',
      NO_UPDATE_NOTIFIER: '1',
    },
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  })
  return result.stdout
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

function crawlerJsonKeySnapshot(payload: JsonRecord) {
  const firstIssue = firstRecord(payload.issues)
  const firstGroup = firstRecord(payload.issueGroups)
  const firstFix = firstRecord(payload.topFixes)
  return {
    root: keys(payload),
    config: keys(payload.config),
    fetchRate: keys((payload.config as JsonRecord).fetchRate),
    summary: keys(payload.summary),
    issue: keys(firstIssue),
    issueGroup: keys(firstGroup),
    topFix: keys(firstFix),
    topFixScoreFactors: keys(firstFix.scoreFactors),
    topFixVerification: keys(firstFix.verification),
  }
}

test('crawler CLI JSON output schema stays stable', async () => {
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
      '<title>Schema snapshot fixture page</title><h1>Schema snapshot fixture</h1><p>This page intentionally omits metadata, social tags, and schema so JSON contract tests have stable crawler issues.</p>',
    )
  })

  try {
    const output = await runSeo([
      'crawl',
      fixture.baseUrl,
      '--max-pages',
      '1',
      '--no-sitemap',
      '--no-external',
      '--json',
    ])
    const payload = JSON.parse(output) as JsonRecord

    assert.deepEqual(crawlerJsonKeySnapshot(payload), {
      root: [
        'ai',
        'caveats',
        'config',
        'configHash',
        'definitionId',
        'generatedAt',
        'id',
        'issueGroups',
        'issues',
        'pages',
        'requestEvidenceStatus',
        'requests',
        'status',
        'summary',
        'topFixes',
        'warnings',
      ],
      config: [
        'checkExternal',
        'concurrency',
        'exclude',
        'fetchRate',
        'include',
        'js',
        'maxDepth',
        'maxPages',
        'mode',
        'refresh',
        'respectRobots',
        'timeoutMs',
        'url',
        'urls',
        'useSitemap',
      ],
      fetchRate: ['concurrency'],
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
      issue: ['category', 'evidence', 'ruleId', 'severity', 'title', 'url'],
      issueGroup: [
        'category',
        'count',
        'ruleId',
        'sampleUrls',
        'severity',
        'title',
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
  } finally {
    await fixture.close()
  }
})

test('crawler CLI exits unsuccessfully when no document can be fetched', async () => {
  const fixture = await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.setHeader('content-type', 'text/plain')
      res.end('User-agent: *\nAllow: /\n')
      return
    }
    if (req.url === '/broken') {
      res.destroy()
      return
    }
    res.statusCode = 404
    res.setHeader('content-type', 'text/plain')
    res.end('missing')
  })

  try {
    let failure: unknown
    try {
      await runSeo([
        'crawl',
        `${fixture.baseUrl}/broken`,
        '--max-pages',
        '1',
        '--no-sitemap',
        '--no-external',
        '--json',
      ])
    } catch (error) {
      failure = error
    }

    const result = failure as { code?: number; stdout?: string }
    assert.equal(result.code, 1)
    const payload = JSON.parse(result.stdout ?? '') as JsonRecord
    assert.equal(payload.status, 'failed')
    assert.equal((payload.pages as unknown[]).length, 0)
  } finally {
    await fixture.close()
  }
})
