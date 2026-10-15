import assert from 'node:assert/strict'
import test from 'node:test'
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
