import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  crawlMemoryLimitBytes,
  crawlMemoryPressure,
  crawlRssLimitBytes,
} from './crawl-memory.js'

const MEBIBYTE = 1024 * 1024
const GIBIBYTE = 1024 * MEBIBYTE

test('crawl memory limit adapts within safe local bounds', () => {
  assert.equal(crawlMemoryLimitBytes(2 * GIBIBYTE), 384 * MEBIBYTE)
  assert.equal(crawlMemoryLimitBytes(4 * GIBIBYTE), Math.floor(0.4 * GIBIBYTE))
  assert.equal(crawlMemoryLimitBytes(16 * GIBIBYTE), 640 * MEBIBYTE)
  assert.equal(crawlMemoryLimitBytes(Number.NaN), 640 * MEBIBYTE)
})

test('crawl memory pressure includes the adaptive boundary', () => {
  const totalMemoryBytes = 16 * GIBIBYTE
  assert.equal(
    crawlMemoryPressure({
      memoryUsage: {
        rss: 700 * MEBIBYTE,
        heapUsed: 600 * MEBIBYTE,
        external: 40 * MEBIBYTE - 1,
      },
      totalMemoryBytes,
    }),
    false,
  )
  assert.equal(
    crawlMemoryPressure({
      memoryUsage: {
        rss: 700 * MEBIBYTE,
        heapUsed: 600 * MEBIBYTE,
        external: 40 * MEBIBYTE,
      },
      totalMemoryBytes,
    }),
    true,
  )
})

test('crawl memory pressure keeps a separate emergency RSS ceiling', () => {
  assert.equal(crawlRssLimitBytes(2 * GIBIBYTE), 512 * MEBIBYTE)
  assert.equal(crawlRssLimitBytes(4 * GIBIBYTE), Math.floor(0.8 * GIBIBYTE))
  assert.equal(crawlRssLimitBytes(16 * GIBIBYTE), 896 * MEBIBYTE)
  assert.equal(crawlRssLimitBytes(Number.NaN), 896 * MEBIBYTE)
  assert.equal(
    crawlMemoryPressure({
      memoryUsage: {
        rss: 896 * MEBIBYTE,
        heapUsed: 100 * MEBIBYTE,
        external: 10 * MEBIBYTE,
      },
      totalMemoryBytes: 16 * GIBIBYTE,
    }),
    true,
  )
})
