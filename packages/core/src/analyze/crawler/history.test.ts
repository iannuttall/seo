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
