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
process.once('exit', () => rmSync(cacheDir, { recursive: true, force: true }))

const {
  addKeywordsToSet,
  analyzeQuickWinsFromRows,
  clearCache,
  competitorKeywordGapReport,
  createKeywordSet,
  DataForSeoClient,
  getCacheStats,
  KEYWORD_SET_LIMITS,
  keywordSetLogicalBytes,
  observedValue,
  savedKeywordSetReport,
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

const KEYWORD_SET_ROWS = 10_000
const KEYWORD_SET_BATCH_SIZE = 1_000
const KEYWORD_SET_MAX_DURATION_MS = 10_000
const KEYWORD_SET_MAX_RSS_GROWTH = 256 * MEBIBYTE
const KEYWORD_SET_MAX_OUTPUT_BYTES = MEBIBYTE
const keywordSetBaselineRss = process.memoryUsage().rss
const keywordSetStartedAt = performance.now()
createKeywordSet({
  projectId: 'resource-project',
  name: 'Large fixture',
  market: {
    searchEngine: 'google',
    countryCode: 'GB',
    languageCode: 'en',
  },
})
for (
  let offset = 0;
  offset < KEYWORD_SET_ROWS;
  offset += KEYWORD_SET_BATCH_SIZE
) {
  addKeywordsToSet({
    projectId: 'resource-project',
    idOrName: 'Large fixture',
    items: Array.from({ length: KEYWORD_SET_BATCH_SIZE }, (_, index) => ({
      keyword: `bounded saved keyword ${offset + index}`,
      tags: [`group-${(offset + index) % 20}`],
    })),
  })
}
const keywordSetReport = savedKeywordSetReport({
  projectId: 'resource-project',
  idOrName: 'Large fixture',
  limit: KEYWORD_SET_LIMITS.outputRows,
})
const keywordSetDurationMs = performance.now() - keywordSetStartedAt
const keywordSetRssGrowthBytes = Math.max(
  0,
  process.memoryUsage().rss - keywordSetBaselineRss,
)
const keywordSetOutputBytes = Buffer.byteLength(
  JSON.stringify(keywordSetReport),
)
const keywordSetLogicalSize = keywordSetLogicalBytes()
console.log(
  JSON.stringify({
    report: 'saved-keywords',
    storedRows: KEYWORD_SET_ROWS,
    mutationBatches: KEYWORD_SET_ROWS / KEYWORD_SET_BATCH_SIZE,
    returnedRows: keywordSetReport.summary.returnedKeywords,
    durationMs: Math.round(keywordSetDurationMs),
    peakRssGrowthMiB: Number((keywordSetRssGrowthBytes / MEBIBYTE).toFixed(1)),
    logicalBytesWritten: keywordSetLogicalSize,
    outputBytes: keywordSetOutputBytes,
  }),
)
assert.equal(keywordSetReport.dataStatus, 'partial')
assert.equal(keywordSetReport.summary.totalKeywords, KEYWORD_SET_ROWS)
assert.equal(
  keywordSetReport.summary.returnedKeywords,
  KEYWORD_SET_LIMITS.outputRows,
)
assert.ok(keywordSetDurationMs <= KEYWORD_SET_MAX_DURATION_MS)
assert.ok(keywordSetRssGrowthBytes <= KEYWORD_SET_MAX_RSS_GROWTH)
assert.ok(keywordSetLogicalSize <= KEYWORD_SET_LIMITS.logicalBytes)
assert.ok(keywordSetOutputBytes <= KEYWORD_SET_MAX_OUTPUT_BYTES)

const DOMAIN_GSC_ROWS = 100_000
const DOMAIN_ROWS_PER_COMPETITOR = 250
const DOMAIN_MAX_DURATION_MS = 10_000
const DOMAIN_MAX_RSS_GROWTH = 384 * MEBIBYTE
const DOMAIN_MAX_OUTPUT_BYTES = 2 * MEBIBYTE
let domainProviderCalls = 0

function domainMetric(keyword, url, rank) {
  const missing = {
    state: 'missing',
    value: null,
    reason: 'Not present in the resource fixture.',
  }
  return {
    keyword,
    url,
    rankGroup: rank,
    rankAbsolute: rank,
    resultType: 'organic',
    monthlySearchVolume: observedValue(100),
    monthlySearches: missing,
    searchVolumeUpdatedAt: missing,
    cpcUsd: observedValue(1),
    paidCompetition: observedValue(0.2),
    keywordDifficulty: observedValue(20),
    intent: observedValue('commercial'),
    resultCount: missing,
    estimatedMonthlyTraffic: observedValue(5),
  }
}

function rankedEvidence(target, rows) {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'ranked-keywords',
    data: { target, rows, totalRows: rows.length },
    observedAt: '2026-07-21T12:00:00.000Z',
    market: {
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en',
    },
    coverage: {
      requestedRows: rows.length,
      returnedRows: rows.length,
      retainedRows: rows.length,
      invalidRows: 0,
      providerTotalRows: rows.length,
      completeness: 'complete',
      nextCursor: null,
    },
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 12_000,
      actualMicros: 12_000,
      taskIds: ['resource-domain-task'],
    },
    request: {
      operation: 'ranked-keywords',
      endpoint: 'resource-fixture',
      limit: rows.length,
      filters: {},
      sort: [],
    },
    warnings: [],
  }
}

const domainGscRows = Array.from({ length: DOMAIN_GSC_ROWS }, (_, index) => ({
  keys: [
    `widget category ${index}`,
    `https://example.com/categories/${index % 10_000}`,
  ],
  clicks: index % 5,
  impressions: 100 + (index % 100),
  ctr: (index % 5) / (100 + (index % 100)),
  position: 5 + (index % 20),
}))
const domainAdapter = {
  provider: 'dataforseo',
  capabilitySupport: [
    {
      capability: 'ranked-keywords',
      status: 'available',
      markets: [{ searchEngines: ['google'], location: 'country-only' }],
    },
  ],
  rankedKeywords: async ({ target }) => {
    domainProviderCalls += 1
    const rows =
      target === 'example.com'
        ? []
        : Array.from({ length: DOMAIN_ROWS_PER_COMPETITOR }, (_, index) =>
            domainMetric(
              `widget category ${index}`,
              `https://${target}/locations/place-${index}`,
              1 + (index % 20),
            ),
          )
    return rankedEvidence(target, rows)
  },
}
const domainBaselineRss = process.memoryUsage().rss
const domainStartedAt = performance.now()
const domainReport = await competitorKeywordGapReport(
  {
    site: 'sc-domain:example.com',
    competitors: [
      { domain: 'one.test', siteType: 'business' },
      { domain: 'two.test', siteType: 'business' },
      { domain: 'three.test', siteType: 'business' },
    ],
    market: {
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en',
    },
    limitPerDomain: DOMAIN_ROWS_PER_COMPETITOR,
    candidateLimit: 50,
  },
  {
    candidates: [{ adapter: domainAdapter, connected: true, priority: 1 }],
    now: () => new Date('2026-07-21T12:00:00.000Z'),
    searchAnalytics: async () => ({
      rows: domainGscRows,
      rowsFetched: DOMAIN_GSC_ROWS,
      calls: 20,
    }),
  },
)
const domainDurationMs = performance.now() - domainStartedAt
const domainRssGrowthBytes = Math.max(
  0,
  process.memoryUsage().rss - domainBaselineRss,
)
const domainOutputBytes = Buffer.byteLength(JSON.stringify(domainReport))
console.log(
  JSON.stringify({
    report: 'competitor-keyword-gap',
    sourceRows: DOMAIN_GSC_ROWS,
    providerCalls: domainProviderCalls,
    providerRows: 3 * DOMAIN_ROWS_PER_COMPETITOR,
    returnedCandidates: domainReport.candidates.length,
    durationMs: Math.round(domainDurationMs),
    rssGrowthMiB: Number((domainRssGrowthBytes / MEBIBYTE).toFixed(1)),
    bytesRead: Buffer.byteLength(JSON.stringify(domainGscRows)),
    bytesWritten: 0,
    outputBytes: domainOutputBytes,
  }),
)
assert.equal(domainProviderCalls, 4)
assert.equal(domainReport.dataStatus, 'partial')
assert.equal(domainReport.source.firstParty.possiblyTruncated, true)
assert.equal(domainReport.candidates.length, 50)
assert.equal(domainReport.processing.firstPartyRows, DOMAIN_GSC_ROWS)
assert.equal(domainReport.processing.sourceTermVisits, DOMAIN_GSC_ROWS * 3)
assert.ok(
  domainReport.processing.retainedTokenPostings <= DOMAIN_GSC_ROWS + 200,
)
assert.ok(domainDurationMs <= DOMAIN_MAX_DURATION_MS)
assert.ok(domainRssGrowthBytes <= DOMAIN_MAX_RSS_GROWTH)
assert.ok(domainOutputBytes <= DOMAIN_MAX_OUTPUT_BYTES)

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
