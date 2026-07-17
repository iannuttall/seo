import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SEO_CRAWLER_IDENTITY } from '../../fetch/crawler-identity.js'
import {
  isCompatibleTechnicalBaseline,
  resolveTechnicalBaseline,
  type TechnicalBaselineDependencies,
} from './baseline.js'
import type { CrawlReport } from './report.js'

function crawlReport(
  input: {
    status?: CrawlReport['status']
    url?: string
    maxPages?: number
    maxDepth?: number
    include?: string[]
  } = {},
): CrawlReport {
  return {
    id: 'crawl_123',
    definitionId: 'crawl_definition_123',
    generatedAt: '2026-07-11T00:00:00.000Z',
    configHash: 'config_hash_123',
    status: input.status ?? 'completed',
    config: {
      url: input.url ?? 'https://example.com/',
      mode: 'site',
      strategy: 'full',
      urls: [],
      maxPages: input.maxPages ?? 100,
      maxDepth: input.maxDepth ?? 4,
      concurrency: 8,
      timeoutMs: 20_000,
      include: input.include ?? [],
      exclude: [],
      respectRobots: true,
      useSitemap: true,
      checkExternal: false,
      checkAgentDiscovery: false,
      js: 'off',
      refresh: false,
      fetchRate: { concurrency: 8 },
    },
    summary: {
      totalPages: 1,
      statusOnlyPages: 0,
      indexablePages: 1,
      nonIndexablePages: 0,
      statusErrors: 0,
      discoveredUrls: 1,
      queuedUrls: 1,
      crawledUrls: 1,
      skippedUrls: 0,
      skipReasons: [],
      skippedUrlsByImpact: {
        coverageAffecting: 0,
        nonImpacting: 0,
      },
      failedUrls: 0,
      observedInternalLinks: 0,
      pageLimitReached: false,
      attemptedRequests: 1,
      responseRequests: 1,
      failedRequests: 0,
      abortedRequests: 0,
      extractionFailures: 0,
      requestByStatus: { '200': 1 },
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
      byStatus: { '200': 1 },
      byCategory: {},
    },
    access: {
      crawler: SEO_CRAWLER_IDENTITY,
      blockedRequests: 0,
      providers: {},
      samples: [],
      sampleLimit: 10,
      truncated: false,
    },
    requestEvidenceStatus: 'available',
    requests: [],
    pages: [],
    issues: [],
    issueGroups: [],
    warnings: [],
    caveats: [],
  }
}

function dependencies(input: {
  existing?: CrawlReport
  result?: CrawlReport
  error?: Error
}) {
  const saved: CrawlReport[] = []
  const crawlInputs: Array<Record<string, unknown>> = []
  const deps: TechnicalBaselineDependencies = {
    latestCrawlReport: () => input.existing,
    crawlSite: async (crawlInput) => {
      crawlInputs.push(crawlInput)
      if (input.error) throw input.error
      return input.result ?? crawlReport()
    },
    saveCrawlReport: (report) => {
      saved.push(report)
      return {
        id: report.id,
        configHash: report.configHash,
        url: report.config.url,
        status: report.status,
        totalPages: report.summary.totalPages,
        issueCount: report.issues.length,
        createdAt: report.generatedAt,
        storageVersion: 5,
      }
    },
    now: () => new Date('2026-07-11T00:00:00.000Z'),
  }
  return { deps, saved, crawlInputs }
}

test('reuses a saved crawl that covers the requested report scope', async () => {
  const existing = crawlReport({ url: 'https://example.com/' })
  const { deps, crawlInputs } = dependencies({ existing })

  const baseline = await resolveTechnicalBaseline(
    { site: 'sc-domain:example.com', url: 'https://example.com/blog/' },
    deps,
  )

  assert.equal(baseline.status, 'reused')
  assert.equal(baseline.report, existing)
  assert.equal(crawlInputs.length, 0)
})

test('creates and saves a bounded crawl when no compatible baseline exists', async () => {
  const created = crawlReport()
  const { deps, saved, crawlInputs } = dependencies({ result: created })

  const baseline = await resolveTechnicalBaseline(
    {
      site: 'sc-domain:example.com',
      searchSite: 'sc-domain:example.com',
      url: 'https://example.com/',
      projectId: 'example',
      googleAnalyticsPropertyId: '123',
    },
    deps,
  )

  assert.equal(baseline.status, 'created')
  assert.equal(saved[0], created)
  assert.deepEqual(crawlInputs[0], {
    url: 'https://example.com/',
    site: 'sc-domain:example.com',
    projectId: 'example',
    googleAnalyticsPropertyId: '123',
    mode: 'site',
    maxPages: 100,
    maxDepth: 4,
    respectRobots: true,
    useSitemap: true,
    checkExternal: false,
    js: false,
    refresh: false,
  })
})

test('does not join Google data for a direct-url technical baseline', async () => {
  const created = crawlReport()
  const { deps, crawlInputs } = dependencies({ result: created })

  await resolveTechnicalBaseline(
    { site: 'https://example.com', url: 'https://example.com/' },
    deps,
  )

  assert.equal(crawlInputs[0]?.site, undefined)
  assert.equal(crawlInputs[0]?.googleAnalyticsPropertyId, undefined)
})

test('refreshes even when a compatible crawl is saved', async () => {
  const existing = crawlReport()
  const created = crawlReport()
  const { deps, crawlInputs } = dependencies({ existing, result: created })

  const baseline = await resolveTechnicalBaseline(
    {
      site: 'sc-domain:example.com',
      url: 'https://example.com/',
      refresh: true,
    },
    deps,
  )

  assert.equal(baseline.status, 'refreshed')
  assert.equal(crawlInputs.length, 1)
})

test('skips all crawl evidence when requested', async () => {
  const { deps, crawlInputs } = dependencies({})

  const baseline = await resolveTechnicalBaseline(
    { site: 'sc-domain:example.com', crawl: false },
    deps,
  )

  assert.equal(baseline.status, 'skipped')
  assert.match(baseline.reason ?? '', /--no-crawl/)
  assert.equal(crawlInputs.length, 0)
})

test('does not save a failed crawl as report evidence', async () => {
  const { deps, saved } = dependencies({
    result: crawlReport({ status: 'failed' }),
  })

  const baseline = await resolveTechnicalBaseline(
    { site: 'sc-domain:example.com', url: 'https://example.com/' },
    deps,
  )

  assert.equal(baseline.status, 'unavailable')
  assert.equal(saved.length, 0)
})

test('rejects restricted crawls as a report baseline', () => {
  assert.equal(
    isCompatibleTechnicalBaseline(crawlReport({ include: ['/blog/*'] }), {
      url: 'https://example.com/',
    }),
    false,
  )
})

test('does not reuse a stale crawl baseline', async () => {
  const existing = {
    ...crawlReport(),
    generatedAt: '2026-07-03T00:00:00.000Z',
  }
  const { deps, crawlInputs } = dependencies({ existing })

  const baseline = await resolveTechnicalBaseline(
    { site: 'sc-domain:example.com', url: 'https://example.com/' },
    deps,
  )

  assert.equal(baseline.status, 'created')
  assert.equal(crawlInputs.length, 1)
})
