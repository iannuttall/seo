import assert from 'node:assert/strict'

const MEBIBYTE = 1024 * 1024
const ROW_COUNT = 80_000
const MAX_RSS_GROWTH = 384 * MEBIBYTE
const MAX_DURATION_MS = 10_000

const { analyzeQuickWinsFromRows } = await import('../dist/index.js')
const rows = Array.from({ length: ROW_COUNT }, (_, index) => ({
  keys: [
    `large property topic ${index}`,
    `https://example.com/page-${index % 8_000}`,
  ],
  clicks: index % 7,
  impressions: 250,
  ctr: (index % 7) / 250,
  position: 4 + (index % 7),
}))
const baselineRss = process.memoryUsage().rss
const startedAt = performance.now()
const report = analyzeQuickWinsFromRows({
  site: 'sc-domain:example.com',
  rows,
  limit: 25,
})
const durationMs = performance.now() - startedAt
const rssGrowthBytes = Math.max(0, process.memoryUsage().rss - baselineRss)

const measurements = {
  rows: ROW_COUNT,
  durationMs: Math.round(durationMs),
  rssGrowthMiB: Number((rssGrowthBytes / MEBIBYTE).toFixed(1)),
  eligibleRows: report.summary.eligibleRows,
  returnedRows: report.items.length,
}
console.log(JSON.stringify(measurements))

assert.equal(report.provenance.selection.sourceRows, ROW_COUNT)
assert.equal(report.items.length, 25)
assert.ok(
  durationMs <= MAX_DURATION_MS,
  `provider analysis took ${(durationMs / 1000).toFixed(1)} seconds`,
)
assert.ok(
  rssGrowthBytes <= MAX_RSS_GROWTH,
  `provider analysis RSS grew by ${(rssGrowthBytes / MEBIBYTE).toFixed(1)} MiB`,
)
