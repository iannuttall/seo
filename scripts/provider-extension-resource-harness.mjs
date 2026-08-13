import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { installBuiltProviderFixture } from './provider-extension-fixture.mjs'

const MEBIBYTE = 1024 * 1024
const MAX_RSS_GROWTH = 96 * MEBIBYTE
const configDir = mkdtempSync(
  join(tmpdir(), 'seo-provider-extension-resource-'),
)
const previousConfigDir = process.env.SEO_CONFIG_DIR
const previousCacheDir = process.env.SEO_CACHE_DIR
process.env.SEO_CONFIG_DIR = configDir
process.env.SEO_CACHE_DIR = join(configDir, 'cache')

let analyticsCalls = 0
let serpCalls = 0
let responseBytes = 0
const startedAt = performance.now()
const rssBefore = process.memoryUsage().rss

try {
  await installBuiltProviderFixture({
    id: 'fixture',
    sourceDirectory: join(process.cwd(), 'scripts/fixtures/provider-extension'),
  })
  const { runAnalyticsProviderLandingPages } = await import(
    '../packages/core/dist/provider-extensions/analytics.js'
  )
  const analytics = await runAnalyticsProviderLandingPages({
    providerId: 'fixture',
    account: { siteId: 'large-fixture' },
    credentials: { apiKey: 'fixture-key' },
    startDate: '2026-07-01',
    endDate: '2026-07-28',
    limit: 5_000,
    refresh: true,
    runtime: {
      fetch: async (value) => {
        analyticsCalls += 1
        const url = new URL(String(value))
        const page = Number(url.searchParams.get('page'))
        const limit = Number(url.searchParams.get('limit'))
        const body = JSON.stringify({
          rows: Array.from({ length: limit }, (_, index) => ({
            path: `/pages/${page}-${index}`,
            visits: index + 1,
          })),
        })
        responseBytes += Buffer.byteLength(body)
        return new Response(body, {
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  })

  const { runProviderSerpSnapshot } = await import(
    '../packages/core/dist/provider-extensions/serp.js'
  )
  const serp = await runProviderSerpSnapshot({
    providerId: 'fixture',
    account: {},
    credentials: { apiKey: 'fixture-key' },
    keyword: 'technical seo',
    market: {
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en',
      device: 'desktop',
    },
    depth: 100,
    refresh: true,
    context: {
      reportId: 'resource-harness',
      reportRunId: 'provider-extension-resource',
    },
    runtime: {
      fetch: async (value) => {
        serpCalls += 1
        const page = Number(new URL(String(value)).searchParams.get('page'))
        const body = JSON.stringify({
          organicResults: Array.from({ length: 10 }, (_, index) => ({
            rankGroup: index + 1,
            rankAbsolute: (page - 1) * 10 + index + 1,
            page,
            domain: 'example.com',
            url: `https://example.com/${page}/${index + 1}`,
            title: `Result ${page}-${index + 1}`,
            description: null,
            isFeaturedSnippet: null,
          })),
        })
        responseBytes += Buffer.byteLength(body)
        return new Response(body, {
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  })

  const outputBytes = Buffer.byteLength(JSON.stringify({ analytics, serp }))
  const elapsedMs = performance.now() - startedAt
  const rssGrowthBytes = Math.max(0, process.memoryUsage().rss - rssBefore)
  const diskBytes = readdirSync(configDir, { recursive: true }).reduce(
    (total, entry) => {
      const path = join(configDir, String(entry))
      return statSync(path).isFile() ? total + statSync(path).size : total
    },
    0,
  )

  assert.equal(analyticsCalls, 5)
  assert.equal(analytics.returnedRows, 5_000)
  assert.equal(serpCalls, 10)
  assert.equal(serp.data.organicResults.length, 100)
  assert.ok(rssGrowthBytes <= MAX_RSS_GROWTH)

  process.stdout.write(
    `${JSON.stringify({
      analyticsRows: analytics.returnedRows,
      serpRows: serp.data.organicResults.length,
      requests: analyticsCalls + serpCalls,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      rssGrowthBytes,
      responseBytes,
      outputBytes,
      diskBytes,
    })}\n`,
  )
} finally {
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  if (previousCacheDir === undefined) delete process.env.SEO_CACHE_DIR
  else process.env.SEO_CACHE_DIR = previousCacheDir
  rmSync(configDir, { recursive: true, force: true })
}
