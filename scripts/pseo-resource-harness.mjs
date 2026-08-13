import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const MEBIBYTE = 1024 * 1024
const HEAP_LIMIT_MIB = 192
const WORKER_ENV = 'SEO_PSEO_RESOURCE_HARNESS_WORKER'
const PAGE_COUNT = 8_000
const QUERY_PAGE_COUNT = 50_000
const MAX_DURATION_MS = 10_000
const MAX_RSS_GROWTH = 384 * MEBIBYTE
const MAX_OUTPUT_BYTES = MEBIBYTE

if (process.env[WORKER_ENV] !== '1') {
  const child = spawnSync(
    process.execPath,
    [
      ...process.execArgv,
      `--max-old-space-size=${HEAP_LIMIT_MIB}`,
      fileURLToPath(import.meta.url),
    ],
    {
      env: { ...process.env, [WORKER_ENV]: '1' },
      stdio: 'inherit',
    },
  )
  if (child.error) throw child.error
  process.exit(child.status ?? 1)
}

const {
  buildPseoAuditReportFromRows,
  buildQueryClusterReportFromRows,
  pseoOpportunitiesReport,
  pseoPatternsReport,
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
let sourceRows = queryPageRows.map((row) => ({
  keys: [row.query, row.page],
  clicks: row.clicks,
  impressions: row.impressions,
  ctr: row.impressions ? row.clicks / row.impressions : 0,
  position: row.position,
}))
const pageUrls = pageRows.map((row) => row.page)

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
  sitemapUrls: pageUrls,
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
sourceRows = undefined
const opportunitiesReport = await pseoOpportunitiesReport(
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
const patternValues = Array.from(
  { length: 100 },
  (_, index) => `entity-${String(index).padStart(3, '0')}`,
)
const patternsReport = await pseoPatternsReport(
  {
    site: 'sc-domain:example.com',
    candidateLimit: 250,
    observedQueryLimit: 250,
    patternSets: [
      {
        id: 'entity-comparisons',
        kind: 'comparison',
        shape: 'pairs',
        coveragePolicy: 'complete-set',
        values: patternValues,
        pairing: 'all-pairs',
        queryTemplates: ['{left} vs {right}', '{right} vs {left}'],
        pathTemplate: '/compare/{left}-vs-{right}',
      },
      {
        id: 'format-utilities',
        kind: 'utility',
        shape: 'matrix',
        axes: [
          { id: 'tool', values: patternValues },
          { id: 'format', values: patternValues },
        ],
        queryTemplates: ['{tool} for {format}'],
        pathTemplate: '/tools/{tool}/{format}',
      },
    ],
  },
  {
    firstPartyReport: async () => ({
      audit,
      queryRows: queryPageRows,
      pageRows,
      discoveredUrls: pageUrls,
    }),
  },
)

clearInterval(peakSample)
peakRss = Math.max(peakRss, process.memoryUsage().rss)
const durationMs = performance.now() - startedAt
const rssGrowthBytes = Math.max(0, peakRss - baselineRss)
const opportunitiesOutputBytes = Buffer.byteLength(
  JSON.stringify(opportunitiesReport),
)
const patternsOutputBytes = Buffer.byteLength(JSON.stringify(patternsReport))

console.log(
  JSON.stringify({
    reports: ['pseo-opportunities', 'pseo-patterns'],
    queryPageRows: queryPageRows.length,
    pageRows: pageRows.length,
    heapLimitMiB: HEAP_LIMIT_MIB,
    durationMs: Math.round(durationMs),
    peakRssGrowthMiB: Number((rssGrowthBytes / MEBIBYTE).toFixed(1)),
    bytesRead: 0,
    bytesWritten: 0,
    outputBytes: {
      pseoOpportunities: opportunitiesOutputBytes,
      pseoPatterns: patternsOutputBytes,
    },
    opportunities: {
      returnedTemplates: opportunitiesReport.templates.length,
      returnedClusters: opportunitiesReport.queryClusters.length,
      returnedSeeds: opportunitiesReport.source.external.discovery.seeds.length,
    },
    patterns: {
      plannedTopics: patternsReport.summary.plannedTopics,
      returnedTopics: patternsReport.summary.returnedTopics,
      logicalRows: patternsReport.detailBudget.returned,
    },
  }),
)

assert.ok(opportunitiesReport.templates.length <= 10)
assert.ok(opportunitiesReport.queryClusters.length <= 10)
assert.ok(opportunitiesReport.source.external.discovery.seeds.length <= 5)
assert.equal(
  opportunitiesReport.source.external.discovery.status,
  'not-requested',
)
assert.equal(patternsReport.summary.plannedTopics, 14_950)
assert.equal(patternsReport.summary.returnedTopics, 250)
assert.equal(patternsReport.patternSets[0]?.returnedTopics, 125)
assert.equal(patternsReport.patternSets[1]?.returnedTopics, 125)
assert.equal(
  patternsReport.source.external.keywordMetrics.status,
  'not-requested',
)
assert.equal(patternsReport.source.external.serps.requested, false)
assert.ok(patternsReport.detailBudget.returned <= 2_000)
assert.ok(opportunitiesOutputBytes <= MAX_OUTPUT_BYTES)
assert.ok(patternsOutputBytes <= MAX_OUTPUT_BYTES)
assert.ok(durationMs <= MAX_DURATION_MS)
assert.ok(rssGrowthBytes <= MAX_RSS_GROWTH)
