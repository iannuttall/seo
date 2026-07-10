import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type CrawlIssue,
  type CrawlReport,
  crawlConfigHash,
  crawlDefinitionId,
  crawlRunId,
  createCrawlReport,
  groupCrawlIssues,
  normalizeCrawlConfig,
  normalizeLoadedCrawlReport,
} from './report.js'

test('normalizeCrawlConfig applies stable defaults', () => {
  const config = normalizeCrawlConfig({
    url: 'https://example.com',
    include: ['/blog', '/blog'],
    exclude: ['/tag', '/archive'],
  })

  assert.equal(config.url, 'https://example.com/')
  assert.equal(config.mode, 'site')
  assert.equal(config.maxPages, 500)
  assert.deepEqual(config.include, ['/blog'])
  assert.deepEqual(config.exclude, ['/archive', '/tag'])
  assert.equal(config.respectRobots, true)
  assert.equal(config.js, 'auto')
  assert.equal(config.refresh, false)
  assert.deepEqual(config.fetchRate, { concurrency: 8 })
})

test('normalizeCrawlConfig keeps fetch controls stable', () => {
  const config = normalizeCrawlConfig({
    url: 'https://example.com',
    concurrency: 3,
    refresh: true,
    fetchRate: {
      intervalCap: 2,
      intervalMs: 250,
    },
  })

  assert.equal(config.concurrency, 3)
  assert.equal(config.refresh, true)
  assert.deepEqual(config.fetchRate, {
    concurrency: 3,
    intervalCap: 2,
    intervalMs: 250,
  })
})

test('crawlConfigHash is stable for equivalent configs', () => {
  const a = crawlConfigHash({
    url: 'https://example.com',
    include: ['/b', '/a'],
  })
  const b = crawlConfigHash({
    url: 'https://example.com/',
    include: ['/a', '/b'],
  })

  assert.equal(a, b)
})

test('crawlDefinitionId is stable for equivalent configs and scoped by site', () => {
  const a = crawlDefinitionId({
    config: { url: 'https://example.com', include: ['/b', '/a'] },
    site: 'sc-domain:example.com',
  })
  const b = crawlDefinitionId({
    config: { url: 'https://example.com/', include: ['/a', '/b'] },
    site: 'sc-domain:example.com',
  })
  const c = crawlDefinitionId({
    config: { url: 'https://example.com/', include: ['/a', '/b'] },
    site: 'sc-domain:other.example',
  })
  const d = crawlDefinitionId({
    config: { url: 'https://example.com/', include: ['/a', '/b'] },
    site: 'sc-domain:example.com',
    ga4PropertyId: '123',
  })

  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.notEqual(a, d)
  assert.match(a, /^crawl_def_[a-f0-9]{20}$/)
})

test('crawlRunId creates a unique execution id', () => {
  const first = crawlRunId()
  const second = crawlRunId()

  assert.notEqual(first, second)
  assert.match(first, /^crawl_[a-f0-9]{32}$/)
})

test('createCrawlReport summarizes pages and grouped issues', () => {
  const issues: CrawlIssue[] = [
    {
      ruleId: 'missing_title',
      title: 'Title missing',
      category: 'metadata',
      severity: 'high',
      url: 'https://example.com/a',
    },
    {
      ruleId: 'missing_title',
      title: 'Title missing',
      category: 'metadata',
      severity: 'high',
      url: 'https://example.com/b',
    },
    {
      ruleId: 'h1_count',
      title: 'H1 structure issue',
      category: 'headings',
      severity: 'medium',
      url: 'https://example.com/b',
    },
  ]

  const report = createCrawlReport({
    config: { url: 'https://example.com' },
    generatedAt: '2026-06-19T00:00:00.000Z',
    pages: [
      {
        url: 'https://example.com/a',
        finalUrl: 'https://example.com/a',
        status: 200,
        contentType: 'text/html',
        indexable: true,
        wordCount: 100,
        contentHash: 'a',
        outgoingInternalCount: 1,
        sampleInternalLinks: ['https://example.com/b'],
        responseTimeMs: 100,
      },
      {
        url: 'https://example.com/b',
        finalUrl: 'https://example.com/b',
        status: 404,
        indexable: false,
        wordCount: 0,
        contentHash: 'b',
        outgoingInternalCount: 0,
        responseTimeMs: 300,
      },
    ],
    issues,
  })

  assert.equal(report.generatedAt, '2026-06-19T00:00:00.000Z')
  assert.match(report.id, /^crawl_[a-f0-9]{32}$/)
  assert.match(report.definitionId, /^crawl_def_[a-f0-9]{20}$/)
  assert.equal(report.summary.totalPages, 2)
  assert.equal(report.summary.statusErrors, 1)
  assert.equal(report.summary.discoveredUrls, 2)
  assert.equal(report.summary.queuedUrls, 2)
  assert.equal(report.summary.crawledUrls, 2)
  assert.equal(report.summary.skippedUrls, 0)
  assert.equal(report.summary.failedUrls, 1)
  assert.equal(report.summary.verifiedLinks, 1)
  assert.equal(report.summary.healthScore, 40)
  assert.equal(report.summary.technicalScorePages, 2)
  assert.equal(report.summary.geoReadinessScore, 40)
  assert.equal(report.summary.geoScorePages, 1)
  assert.equal(report.summary.highIssues, 2)
  assert.equal(report.summary.mediumIssues, 1)
  assert.equal(report.summary.avgResponseMs, 200)
  assert.equal(report.requestEvidenceStatus, 'unavailable')
  assert.equal(report.summary.attemptedRequests, 0)
  assert.deepEqual(report.summary.byStatus, { '200': 1, '404': 1 })
  assert.equal(report.pages[0]?.internalInlinkCount, 0)
  assert.equal(report.pages[0]?.internalLinkAuthorityScore, 0)
  assert.equal(report.pages[1]?.internalInlinkCount, 1)
  assert.equal(report.pages[1]?.internalLinkAuthorityScore, 100)
  assert.equal(report.pages[0]?.seoScore, 70)
  assert.equal(report.pages[1]?.seoScore, 10)
  assert.equal(report.issueGroups[0]?.ruleId, 'missing_title')
  assert.equal(report.issueGroups[0]?.count, 2)
})

test('createCrawlReport keeps request outcomes separate from documents', () => {
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    requests: [
      {
        requestedUrl: 'https://example.com/extraction-failed',
        outcome: 'response',
        finalUrl: 'https://example.com/extraction-failed',
        status: 200,
        durationMs: 100,
        extraction: 'failed',
        extractionError: 'Malformed response body',
      },
      {
        requestedUrl: 'https://missing.example/',
        outcome: 'failure',
        durationMs: 200,
        failureKind: 'dns',
        error: 'ENOTFOUND',
        extraction: 'not-applicable',
      },
      {
        requestedUrl: 'https://example.com/cancelled',
        outcome: 'failure',
        failureKind: 'aborted',
        error: 'Cancelled',
        extraction: 'not-applicable',
      },
    ],
  })

  assert.equal(report.requestEvidenceStatus, 'available')
  assert.equal(report.summary.totalPages, 0)
  assert.equal(report.summary.statusErrors, 0)
  assert.equal(report.summary.attemptedRequests, 3)
  assert.equal(report.summary.responseRequests, 1)
  assert.equal(report.summary.failedRequests, 1)
  assert.equal(report.summary.abortedRequests, 1)
  assert.equal(report.summary.extractionFailures, 1)
  assert.equal(report.summary.avgRequestMs, 150)
  assert.deepEqual(report.summary.requestByStatus, {
    '200': 1,
    'no-response': 1,
    aborted: 1,
  })
  assert.deepEqual(report.summary.byStatus, {})
  assert.deepEqual(
    report.issues.map((issue) => issue.ruleId),
    ['connection_error'],
  )
})

test('legacy report normalization preserves scores without media evidence', () => {
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [
      {
        url: 'https://example.com/',
        finalUrl: 'https://example.com/',
        status: 200,
        indexable: true,
        wordCount: 100,
        contentHash: 'legacy',
        outgoingInternalCount: 0,
      },
    ],
    issues: [],
  })
  if (report.pages[0]) {
    report.pages[0].seoScore = 82
    report.pages[0].geoScore = 64
  }
  const legacy = JSON.parse(JSON.stringify(report)) as CrawlReport
  delete (legacy as Partial<CrawlReport>).requests
  delete (legacy as Partial<CrawlReport>).requestEvidenceStatus

  const normalized = normalizeLoadedCrawlReport(legacy)

  assert.equal(normalized.requestEvidenceStatus, 'unavailable')
  assert.equal(normalized.pages[0]?.seoScore, 82)
  assert.equal(normalized.pages[0]?.geoScore, 64)
  assert.equal(normalized.summary.healthScore, 82)
  assert.equal(normalized.summary.geoReadinessScore, 64)
})

test('createCrawlReport orders request and document evidence deterministically', () => {
  const build = (reverse: boolean) =>
    createCrawlReport({
      config: { url: 'https://example.com/' },
      pages: (reverse
        ? ['https://example.com/b', 'https://example.com/a']
        : ['https://example.com/a', 'https://example.com/b']
      ).map((url) => ({
        url,
        finalUrl: url,
        status: 200,
        contentType: 'application/json',
        indexable: true,
        wordCount: 0,
        contentHash: url,
        outgoingInternalCount: 0,
      })),
      requests: (reverse
        ? ['https://example.com/b', 'https://example.com/a']
        : ['https://example.com/a', 'https://example.com/b']
      ).map((requestedUrl) => ({
        requestedUrl,
        outcome: 'response' as const,
        finalUrl: requestedUrl,
        status: 200,
        extraction: 'not-applicable' as const,
      })),
      warnings: reverse
        ? ['Warning B', 'Warning A']
        : ['Warning A', 'Warning B'],
    })

  const first = build(false)
  const second = build(true)

  assert.deepEqual(
    first.pages.map((page) => page.url),
    second.pages.map((page) => page.url),
  )
  assert.deepEqual(
    first.requests.map((request) => request.requestedUrl),
    second.requests.map((request) => request.requestedUrl),
  )
  assert.deepEqual(first.warnings, second.warnings)
})

test('createCrawlReport redacts tenant-unsafe payload strings', () => {
  const report = createCrawlReport({
    config: {
      url: 'https://example.com/private?token=abc123&ok=1',
      urls: ['https://example.com/queued?api_key=raw-key'],
    },
    generatedAt: '2026-06-19T00:00:00.000Z',
    pages: [
      {
        url: 'https://example.com/private?token=abc123&ok=1',
        finalUrl: 'https://example.com/private?token=abc123&ok=1',
        status: 200,
        responseHeaders: {
          authorization: 'Bearer raw-auth-token',
          'x-public': 'visible',
        },
        error:
          'Failed reading /Users/ian/.seo/token.json with password=hunter2',
        indexable: true,
        wordCount: 100,
        contentHash: 'tenant-hash',
        outgoingInternalCount: 0,
        outgoingExternalCount: 1,
        sampleExternalLinks: ['https://other.example/?signature=raw-signature'],
      },
    ],
    issues: [
      {
        ruleId: 'connection_error',
        title: 'Connection error',
        category: 'response',
        severity: 'high',
        url: 'https://example.com/private?token=abc123&ok=1',
        evidence: {
          token: 'abc123',
          log: '/tmp/seo/raw.log?secret=raw-secret',
        },
      },
    ],
    warnings: [
      'Token leaked at /Users/ian/.seo/token.json token=abc123 refresh_token=raw-refresh',
    ],
    caveats: ['Local cache path C:\\Users\\ian\\seo\\token.json was hidden.'],
  })

  const payload = JSON.stringify(report)
  assert.doesNotMatch(
    payload,
    /abc123|raw-key|raw-auth-token|hunter2|raw-signature|raw-secret|raw-refresh|\/Users\/ian|C:\\Users\\ian/,
  )
  assert.match(report.config.url, /token=\[redacted\]/)
  assert.match(report.config.urls[0] ?? '', /api_key=\[redacted\]/)
  assert.equal(report.pages[0]?.responseHeaders?.authorization, '[redacted]')
  assert.equal(report.pages[0]?.responseHeaders?.['x-public'], 'visible')
  assert.match(report.pages[0]?.error ?? '', /\[local-path\]/)
  assert.equal(report.issues[0]?.evidence?.token, '[redacted]')
  assert.match(report.warnings[0] ?? '', /\[local-path\]/)
  assert.match(report.caveats[0] ?? '', /\[local-path\]/)
})

test('groupCrawlIssues ranks severity before count', () => {
  const groups = groupCrawlIssues([
    {
      ruleId: 'h1_count',
      title: 'H1 structure issue',
      category: 'headings',
      severity: 'medium',
      url: 'https://example.com/a',
    },
    {
      ruleId: 'canonical_mismatch',
      title: 'Canonical differs from final URL',
      category: 'canonical',
      severity: 'medium',
      url: 'https://example.com/b',
    },
    {
      ruleId: 'missing_title',
      title: 'Title missing',
      category: 'metadata',
      severity: 'high',
      url: 'https://example.com/c',
    },
  ])

  assert.equal(groups[0]?.ruleId, 'missing_title')
})
