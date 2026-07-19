import assert from 'node:assert/strict'
import test from 'node:test'
import { Response } from 'undici'
import { crawlSite } from './site-crawl.js'
import { crawlPageSnapshot } from './site-crawl.test-fixtures.js'

test('crawlSite classifies bounded queue skips separately from deliberate skips', async () => {
  const calls: string[] = []
  let activeFetches = 0
  let maxActiveFetches = 0
  const rootLinks = [
    ...Array.from(
      { length: 40 },
      (_, index) => `https://example.com/page-${index}`,
    ),
    ...Array.from(
      { length: 10 },
      (_, index) => `https://example.com/asset-${index}.pdf`,
    ),
    'https://external.example/offsite-a',
    'https://external.example/offsite-b',
  ]

  const report = await crawlSite(
    {
      url: 'https://example.com/',
      useSitemap: false,
      checkExternal: false,
      maxPages: 3,
      maxDepth: 5,
      concurrency: 2,
    },
    {
      fetch: async () =>
        new Response('# llms', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      fetchPage: async (url) => {
        calls.push(url)
        activeFetches += 1
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
        await new Promise((resolve) => setTimeout(resolve, 5))
        activeFetches -= 1
        const urls = url.endsWith('/') ? rootLinks : []
        return {
          urls,
          page: crawlPageSnapshot(url, {
            outgoingInternalCount: urls.length,
            sampleInternalLinks: urls.slice(0, 25),
          }),
        }
      },
    },
  )

  assert.equal(report.status, 'partial')
  assert.equal(report.summary.skippedUrls, 38)
  assert.deepEqual(report.summary.skipReasons, [
    { reason: 'asset-url', impact: 'non-impacting', count: 10 },
    { reason: 'off-origin', impact: 'non-impacting', count: 2 },
    {
      reason: 'queue-safety-limit',
      impact: 'coverage-affecting',
      count: 26,
    },
  ])
  assert.deepEqual(report.summary.skippedUrlsByImpact, {
    coverageAffecting: 26,
    nonImpacting: 12,
  })
  assert.equal(report.summary.queuedUrls, 15)
  assert.equal(report.summary.crawledUrls, 3)
  assert.equal(maxActiveFetches, 2)
  assert.equal(calls.length, 3)
  assert.match(
    report.caveats.join('\n'),
    /Left 26 unique eligible same-origin URLs unqueued to keep this crawl bounded/,
  )
})

test('crawlSite counts each queue-safety URL once across source pages', async () => {
  const repeatedUrls = Array.from(
    { length: 20 },
    (_, index) => `https://docs.example.test/deferred-${index}`,
  )
  const report = await crawlSite(
    {
      url: 'https://docs.example.test/',
      useSitemap: false,
      checkExternal: false,
      maxPages: 2,
      concurrency: 1,
      respectRobots: false,
      js: 'off',
    },
    {
      fetch: async () => new Response('', { status: 404 }),
      fetchStatusPage: async (url) => ({
        request: {
          requestedUrl: url,
          outcome: 'response',
          finalUrl: url,
          status: 404,
          extraction: 'not-applicable',
        },
        urls: [],
      }),
      fetchPage: async (url) => ({
        page: crawlPageSnapshot(url, {
          outgoingInternalCount: repeatedUrls.length,
          sampleInternalLinks: repeatedUrls,
        }),
        urls: repeatedUrls,
      }),
    },
  )

  assert.equal(report.summary.queuedUrls, 10)
  assert.equal(report.summary.skippedUrls, 11)
  assert.deepEqual(report.summary.skipReasons, [
    {
      reason: 'queue-safety-limit',
      impact: 'coverage-affecting',
      count: 11,
    },
  ])
})

test('crawlSite classifies origin backpressure as coverage-affecting', async () => {
  const root = 'https://example.com/'
  const protectedUrl = 'https://example.com/slow'
  const report = await crawlSite(
    {
      url: root,
      useSitemap: false,
      respectRobots: false,
      maxPages: 10,
      maxDepth: 1,
      concurrency: 1,
    },
    {
      fetch: async () =>
        new Response('', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        }),
      fetchPage: async (url) =>
        url === root
          ? { urls: [protectedUrl], page: crawlPageSnapshot(url) }
          : {
              urls: [],
              request: {
                requestedUrl: url,
                outcome: 'skipped',
                reason: 'origin-backpressure',
                error:
                  'Origin backpressure stopped fetches for example.com: 4 consecutive slow responses',
                extraction: 'not-applicable',
              },
            },
    },
  )

  assert.equal(report.status, 'partial')
  assert.deepEqual(report.summary.skipReasons, [
    {
      reason: 'origin-backpressure',
      impact: 'coverage-affecting',
      count: 1,
    },
  ])
  assert.equal(report.summary.failedUrls, 0)
  assert.equal(report.summary.failedRequests, 0)
  assert.equal(
    report.issues.some((issue) => issue.ruleId === 'connection_error'),
    false,
  )
  assert.match(report.caveats.join('\n'), /incomplete crawl evidence/)
})

test('crawlSite returns partial evidence before memory use becomes unsafe', async () => {
  const root = 'https://example.com/'
  const urls = [root, 'https://example.com/a', 'https://example.com/b']
  const externalUrl = 'https://external.example/link'
  let memoryChecks = 0
  let providerCalls = 0
  let agentDiscoveryCalls = 0
  let externalLinkCalls = 0
  const report = await crawlSite(
    {
      url: root,
      mode: 'list',
      urls,
      site: 'sc-domain:example.com',
      googleAnalyticsPropertyId: 'properties/123',
      useSitemap: false,
      checkExternal: true,
      checkAgentDiscovery: true,
      maxPages: urls.length,
      concurrency: 1,
    },
    {
      fetch: async (url) => {
        if (String(url) === externalUrl) externalLinkCalls += 1
        return new Response('', {
          status: 404,
          headers: { 'content-type': 'text/plain' },
        })
      },
      fetchPage: async (url) => ({
        urls: [],
        page: crawlPageSnapshot(url, {
          sampleExternalLinks: [externalUrl],
        }),
      }),
      queryPageMetrics: async () => {
        providerCalls += 1
        return undefined
      },
      queryPageTopQuery: async () => {
        providerCalls += 1
        return undefined
      },
      fetchLandingPageValues: async () => {
        providerCalls += 1
        throw new Error('analytics provider should not run')
      },
      collectAgentDiscovery: async () => {
        agentDiscoveryCalls += 1
        throw new Error('agent discovery should not run')
      },
      totalMemory: () => 16 * 1024 * 1024 * 1024,
      memoryUsage: () => {
        const pressured = memoryChecks++ > 0
        return {
          rss: (pressured ? 900 : 128) * 1024 * 1024,
          heapUsed: (pressured ? 700 : 100) * 1024 * 1024,
          external: 1 * 1024 * 1024,
        }
      },
    },
  )

  assert.equal(report.status, 'partial')
  assert.equal(report.summary.totalPages, 1)
  assert.deepEqual(report.summary.skipReasons, [
    {
      reason: 'memory-pressure',
      impact: 'coverage-affecting',
      count: 2,
    },
  ])
  assert.equal(providerCalls, 0)
  assert.equal(agentDiscoveryCalls, 0)
  assert.equal(externalLinkCalls, 0)
  assert.equal(report.externalLinkVerification, undefined)
  assert.equal(report.agentDiscovery, undefined)
  assert.match(
    report.dataSources?.searchConsole.warning ?? '',
    /memory safety limit/,
  )
  assert.match(
    report.dataSources?.analytics.warning ?? '',
    /memory safety limit/,
  )
  assert.match(report.warnings.join('\n'), /memory use could become unsafe/)
  assert.match(report.caveats.join('\n'), /Left 2 eligible URLs unchecked/)
})
