import assert from 'node:assert/strict'
import test from 'node:test'
import { shortestCrawlDepths } from './crawl-depths.js'

test('crawl depths propagate shorter paths without repeated graph passes', () => {
  const pages = [
    { url: 'https://example.com/', crawlDepth: 0 },
    { url: 'https://example.com/a', crawlDepth: 6 },
    { url: 'https://example.com/b', crawlDepth: 7 },
    { url: 'https://example.com/unlinked', crawlDepth: 4 },
  ]
  const graph = {
    'https://example.com/': ['https://example.com/a'],
    'https://example.com/a': ['https://example.com/b'],
    'https://example.com/b': ['https://example.com/missing'],
  }

  assert.deepEqual(shortestCrawlDepths(pages, graph), [0, 1, 2, 4])
})
