import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CrawlUrlQueue } from './crawl-url-queue.js'

test('crawl URL queue orders by depth then URL without duplicate entries', () => {
  const queue = new CrawlUrlQueue()
  queue.push({ url: 'https://example.com/b', depth: 1 })
  queue.push({ url: 'https://example.com/a', depth: 1 })
  queue.push({ url: 'https://example.com/deep', depth: 5 })

  assert.equal(queue.decreaseDepth('https://example.com/deep', 0), true)
  assert.equal(queue.decreaseDepth('https://example.com/deep', 3), false)
  assert.equal(queue.size, 3)
  assert.deepEqual(queue.take(), {
    url: 'https://example.com/deep',
    depth: 0,
  })
  assert.deepEqual(queue.take(), {
    url: 'https://example.com/a',
    depth: 1,
  })
  assert.deepEqual(queue.take(), {
    url: 'https://example.com/b',
    depth: 1,
  })
  assert.equal(queue.take(), undefined)
  assert.equal(queue.size, 0)
})
