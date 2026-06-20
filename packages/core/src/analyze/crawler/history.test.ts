import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
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
      ['https://example.com/gone', ['status', 'seo_score']],
      ['https://example.com/noindex', ['indexability']],
    ],
  )
})
