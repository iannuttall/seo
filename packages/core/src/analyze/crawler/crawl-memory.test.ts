import assert from 'node:assert/strict'
import { test } from 'node:test'
import { crawlMemoryLimitBytes, crawlMemoryPressure } from './crawl-memory.js'

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
      rssBytes: 640 * MEBIBYTE - 1,
      totalMemoryBytes,
    }),
    false,
  )
  assert.equal(
    crawlMemoryPressure({ rssBytes: 640 * MEBIBYTE, totalMemoryBytes }),
    true,
  )
})
