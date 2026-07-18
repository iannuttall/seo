import assert from 'node:assert/strict'

const MEBIBYTE = 1024 * 1024
const URL_COUNT = 1_000
const MAX_RSS_GROWTH = 64 * MEBIBYTE
const MAX_DURATION_MS = 2_000

const { createIndexNowKeyRecord, submitIndexNow } = await import(
  '../dist/index.js'
)
const record = createIndexNowKeyRecord({
  site: 'https://example.test',
  key: 'resource-test-key',
})
const urls = Array.from(
  { length: URL_COUNT },
  (_, index) => `https://example.test/changed/${index}`,
)
let requests = 0
const baselineRss = process.memoryUsage().rss
const startedAt = performance.now()
const result = await submitIndexNow({
  record,
  urls,
  dryRun: true,
  fetchImpl: async () => {
    requests += 1
    throw new Error('Dry runs must not fetch.')
  },
})
const durationMs = performance.now() - startedAt
const rssGrowthBytes = Math.max(0, process.memoryUsage().rss - baselineRss)

console.log(
  JSON.stringify({
    urls: result.submittedUrls,
    durationMs: Math.round(durationMs),
    rssGrowthMiB: Number((rssGrowthBytes / MEBIBYTE).toFixed(1)),
  }),
)

assert.equal(result.status, 'validated')
assert.equal(result.submittedUrls, URL_COUNT)
assert.equal(requests, 0)
assert.ok(
  durationMs <= MAX_DURATION_MS,
  `IndexNow dry run took ${(durationMs / 1000).toFixed(1)} seconds`,
)
assert.ok(
  rssGrowthBytes <= MAX_RSS_GROWTH,
  `IndexNow dry-run RSS grew by ${(rssGrowthBytes / MEBIBYTE).toFixed(1)} MiB`,
)
