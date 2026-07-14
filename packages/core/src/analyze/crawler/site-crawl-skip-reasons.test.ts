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
    /Left 26 eligible same-origin URLs unqueued to keep this crawl bounded/,
  )
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
