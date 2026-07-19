import assert from 'node:assert/strict'

const MEBIBYTE = 1024 * 1024
const DIMENSION_ROWS = 8_000
const MAX_RSS_GROWTH = 64 * MEBIBYTE
const MAX_DURATION_MS = 2_000
const MAX_OUTPUT_BYTES = 75_000

const { bingWebmasterOverview } = await import('../dist/index.js')
const dimensionRows = (kind) =>
  Array.from({ length: DIMENSION_ROWS }, (_, index) => ({
    date: new Date(
      Date.parse('2026-07-17T00:00:00Z') - (index % 80) * 7 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10),
    value:
      kind === 'page'
        ? `https://example.test/page-${index % 1_000}`
        : `query ${index % 1_000}`,
    clicks: index % 8,
    impressions: 20 + (index % 500),
    avgClickPosition: 3 + (index % 15),
    avgImpressionPosition: 4 + (index % 17),
  }))
const queryRows = dimensionRows('query')
const pageRows = dimensionRows('page')
const trafficRows = Array.from({ length: 400 }, (_, index) => ({
  date: new Date(Date.parse('2026-07-17T00:00:00Z') - index * 86_400_000)
    .toISOString()
    .slice(0, 10),
  clicks: index % 20,
  impressions: 100 + index,
}))
const crawlRows = Array.from({ length: 180 }, (_, index) => ({
  date: new Date(Date.parse('2026-07-17T00:00:00Z') - index * 86_400_000)
    .toISOString()
    .slice(0, 10),
  crawledPages: 1_000 + index,
  crawlErrors: index % 5,
  code4xx: index % 3,
  code5xx: 0,
}))
const result = (rows) => ({
  rows,
  invalidRows: 0,
  capped: false,
  returnedRows: rows.length,
})
const client = {
  authentication: 'api-key',
  getTraffic: async () => result(trafficRows),
  getCrawlStats: async () => result(crawlRows),
  getQueryStats: async () => result(queryRows),
  getPageStats: async () => result(pageRows),
}

const baselineRss = process.memoryUsage().rss
const startedAt = performance.now()
const report = await bingWebmasterOverview({
  site: 'https://example.test/',
  client,
})
const durationMs = performance.now() - startedAt
const rssGrowthBytes = Math.max(0, process.memoryUsage().rss - baselineRss)
const outputBytes = Buffer.byteLength(JSON.stringify(report))

console.log(
  JSON.stringify({
    dimensionRows: DIMENSION_ROWS * 2,
    dailyRows: trafficRows.length + crawlRows.length,
    durationMs: Math.round(durationMs),
    rssGrowthMiB: Number((rssGrowthBytes / MEBIBYTE).toFixed(1)),
    outputBytes,
  }),
)

assert.equal(report.queries.data.retainedRows, DIMENSION_ROWS)
assert.equal(report.pages.data.retainedRows, DIMENSION_ROWS)
assert.ok(report.traffic.data.rows.length <= 14)
assert.ok(report.crawl.data.rows.length <= 14)
assert.ok(report.queries.data.analysis.movements.length <= 10)
assert.ok(report.pages.data.analysis.opportunities.length <= 10)
assert.ok(
  outputBytes <= MAX_OUTPUT_BYTES,
  'Bing report exceeded its output budget',
)
assert.ok(
  durationMs <= MAX_DURATION_MS,
  'Bing analysis exceeded its time budget',
)
assert.ok(
  rssGrowthBytes <= MAX_RSS_GROWTH,
  'Bing analysis exceeded its memory budget',
)
