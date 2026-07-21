import assert from 'node:assert/strict'

const MEBIBYTE = 1024 * 1024
const PAGE_COUNT = 8_000
const QUERY_PAGE_COUNT = 50_000
const MAX_DURATION_MS = 10_000
const MAX_RSS_GROWTH = 384 * MEBIBYTE
const MAX_OUTPUT_BYTES = MEBIBYTE

const {
  buildPseoAuditReportFromRows,
  buildQueryClusterReportFromRows,
  pseoOpportunitiesReport,
} = await import('../dist/index.js')

const pageRows = Array.from({ length: PAGE_COUNT }, (_, index) => ({
  page: `https://example.com/page-${index}`,
  clicks: 30,
  impressions: 2_500,
  position: 7,
}))
const queryPageRows = Array.from({ length: QUERY_PAGE_COUNT }, (_, index) => ({
  query: `large property topic ${index}`,
  page: `https://example.com/page-${index % PAGE_COUNT}`,
  clicks: index % 7,
  impressions: 250,
  position: 4 + (index % 7),
}))
const sourceRows = queryPageRows.map((row) => ({
  keys: [row.query, row.page],
  clicks: row.clicks,
  impressions: row.impressions,
  ctr: row.impressions ? row.clicks / row.impressions : 0,
  position: row.position,
}))

const baselineRss = process.memoryUsage().rss
let peakRss = baselineRss
const peakSample = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
}, 5)
const startedAt = performance.now()

const audit = buildPseoAuditReportFromRows({
  site: 'sc-domain:example.com',
  generatedAt: '2026-07-21T12:00:00.000Z',
  range: { startDate: '2026-06-22', endDate: '2026-07-19' },
  days: 28,
  queryPageRows,
  pageRows,
  sitemapUrls: pageRows.map((row) => row.page),
  templateLimit: 10,
  minimumTemplateUrls: 3,
  minimumTemplateShare: 0,
  minimumTemplateImpressions: 0,
  crawlSamplesPerTemplate: 0,
  inspectionSamplesPerTemplate: 0,
  maxRowsPerRequest: QUERY_PAGE_COUNT,
  pageRowsFetched: pageRows.length,
  queryPageRowsFetched: queryPageRows.length,
  sitemapsRequested: 0,
  maxUrlsPerSitemap: 50_000,
})
const queryClusters = buildQueryClusterReportFromRows({
  site: 'sc-domain:example.com',
  days: 28,
  range: { startDate: '2026-06-22', endDate: '2026-07-19' },
  generatedAt: '2026-07-21T12:00:00.000Z',
  rows: sourceRows,
  limit: 10,
})
const report = await pseoOpportunitiesReport(
  {
    site: 'sc-domain:example.com',
    templateLimit: 10,
    clusterLimit: 10,
  },
  {
    firstPartyReport: async () => ({ audit, queryClusters }),
    now: () => new Date('2026-07-21T12:00:00.000Z'),
  },
)

clearInterval(peakSample)
peakRss = Math.max(peakRss, process.memoryUsage().rss)
const durationMs = performance.now() - startedAt
const rssGrowthBytes = Math.max(0, peakRss - baselineRss)
const outputBytes = Buffer.byteLength(JSON.stringify(report))

console.log(
  JSON.stringify({
    report: 'pseo-opportunities',
    queryPageRows: queryPageRows.length,
    pageRows: pageRows.length,
    durationMs: Math.round(durationMs),
    peakRssGrowthMiB: Number((rssGrowthBytes / MEBIBYTE).toFixed(1)),
    bytesRead: 0,
    bytesWritten: 0,
    outputBytes,
    returnedTemplates: report.templates.length,
    returnedClusters: report.queryClusters.length,
    returnedSeeds: report.source.external.discovery.seeds.length,
  }),
)

assert.ok(report.templates.length <= 10)
assert.ok(report.queryClusters.length <= 10)
assert.ok(report.source.external.discovery.seeds.length <= 5)
assert.equal(report.source.external.discovery.status, 'not-requested')
assert.ok(outputBytes <= MAX_OUTPUT_BYTES)
assert.ok(durationMs <= MAX_DURATION_MS)
assert.ok(rssGrowthBytes <= MAX_RSS_GROWTH)
