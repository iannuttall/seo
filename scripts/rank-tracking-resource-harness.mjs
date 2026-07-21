import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MEBIBYTE = 1024 * 1024
const KEYWORD_COUNT = 1_000
const SNAPSHOT_COUNT = KEYWORD_COUNT * 2
const MAX_DURATION_MS = 15_000
const MAX_RSS_GROWTH = 256 * MEBIBYTE
const MAX_OUTPUT_BYTES = 256 * 1024

const root = mkdtempSync(join(tmpdir(), 'seo-rank-resource-'))
process.env.SEO_CACHE_DIR = root
process.env.SEO_CONFIG_DIR = root
process.once('exit', () => rmSync(root, { recursive: true, force: true }))

const {
  addKeywordsToSet,
  createKeywordSet,
  getDb,
  getOrCreateRankTrackingConfiguration,
  rankObservations,
  rankTrackingLogicalBytes,
  rankTrackingReport,
  rankTrackingTasks,
  saveRankObservations,
  startRankTrackingRun,
} = await import('../dist/index.js')

let nextId = 0
const id = () => `resource-${++nextId}`
const now = () => new Date('2026-07-21T09:00:00.000Z')
const database = getDb()
const baselineRss = process.memoryUsage().rss
let peakRss = baselineRss
const startedAt = performance.now()

const set = createKeywordSet(
  {
    projectId: 'resource-project',
    name: 'Rank fixture',
    market: {
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en',
      location: { name: 'London,England,United Kingdom' },
    },
    provider: 'dataforseo',
  },
  { database, id },
)
addKeywordsToSet(
  {
    projectId: 'resource-project',
    idOrName: set.id,
    items: Array.from({ length: KEYWORD_COUNT }, (_, index) => ({
      keyword: `rank fixture keyword ${index}`,
    })),
  },
  { database },
)
const configuration = getOrCreateRankTrackingConfiguration(
  {
    projectId: 'resource-project',
    keywordSetId: set.id,
    targetDomain: 'example.test',
    market: set.market,
    devices: ['desktop', 'mobile'],
    provider: 'dataforseo',
    collectionMethod: 'queued',
    cadence: 'weekly',
    depth: 100,
    keywordLimit: KEYWORD_COUNT,
  },
  { database, id, now },
)

for (let runIndex = 0; runIndex < 2; runIndex += 1) {
  const run = startRankTrackingRun(
    {
      configuration,
      keywords: Array.from({ length: KEYWORD_COUNT }, (_, index) => ({
        keyword: `rank fixture keyword ${index}`,
        normalizedKeyword: `rank fixture keyword ${index}`,
      })),
      scheduledFor: new Date(Date.UTC(2026, 6, 21 + runIndex * 7, 9)),
    },
    { database, id, now },
  )
  const tasks = rankTrackingTasks(run.id, undefined, { database })
  assert.equal(tasks.length, SNAPSHOT_COUNT)
  const observations = tasks.map((task, index) => {
    const position = (index % 100) + 1
    return {
      taskId: task.id,
      runId: task.runId,
      keyword: task.displayKeyword,
      normalizedKeyword: task.normalizedKeyword,
      device: task.device,
      state: 'observed',
      organicPosition: position,
      absolutePosition: position + 2,
      rankingUrl: `https://example.test/page-${index % 500}`,
      observedFeatures: ['organic', 'people_also_ask'],
      checkedAt: new Date(
        Date.UTC(2026, 6, 21 + runIndex * 7, 9, 5),
      ).toISOString(),
      provider: 'dataforseo',
      providerTaskId: `provider-${runIndex}-${index}`,
      requestedDepth: 100,
      returnedRows: 100,
      retainedRows: 100,
      invalidRows: 0,
      completeness: 'complete',
      estimatedCostMicros: null,
      actualCostMicros: null,
      warnings: [],
    }
  })
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
  saveRankObservations(observations, { database, now })
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
  assert.equal(rankObservations(run.id, { database }).length, SNAPSHOT_COUNT)
}

const report = await rankTrackingReport(
  {
    projectId: 'resource-project',
    set: set.id,
    targetDomain: 'example.test',
    devices: ['desktop', 'mobile'],
    provider: 'dataforseo',
    collectionMethod: 'queued',
    cadence: 'weekly',
    depth: 100,
    keywordLimit: KEYWORD_COUNT,
    start: false,
    outputLimit: 250,
  },
  { database, now },
)
peakRss = Math.max(peakRss, process.memoryUsage().rss)
const durationMs = performance.now() - startedAt
const outputBytes = Buffer.byteLength(JSON.stringify(report))
const dbPath = join(root, 'cache.db')
const diskBytes = statSync(dbPath).size
const rssGrowthBytes = Math.max(0, peakRss - baselineRss)
const measurements = {
  keywords: KEYWORD_COUNT,
  devices: 2,
  runs: 2,
  snapshots: SNAPSHOT_COUNT * 2,
  durationMs: Math.round(durationMs),
  peakRssGrowthMiB: Number((rssGrowthBytes / MEBIBYTE).toFixed(1)),
  logicalBytes: rankTrackingLogicalBytes(database),
  diskBytes,
  outputBytes,
  returnedItems: report.items.length,
  omittedItems: report.coverage.omittedItems,
}
console.log(JSON.stringify(measurements))

assert.equal(report.items.length, 250)
assert.equal(report.coverage.totalItems, SNAPSHOT_COUNT)
assert.ok(durationMs <= MAX_DURATION_MS)
assert.ok(rssGrowthBytes <= MAX_RSS_GROWTH)
assert.ok(outputBytes <= MAX_OUTPUT_BYTES)
