import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectAccessBlock } from '../../fetch/access-block.js'
import { SEO_CRAWLER_USER_AGENT } from '../../fetch/crawler-identity.js'
import type { CrawlOneResult } from '../monitoring/crawl-page.js'
import { completeSitemapResult } from '../monitoring/sitemap-test-fixture.js'
import { crawlSite } from './site-crawl.js'
import { crawlPageSnapshot } from './site-crawl.test-fixtures.js'

function statusResult(
  requestedUrl: string,
  input: { finalUrl?: string; status?: number } = {},
): CrawlOneResult {
  const finalUrl = input.finalUrl ?? requestedUrl
  const status = input.status ?? 200
  return {
    request: {
      requestedUrl,
      outcome: 'response',
      finalUrl,
      status,
      contentType: 'text/html',
      extraction: 'not-applicable',
      ...(finalUrl !== requestedUrl
        ? {
            redirectChain: [
              { url: requestedUrl, status: 301, location: finalUrl },
            ],
          }
        : {}),
    },
    page: crawlPageSnapshot(finalUrl, {
      finalUrl,
      status,
      auditScope: 'status',
      contentAuditAllowed: false,
      indexable: false,
      indexability: 'Not evaluated by status-only health probe',
      declaredIndexability: 'unknown',
      extractionStatus: 'not-applicable',
      title: undefined,
      metaDescription: undefined,
      h1: undefined,
      h1Count: undefined,
      wordCount: 0,
      contentHash: '',
      geo: undefined,
    }),
    urls: [],
  }
}

test('health strategy uses an explicit sitemap and limits analysis to responses', async () => {
  const sitemapUrl = 'https://example.com/custom-index.xml'
  const urls = [
    'https://example.com/ok',
    'https://example.com/old',
    'https://example.com/missing',
  ]
  const report = await crawlSite(
    {
      url: 'https://example.com/',
      mode: 'sitemap',
      strategy: 'health',
      sitemapUrl,
      maxPages: 10,
      checkExternal: true,
      js: 'on',
    },
    {
      fetchSitemapUrls: async (input) => {
        assert.equal(input.sitemapUrl, sitemapUrl)
        return completeSitemapResult(input.sitemapUrl, urls)
      },
      fetchStatusPage: async (url, options) => {
        assert.ok(options)
        assert.ok(options.robotsResolver)
        return url.endsWith('/old')
          ? statusResult(url, { finalUrl: 'https://example.com/new' })
          : url.endsWith('/missing')
            ? statusResult(url, { status: 404 })
            : statusResult(url)
      },
    },
  )

  assert.equal(report.config.strategy, 'health')
  assert.equal(report.config.sitemapUrl, sitemapUrl)
  assert.equal(report.config.js, 'off')
  assert.equal(report.config.checkExternal, false)
  assert.equal(report.config.refresh, true)
  assert.equal(report.sitemapDiscovery?.roots[0]?.source, 'explicit')
  assert.equal(report.summary.totalPages, 3)
  assert.equal(report.summary.statusOnlyPages, 3)
  assert.equal(report.summary.indexablePages, 0)
  assert.equal(report.summary.nonIndexablePages, 0)
  assert.equal(report.access.crawler.userAgent, SEO_CRAWLER_USER_AGENT)
  assert.equal(report.dataSources?.searchConsole.status, 'skipped')
  assert.equal(report.dataSources?.analytics.status, 'skipped')
  assert.equal(report.ai, undefined)
  assert.equal(report.externalLinkVerification, undefined)
  assert.equal(report.pages[0]?.responseHeaders, undefined)
  assert.equal(report.pages[0]?.fetchDiagnostics, undefined)
  assert.equal(report.pages[0]?.robotsTxt, undefined)
  assert.ok(
    report.requests.some(
      (request) =>
        request.outcome === 'response' &&
        request.redirectChain?.[0]?.status === 301,
    ),
  )
  assert.deepEqual(
    [...new Set(report.issues.map((issue) => issue.ruleId))].sort(),
    ['client_error', 'redirected_url'],
  )
  assert.equal(
    report.issues.some((issue) => issue.ruleId === 'missing_title'),
    false,
  )
})

test('health strategy marks access-blocked evidence partial', async () => {
  const url = 'https://example.com/protected'
  const accessBlock = detectAccessBlock({
    status: 403,
    headers: { 'cf-mitigated': 'challenge', 'cf-ray': 'test-LHR' },
  })
  assert.ok(accessBlock)

  const report = await crawlSite(
    {
      url: 'https://example.com/',
      strategy: 'health',
      sitemapUrl: 'https://example.com/sitemap.xml',
      maxPages: 1,
    },
    {
      fetchSitemapUrls: async (input) =>
        completeSitemapResult(input.sitemapUrl, [url]),
      fetchStatusPage: async () => {
        const result = statusResult(url, { status: 403 })
        if (result.request?.outcome === 'response') {
          result.request.accessBlock = accessBlock
        }
        return result
      },
    },
  )

  assert.equal(report.status, 'partial')
  assert.equal(report.access.blockedRequests, 1)
  assert.equal(report.issues[0]?.ruleId, 'crawler_access_blocked')
})
