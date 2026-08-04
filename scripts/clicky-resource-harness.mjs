import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

const MEBIBYTE = 1024 * 1024
const MAX_RSS_GROWTH = 64 * MEBIBYTE
const RETAINED_ROWS = 5_000
const configDir = mkdtempSync(join(tmpdir(), 'seo-clicky-resource-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const previousCacheDir = process.env.SEO_CACHE_DIR
process.env.SEO_CONFIG_DIR = configDir
process.env.SEO_CACHE_DIR = join(configDir, 'cache')

let calls = 0
let responseBytes = 0
const startedAt = performance.now()
const rssBefore = process.memoryUsage().rss

try {
  const { ClickyClient } = await import(
    '../packages/core/dist/clicky/client.js'
  )
  const client = new ClickyClient({
    siteId: '123',
    siteKey: 'abc123abc123',
    fetch: async (value) => {
      calls += 1
      const url = new URL(String(value))
      const page = Number(url.searchParams.get('page'))
      const items = Array.from({ length: 1_000 }, (_, index) => ({
        value: String(index + 1),
        title: `Page ${page}-${index}`,
        url: `https://example.com/pages/${page}-${index}`,
      }))
      const body = JSON.stringify([
        {
          type: 'pages-entrance',
          dates: [{ date: '2026-07-01,2026-07-28', items }],
        },
      ])
      responseBytes += Buffer.byteLength(body)
      return new Response(body, {
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  const result = await client.report({
    type: 'pages-entrance',
    startDate: '2026-07-01',
    endDate: '2026-07-28',
    limit: RETAINED_ROWS,
  })
  const outputBytes = Buffer.byteLength(JSON.stringify(result))
  const elapsedMs = performance.now() - startedAt
  const rssGrowthBytes = Math.max(0, process.memoryUsage().rss - rssBefore)
  const diskBytes = readdirSync(configDir, { recursive: true }).reduce(
    (total, entry) => {
      const path = join(configDir, String(entry))
      return statSync(path).isFile() ? total + statSync(path).size : total
    },
    0,
  )

  assert.equal(calls, 5)
  assert.equal(result.returnedRows, RETAINED_ROWS)
  assert.equal(result.retainedRowLimitReached, true)
  assert.ok(rssGrowthBytes <= MAX_RSS_GROWTH)

  process.stdout.write(
    `${JSON.stringify({
      retainedRows: result.returnedRows,
      requests: calls,
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
