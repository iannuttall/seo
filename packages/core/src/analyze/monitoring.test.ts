import assert from 'node:assert/strict'
import test from 'node:test'
import {
  type CrawlPageSnapshot,
  compareCrawlPages,
  recommendCrawlDiffItem,
} from './monitoring.js'

const page = (input: Partial<CrawlPageSnapshot>): CrawlPageSnapshot => ({
  url: 'https://example.com/',
  finalUrl: 'https://example.com/',
  status: 200,
  title: 'Title',
  metaDescription: 'Description',
  canonical: 'https://example.com/',
  h1: 'Heading',
  indexable: true,
  wordCount: 500,
  contentHash: 'a',
  outgoingInternalCount: 2,
  ...input,
})

test('recommendCrawlDiffItem prioritizes new error statuses', () => {
  const recommendation = recommendCrawlDiffItem({
    kind: 'changed',
    url: 'https://example.com/broken',
    changes: ['status'],
    before: page({ status: 200 }),
    after: page({ status: 404 }),
  })

  assert.equal(recommendation?.severity, 'high')
  assert.equal(recommendation?.category, 'status')
  assert.match(recommendation?.action ?? '', /301/)
})

test('recommendCrawlDiffItem explains lost indexability', () => {
  const recommendation = recommendCrawlDiffItem({
    kind: 'changed',
    url: 'https://example.com/noindex',
    changes: ['indexability'],
    before: page({ indexable: true }),
    after: page({ indexable: false, metaRobots: 'noindex' }),
  })

  assert.equal(recommendation?.severity, 'high')
  assert.equal(recommendation?.category, 'indexability')
  assert.match(recommendation?.action ?? '', /noindex/)
})

test('compareCrawlPages detects added, removed, and changed URLs', () => {
  const result = compareCrawlPages({
    previous: [
      page({ url: 'https://example.com/a', title: 'Old' }),
      page({ url: 'https://example.com/removed' }),
    ],
    current: [
      page({ url: 'https://example.com/a', title: 'New' }),
      page({ url: 'https://example.com/new' }),
    ],
  })

  assert.deepEqual(
    result.map((item) => [item.kind, item.url, item.changes]),
    [
      ['changed', 'https://example.com/a', ['title']],
      ['added', 'https://example.com/new', ['url_added']],
      ['removed', 'https://example.com/removed', ['url_removed']],
    ],
  )
})
