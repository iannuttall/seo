import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type CrawlIssue,
  crawlConfigHash,
  crawlReportId,
  createCrawlReport,
  groupCrawlIssues,
  normalizeCrawlConfig,
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

test('crawlReportId is stable for equivalent configs and scoped by site', () => {
  const a = crawlReportId({
    config: { url: 'https://example.com', include: ['/b', '/a'] },
    site: 'sc-domain:example.com',
  })
  const b = crawlReportId({
    config: { url: 'https://example.com/', include: ['/a', '/b'] },
    site: 'sc-domain:example.com',
  })
  const c = crawlReportId({
    config: { url: 'https://example.com/', include: ['/a', '/b'] },
    site: 'sc-domain:other.example',
  })
  const d = crawlReportId({
    config: { url: 'https://example.com/', include: ['/a', '/b'] },
    site: 'sc-domain:example.com',
    ga4PropertyId: '123',
  })

  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.notEqual(a, d)
  assert.match(a, /^crawl_[a-f0-9]{20}$/)
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
        indexable: true,
        wordCount: 100,
        contentHash: 'a',
        outgoingInternalCount: 1,
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
  assert.match(report.id, /^crawl_[a-f0-9]{20}$/)
  assert.equal(report.summary.totalPages, 2)
  assert.equal(report.summary.statusErrors, 1)
  assert.equal(report.summary.discoveredUrls, 2)
  assert.equal(report.summary.queuedUrls, 2)
  assert.equal(report.summary.crawledUrls, 2)
  assert.equal(report.summary.skippedUrls, 0)
  assert.equal(report.summary.failedUrls, 1)
  assert.equal(report.summary.verifiedLinks, 1)
  assert.equal(report.summary.healthScore, 40)
  assert.equal(report.summary.geoReadinessScore, 15)
  assert.equal(report.summary.highIssues, 2)
  assert.equal(report.summary.mediumIssues, 1)
  assert.equal(report.summary.avgResponseMs, 200)
  assert.deepEqual(report.summary.byStatus, { '200': 1, '404': 1 })
  assert.equal(report.pages[0]?.seoScore, 70)
  assert.equal(report.pages[1]?.seoScore, 10)
  assert.equal(report.issueGroups[0]?.ruleId, 'missing_title')
  assert.equal(report.issueGroups[0]?.count, 2)
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
