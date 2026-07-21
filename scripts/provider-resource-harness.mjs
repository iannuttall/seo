import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Response } from 'undici'

const MEBIBYTE = 1024 * 1024
const ROW_COUNT = 80_000
const MAX_RSS_GROWTH = 384 * MEBIBYTE
const MAX_DURATION_MS = 10_000

const cacheDir = mkdtempSync(join(tmpdir(), 'seo-provider-resource-'))
process.env.SEO_CACHE_DIR = cacheDir
process.env.SEO_CONFIG_DIR = cacheDir

const {
  analyzeQuickWinsFromRows,
  clearCache,
  DataForSeoClient,
  getCacheStats,
} = await import('../dist/index.js')
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

const BATCHES = 20
const KEYWORDS_PER_BATCH = 100
const PROVIDER_MAX_DURATION_MS = 10_000
const PROVIDER_MAX_RSS_GROWTH = 256 * MEBIBYTE
let accountCalls = 0
let paidCalls = 0
let bytesRead = 0
let taskIndex = 0

function accountFixture() {
  return {
    version: 'resource-test',
    status_code: 20000,
    status_message: 'Ok.',
    cost: 0,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: 'account-task',
        status_code: 20000,
        status_message: 'Ok.',
        cost: 0,
        result_count: 1,
        result: [
          {
            login: 'resource@example.test',
            price: {
              dataforseo_labs: {
                keyword_overview: {
                  live: {
                    priority_normal: [
                      { cost_type: 'per_request', cost: 0.01 },
                      { cost_type: 'per_result', cost: 0.0001 },
                    ],
                  },
                },
              },
            },
          },
        ],
      },
    ],
  }
}

function paidFixture(keywords) {
  taskIndex += 1
  const cost = 0.01 + keywords.length * 0.0001
  return {
    status_code: 20000,
    status_message: 'Ok.',
    cost,
    tasks_count: 1,
    tasks_error: 0,
    tasks: [
      {
        id: `keyword-task-${taskIndex}`,
        status_code: 20000,
        status_message: 'Ok.',
        cost,
        result_count: 1,
        result: [
          {
            items_count: keywords.length,
            items: keywords.map((keyword) => ({
              keyword,
              fixture_payload: 'x'.repeat(2_048),
            })),
          },
        ],
      },
    ],
  }
}

const providerClient = new DataForSeoClient({
  credentials: () => ({
    login: 'resource@example.test',
    password: 'resource-password',
  }),
  spendLimits: {
    dailyNoticeMicros: 0,
    dailyHardLimitMicros: null,
    monthlyHardLimitMicros: null,
    maxRequestsPerReport: BATCHES,
    maxRowsPerReport: BATCHES * KEYWORDS_PER_BATCH,
  },
  fetch: async (url, init) => {
    const fixture = String(url).includes('/appendix/user_data')
      ? (() => {
          accountCalls += 1
          return accountFixture()
        })()
      : (() => {
          paidCalls += 1
          const body = JSON.parse(String(init?.body))
          return paidFixture(body[0].keywords)
        })()
    const json = JSON.stringify(fixture)
    bytesRead += Buffer.byteLength(json)
    return new Response(json)
  },
})

const providerBaselineRss = process.memoryUsage().rss
const providerStartedAt = performance.now()
let lastSnapshot
try {
  for (let batch = 0; batch < BATCHES; batch += 1) {
    lastSnapshot = await providerClient.keywordOverview({
      keywords: Array.from(
        { length: KEYWORDS_PER_BATCH },
        (_, index) => `bounded keyword ${batch}-${index}`,
      ),
      languageCode: 'en',
      locationCode: 2840,
      reportId: 'provider-resource-harness',
      reportRunId: 'bounded-run',
    })
  }

  const cached = await providerClient.keywordOverview({
    keywords: Array.from(
      { length: KEYWORDS_PER_BATCH },
      (_, index) => `bounded keyword 0-${index}`,
    ),
    languageCode: 'en',
    locationCode: 2840,
    reportId: 'provider-resource-harness',
    reportRunId: 'bounded-run',
  })
  assert.equal(cached.cache.status, 'hit')

  await assert.rejects(
    providerClient.keywordOverview({
      keywords: ['over the request bound'],
      languageCode: 'en',
      locationCode: 2840,
      reportId: 'provider-resource-harness',
      reportRunId: 'bounded-run',
    }),
    (error) => error?.code === 'budget-limit',
  )

  const providerDurationMs = performance.now() - providerStartedAt
  const providerRssGrowthBytes = Math.max(
    0,
    process.memoryUsage().rss - providerBaselineRss,
  )
  const cacheStats = getCacheStats()
  const providerMeasurements = {
    requestedRows: BATCHES * KEYWORDS_PER_BATCH,
    accountCalls,
    paidCalls,
    durationMs: Math.round(providerDurationMs),
    rssGrowthMiB: Number((providerRssGrowthBytes / MEBIBYTE).toFixed(1)),
    bytesRead,
    cacheBytesWritten: cacheStats.logicalSizeBytes,
    diskBytes: cacheStats.sizeBytes,
    outputBytes: Buffer.byteLength(JSON.stringify(lastSnapshot)),
  }
  console.log(JSON.stringify(providerMeasurements))

  assert.equal(paidCalls, BATCHES)
  assert.equal(accountCalls, 1)
  assert.equal(cacheStats.counts.provider_cache, BATCHES)
  assert.ok(providerDurationMs <= PROVIDER_MAX_DURATION_MS)
  assert.ok(providerRssGrowthBytes <= PROVIDER_MAX_RSS_GROWTH)
  assert.ok(cacheStats.logicalSizeBytes <= cacheStats.maxSizeBytes)
  assert.equal(clearCache('dataforseo'), BATCHES)
  assert.equal(getCacheStats().counts.provider_cache, 0)
} finally {
  rmSync(cacheDir, { recursive: true, force: true })
}
