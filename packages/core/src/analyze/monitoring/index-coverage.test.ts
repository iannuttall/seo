import assert from 'node:assert/strict'
import test from 'node:test'
import type { GscRow } from '../../types.js'
import type { CrawlReport } from '../crawler/report.js'
import {
  analyzeIndexCoverageSignals,
  type IndexCoverageInput,
} from './index-coverage.js'
import type { CrawlPageSnapshot } from './types.js'

const GENERATED_AT = '2026-07-10T09:00:00.000Z'

function page(
  url: string,
  input: Partial<CrawlPageSnapshot> = {},
): CrawlPageSnapshot {
  return {
    url,
    finalUrl: url,
    status: 200,
    indexable: true,
    declaredIndexability: 'indexable-candidate',
    wordCount: 100,
    contentHash: url,
    outgoingInternalCount: 0,
    ...input,
  }
}

function gscRow(
  url: string,
  input: Partial<Omit<GscRow, 'keys'>> = {},
): GscRow {
  return {
    keys: [url],
    clicks: 1,
    impressions: 10,
    ctr: 0.1,
    position: 5,
    ...input,
  }
}

function baseInput(
  overrides: Partial<IndexCoverageInput> = {},
): IndexCoverageInput {
  return {
    generatedAt: GENERATED_AT,
    crawl: {
      pages: [],
      completeness: 'complete',
    },
    searchConsole: {
      rows: [],
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      rowLimit: 25_000,
      completeness: 'complete',
    },
    ...overrides,
  }
}

test('separates retained visibility, crawl candidates, controls, and source-only URLs', () => {
  const report = analyzeIndexCoverageSignals(
    baseInput({
      crawl: {
        pages: [
          page('https://EXAMPLE.com:443/visible#result'),
          page('https://example.com/candidate'),
          page('https://example.com/blocked', {
            indexable: false,
            declaredIndexability: 'noindex',
            metaRobots: 'noindex',
          }),
        ],
        completeness: 'complete',
      },
      sitemap: {
        urls: [
          'https://example.com/visible',
          'https://example.com/candidate',
          'https://example.com/sitemap-only',
          'https://example.com/sitemap-visible',
        ],
        completeness: 'complete',
      },
      searchConsole: {
        rows: [
          gscRow('https://example.com/visible', {
            clicks: 2,
            impressions: 20,
            position: 4,
          }),
          gscRow('https://example.com/visible#ignored', {
            clicks: 1,
            impressions: 10,
            position: 10,
          }),
          gscRow('https://example.com/blocked'),
          gscRow('https://example.com/gsc-only'),
          gscRow('https://example.com/sitemap-visible'),
          gscRow('https://example.com/zero', {
            clicks: 0,
            impressions: 0,
            ctr: 0,
            position: 0,
          }),
          gscRow('not a URL'),
          gscRow('https://example.com/invalid-metrics', {
            clicks: 2,
            impressions: 1,
          }),
        ],
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        rowLimit: 8,
        completeness: 'complete',
      },
    }),
  )

  assert.deepEqual(report.summary, {
    uniqueUrlsAcrossSources: 6,
    retainedSearchVisibleUrls: 4,
    crawlableCandidatesWithoutRetainedSearchVisibility: 1,
    blockedOrNonIndexableCrawlUrls: 1,
    sitemapOnlyUrls: 1,
    searchConsoleOnlyUrls: 1,
    repeatedTemplateClustersForReview: 0,
  })
  assert.deepEqual(
    report.retainedSearchVisibility.items.map((item) => item.url),
    [
      'https://example.com/visible',
      'https://example.com/blocked',
      'https://example.com/gsc-only',
      'https://example.com/sitemap-visible',
    ],
  )
  assert.deepEqual(report.retainedSearchVisibility.items[0], {
    url: 'https://example.com/visible',
    clicks: 3,
    impressions: 30,
    ctr: 0.1,
    position: 6,
    sourceRows: 2,
    sources: { crawl: true, sitemap: true, searchConsole: true },
    crawlIndexable: true,
  })
  assert.deepEqual(
    report.crawlableWithoutRetainedSearchVisibility.items.map(
      (item) => item.url,
    ),
    ['https://example.com/candidate'],
  )
  assert.deepEqual(report.blockedOrNonIndexable.items, [
    {
      url: 'https://example.com/blocked',
      status: 200,
      declaredIndexability: 'noindex',
      reasons: ['noindex'],
      inSitemap: false,
      hasRetainedSearchVisibility: true,
    },
  ])
  assert.equal(report.sources.searchConsole.invalidUrls, 1)
  assert.equal(report.sources.searchConsole.invalidMetricRows, 1)
  assert.equal(report.sources.searchConsole.zeroImpressionRows, 1)
  assert.equal(report.sources.searchConsole.rowLimitReached, false)
  assert.equal(
    report.sources.searchConsole.semantics,
    'retained-search-analytics-page-rows',
  )
  assert.match(
    report.caveats.join('\n'),
    /Rows with zero impressions were excluded/,
  )
  assert.doesNotMatch(
    JSON.stringify(report),
    /indexedNoTraffic|indexed_no_traffic/,
  )
})

test('does not invent an absence comparison when Search Console is unavailable', () => {
  const report = analyzeIndexCoverageSignals({
    generatedAt: GENERATED_AT,
    crawl: {
      pages: [page('https://example.com/a'), page('https://example.com/b')],
      completeness: 'partial',
      rowLimit: 100,
      rowLimitReached: false,
    },
  })

  assert.equal(
    report.summary.crawlableCandidatesWithoutRetainedSearchVisibility,
    0,
  )
  assert.equal(report.templateReview.eligibleUrlCount, 0)
  assert.equal(report.sources.searchConsole.completeness, 'unavailable')
  assert.equal(report.sources.sitemap.completeness, 'unavailable')
  assert.match(
    report.caveats.join('\n'),
    /absence-from-search comparisons are not available/,
  )
  assert.match(report.caveats.join('\n'), /crawl source is not complete/)
})

test('derives retained crawl completeness from a saved crawl report', () => {
  const savedCrawl = {
    status: 'completed',
    config: { maxPages: 1 },
    summary: { pageLimitReached: true },
    pages: [page('https://example.com/retained')],
  } as CrawlReport
  const report = analyzeIndexCoverageSignals(
    baseInput({ crawl: { report: savedCrawl } }),
  )

  assert.equal(report.sources.crawl.completeness, 'truncated')
  assert.equal(report.sources.crawl.rowLimit, 1)
  assert.equal(report.sources.crawl.rowLimitReached, true)
  assert.equal(report.sources.crawl.semantics, 'local-crawl-page-snapshots')
})

test('keeps exact totals and caveats when retained sources are truncated', () => {
  const report = analyzeIndexCoverageSignals(
    baseInput({
      crawl: {
        pages: [
          page('https://example.com/a'),
          page('https://example.com/b'),
          page('https://example.com/c'),
        ],
        completeness: 'truncated',
        rowLimit: 3,
        rowLimitReached: true,
      },
      sitemap: {
        urls: [
          'https://example.com/sitemap-a',
          'https://example.com/sitemap-b',
          'https://example.com/sitemap-c',
        ],
        completeness: 'truncated',
        rowLimit: 3,
        rowLimitReached: true,
      },
      searchConsole: {
        rows: [],
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        rowLimit: 1,
        completeness: 'truncated',
      },
      limits: { itemsPerSection: 2 },
    }),
  )

  assert.deepEqual(report.crawlableWithoutRetainedSearchVisibility, {
    count: 3,
    returned: 2,
    omitted: 1,
    items: [
      {
        url: 'https://example.com/a',
        status: 200,
        declaredIndexability: 'indexable-candidate',
        inSitemap: false,
      },
      {
        url: 'https://example.com/b',
        status: 200,
        declaredIndexability: 'indexable-candidate',
        inSitemap: false,
      },
    ],
  })
  assert.equal(report.sitemapOnly.count, 3)
  assert.equal(report.sitemapOnly.returned, 2)
  assert.equal(report.sitemapOnly.omitted, 1)
  assert.deepEqual(report.limits, {
    itemsPerSection: 2,
    templateClusters: 50,
    templateSamples: 5,
  })
  assert.equal(report.sources.crawl.rowLimitReached, true)
  assert.equal(report.sources.searchConsole.rowLimitReached, true)
  assert.match(
    report.caveats.join('\n'),
    /Search Console source is not complete/,
  )
  assert.match(report.caveats.join('\n'), /discovery hint/)
})

test('groups repeated Unicode-aware URL templates for review at explicit thresholds', () => {
  const urls = [
    'https://example.com/locations/london-seo',
    'https://example.com/locations/paris-seo',
    'https://example.com/locations/東京-seo',
    'https://example.com/locations/münchen-seo',
    'https://example.com/about',
  ]
  const report = analyzeIndexCoverageSignals(
    baseInput({
      crawl: {
        pages: urls.map((url) => page(url)),
        completeness: 'complete',
      },
      templateThresholds: { minUrls: 4, minShare: 0.5 },
      limits: { templateClusters: 1, templateSamples: 3 },
    }),
  )

  assert.equal(report.templateReview.eligibleUrlCount, 5)
  assert.equal(report.templateReview.count, 1)
  assert.equal(report.templateReview.returned, 1)
  assert.equal(report.templateReview.omitted, 0)
  assert.equal(report.templateReview.clusters[0]?.signature, '/locations/:slug')
  assert.equal(report.templateReview.clusters[0]?.urlCount, 4)
  assert.equal(report.templateReview.clusters[0]?.sampleUrls.length, 3)
  assert.match(report.caveats.join('\n'), /grouped for review only/)
})

test('is deterministic when crawl, sitemap, and provider row order changes', () => {
  const pages = [
    page('https://example.com/places/東京-seo'),
    page('https://example.com/places/london-seo'),
    page('https://example.com/noindex', {
      indexable: false,
      declaredIndexability: 'noindex',
    }),
  ]
  const sitemap = [
    'https://example.com/sitemap-only',
    'https://example.com/places/london-seo',
  ]
  const rows = [
    gscRow('https://example.com/visible', {
      clicks: 1,
      impressions: 7,
      position: 3.25,
    }),
    gscRow('https://example.com/visible', {
      clicks: 2,
      impressions: 11,
      position: 6.75,
    }),
  ]
  const input = (reverse: boolean): IndexCoverageInput =>
    baseInput({
      crawl: {
        pages: reverse ? [...pages].reverse() : pages,
        completeness: 'complete',
      },
      sitemap: {
        urls: reverse ? [...sitemap].reverse() : sitemap,
        completeness: 'complete',
      },
      searchConsole: {
        rows: reverse ? [...rows].reverse() : rows,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        rowLimit: 25_000,
        completeness: 'complete',
      },
    })

  assert.deepEqual(
    analyzeIndexCoverageSignals(input(false)),
    analyzeIndexCoverageSignals(input(true)),
  )
})
