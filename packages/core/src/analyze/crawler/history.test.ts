import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  CrawlPageSnapshot,
  CrawlRequestObservation,
} from '../monitoring/types.js'
import { compareCrawlReports } from './history.js'
import { createCrawlReport } from './report.js'

function page(input: Partial<CrawlPageSnapshot> & { url: string }) {
  return {
    finalUrl: input.url,
    status: 200,
    indexable: true,
    wordCount: 250,
    contentHash: input.url,
    outgoingInternalCount: 0,
    ...input,
  } satisfies CrawlPageSnapshot
}

function response(url: string): CrawlRequestObservation {
  return {
    requestedUrl: url,
    outcome: 'response',
    finalUrl: url,
    status: 200,
    extraction: 'complete',
  }
}

test('compareCrawlReports summarizes saved snapshot changes', () => {
  const before = createCrawlReport({
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-01T00:00:00.000Z',
    config: { url: 'https://example.com/' },
    pages: [
      page({
        url: 'https://example.com/',
        title: 'Old home',
        contentHash: 'old',
      }),
      page({
        url: 'https://example.com/gone',
        status: 200,
        title: 'Gone soon',
      }),
      page({
        url: 'https://example.com/noindex',
        indexable: true,
      }),
    ],
  })
  const after = createCrawlReport({
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-02T00:00:00.000Z',
    config: { url: 'https://example.com/' },
    pages: [
      page({
        url: 'https://example.com/',
        title: 'New home',
        contentHash: 'new',
      }),
      page({
        url: 'https://example.com/gone',
        status: 404,
        title: 'Gone soon',
      }),
      page({
        url: 'https://example.com/noindex',
        indexable: false,
      }),
      page({
        url: 'https://example.com/new',
        title: 'New page',
      }),
    ],
  })

  const diff = compareCrawlReports({ before, after })

  assert.equal(diff.schemaVersion, 1)
  assert.equal(diff.before.id, before.id)
  assert.equal(diff.after.id, after.id)
  assert.equal(diff.before.configHash, before.configHash)
  assert.equal(diff.after.configHash, after.configHash)
  assert.equal(diff.before.requestScope.startUrl, 'https://example.com/')
  assert.equal(diff.completeness.status, 'partial')
  assert.equal(diff.comparability.status, 'review-required')
  assert.equal(diff.summary.addedPages, 1)
  assert.equal(diff.summary.changedPages, 3)
  assert.equal(diff.summary.newStatusErrors, 1)
  assert.equal(diff.summary.indexabilityFlips, 1)
  assert.equal(diff.summary.titleChanges, 1)
  assert.match(diff.headline, /regressions/)
  assert.equal(diff.topActions[0]?.title, 'New status errors appeared')
  assert.deepEqual(
    diff.pageChanges
      .filter((item) => item.kind === 'changed')
      .map((item) => [item.url, item.changes]),
    [
      ['https://example.com/', ['title', 'content']],
      ['https://example.com/gone', ['status']],
      ['https://example.com/noindex', ['indexability']],
    ],
  )
})

test('compareCrawlReports marks complete matching inputs as comparable', () => {
  const config = {
    url: 'https://example.com/',
    maxPages: 50,
    maxDepth: 4,
    include: ['/docs/'],
    exclude: ['/private/'],
    js: 'on' as const,
  }
  const before = createCrawlReport({
    id: 'crawl_before',
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-01T00:00:00.000Z',
    config,
    pages: [page({ url: 'https://example.com/', title: 'Before' })],
    requests: [response('https://example.com/')],
  })
  const after = createCrawlReport({
    id: 'crawl_after',
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-02T00:00:00.000Z',
    config,
    pages: [page({ url: 'https://example.com/', title: 'After' })],
    requests: [response('https://example.com/')],
  })

  const diff = compareCrawlReports({ before, after })

  assert.deepEqual(diff.before.caps, {
    maxPages: 50,
    maxDepth: 4,
    timeoutMs: 20_000,
    searchConsolePageLimit: undefined,
    searchConsoleRetainedRowLimit: undefined,
    analyticsRetainedRowLimit: undefined,
  })
  assert.deepEqual(diff.before.requestScope, {
    startUrl: 'https://example.com/',
    mode: 'site',
    explicitUrls: [],
    include: ['/docs/'],
    exclude: ['/private/'],
    respectRobots: true,
    useSitemap: true,
    checkExternal: true,
    js: 'on',
  })
  assert.equal(diff.before.definitionId, before.definitionId)
  assert.equal(diff.before.status, 'completed')
  assert.equal(diff.before.requestEvidenceStatus, 'available')
  assert.equal(diff.before.completeness.status, 'complete')
  assert.equal(diff.after.completeness.status, 'complete')
  assert.equal(diff.completeness.status, 'complete')
  assert.equal(diff.completeness.truncated, false)
  assert.deepEqual(diff.comparability, {
    status: 'comparable',
    sameDefinitionId: true,
    sameConfigHash: true,
    sameSite: true,
    sameStartUrl: true,
    sameMode: true,
    sameRequestScope: true,
    sameCaps: true,
  })
  assert.deepEqual(diff.caveats, [])
})

test('compareCrawlReports keeps deliberate skips out of partial evidence', () => {
  const build = (id: string, generatedAt: string) =>
    createCrawlReport({
      id,
      generatedAt,
      config: { url: 'https://example.com/' },
      pages: [page({ url: 'https://example.com/' })],
      requests: [response('https://example.com/')],
      stats: {
        skippedUrls: 2,
        skipReasonCounts: {
          'asset-url': 1,
          'off-origin': 1,
        },
      },
    })

  const diff = compareCrawlReports({
    before: build('crawl_before_skips', '2026-06-01T00:00:00.000Z'),
    after: build('crawl_after_skips', '2026-06-02T00:00:00.000Z'),
  })

  assert.equal(diff.before.completeness.status, 'complete')
  assert.equal(diff.after.completeness.status, 'complete')
  assert.deepEqual(diff.before.completeness.skippedUrlsByImpact, {
    coverageAffecting: 0,
    nonImpacting: 2,
  })
  assert.deepEqual(diff.before.completeness.reasons, [])
  assert.equal(diff.completeness.status, 'complete')
})

test('compareCrawlReports marks coverage-affecting skips as partial', () => {
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages: [page({ url: 'https://example.com/' })],
    requests: [response('https://example.com/')],
    stats: {
      skippedUrls: 1,
      skipReasonCounts: { 'robots-uncertain': 1 },
    },
  })

  const diff = compareCrawlReports({ before: report, after: report })

  assert.equal(diff.before.completeness.status, 'partial')
  assert.deepEqual(diff.before.completeness.reasons, [
    'coverage-affecting-urls-skipped',
  ])
})

test('compareCrawlReports exposes caps, truncation, and scope caveats', () => {
  const before = createCrawlReport({
    id: 'crawl_before_partial',
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-01T00:00:00.000Z',
    status: 'partial',
    config: {
      url: 'https://example.com/',
      mode: 'list',
      urls: ['https://example.com/a'],
      maxPages: 1,
      maxDepth: 1,
    },
    pages: [page({ url: 'https://example.com/a' })],
    requests: [response('https://example.com/a')],
    requestEvidenceStatus: 'partial',
    stats: { pageLimitReached: true },
    dataSources: {
      searchConsole: {
        status: 'partial',
        totalPages: 1,
        queriedPages: 1,
        joinedMetricPages: 0,
        joinedQueryPages: 0,
        pageLimit: 1,
        pageLimitReached: true,
        retainedRowLimit: 1_000,
        retainedRowLimitReached: true,
      },
      analytics: {
        status: 'skipped',
        totalPages: 1,
        queriedPages: 0,
        joinedPages: 0,
      },
    },
    warnings: ['One request was still in flight.'],
    caveats: ['Only the retained list was audited.'],
  })
  const after = createCrawlReport({
    id: 'crawl_after_different_scope',
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-02T00:00:00.000Z',
    config: {
      url: 'https://example.com/',
      mode: 'list',
      urls: ['https://example.com/b'],
      maxPages: 2,
      maxDepth: 2,
    },
    pages: [page({ url: 'https://example.com/b' })],
    requests: [response('https://example.com/b')],
  })

  const diff = compareCrawlReports({ before, after })

  assert.equal(diff.before.config.mode, 'list')
  assert.deepEqual(diff.before.requestScope.explicitUrls, [
    'https://example.com/a',
  ])
  assert.equal(diff.before.caps.searchConsolePageLimit, 1)
  assert.equal(diff.before.completeness.truncated, true)
  assert.deepEqual(diff.before.completeness.reasons, [
    'report-status-partial',
    'crawl-page-limit-reached',
    'request-evidence-partial',
    'search-console-page-limit-reached',
    'search-console-row-limit-reached',
    'search-console-partial',
  ])
  assert.equal(diff.comparability.sameRequestScope, false)
  assert.equal(diff.comparability.sameCaps, false)
  assert.equal(diff.comparability.status, 'review-required')
  assert.equal(diff.completeness.status, 'partial')
  assert.equal(diff.completeness.truncated, true)
  assert.ok(diff.caveats.some((item) => item.includes('request scopes')))
  assert.ok(diff.caveats.some((item) => item.includes('retained evidence')))
  assert.ok(diff.caveats.some((item) => item.includes('source warnings')))
})
