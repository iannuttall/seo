import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Response } from 'undici'
import { configSchema } from '../../types.js'
import { writeConfig } from '../../storage/config.js'
import { getDb } from '../../storage/database.js'
import { ProviderError } from '../errors.js'
import { cachedSemrushCall } from './cache.js'
import { mapOverview } from './mappers.js'
import { semrushKeywordOverviewSchema } from './schemas.js'

const root = mkdtempSync(join(tmpdir(), 'seo-semrush-provider-'))
const previousConfigDir = process.env.SEO_CONFIG_DIR
const previousCacheDir = process.env.SEO_CACHE_DIR
process.env.SEO_CONFIG_DIR = join(root, 'config')
process.env.SEO_CACHE_DIR = join(root, 'cache')

test.after(() => {
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  if (previousCacheDir === undefined) delete process.env.SEO_CACHE_DIR
  else process.env.SEO_CACHE_DIR = previousCacheDir
  rmSync(root, { recursive: true, force: true })
})

function configure(apiKey: string): void {
  writeConfig(
    configSchema.parse({
      providers: { semrushApiKey: apiKey, prefer: 'authoritative' },
      security: { useKeychain: false },
    }),
  )
}

test('Semrush validates responses and caches without storing credentials', async () => {
  const firstKey = 'semrush-local-secret-one'
  const secondKey = 'semrush-local-secret-two'
  let fetchCalls = 0
  const fetch = async (url: string | URL) => {
    fetchCalls += 1
    const parsed = new URL(url)
    assert.equal(
      parsed.searchParams.get('key'),
      fetchCalls === 1 ? firstKey : secondKey,
    )
    return new Response('Ph;Nq;Cp;Co;Nr;Kd\nzero query;0;0;0;0;0')
  }
  const run = () =>
    cachedSemrushCall(
      'phrase_this',
      {
        phrase: 'zero query',
        database: 'us',
        export_columns: 'Ph,Nq,Cp,Co,Nr,Kd',
      },
      mapOverview,
      semrushKeywordOverviewSchema,
      60_000,
      10,
      false,
      { fetch, baseUrl: 'https://provider.invalid' },
    )

  configure(firstKey)
  assert.equal((await run()).cached, undefined)
  assert.equal((await run()).cached, true)
  assert.equal(fetchCalls, 1)

  configure(secondKey)
  assert.equal((await run()).cached, undefined)
  assert.equal(fetchCalls, 2)

  const rows = getDb()
    .prepare(
      'SELECT query_hash, request_json, response_json FROM semrush_cache ORDER BY fetched_at',
    )
    .all() as Array<{
    query_hash: string
    request_json: string
    response_json: string
  }>
  assert.equal(rows.length, 2)
  for (const row of rows) {
    const stored = JSON.stringify(row)
    assert.doesNotMatch(stored, new RegExp(firstKey))
    assert.doesNotMatch(stored, new RegExp(secondKey))
    assert.doesNotMatch(
      stored,
      new RegExp(Buffer.from(firstKey).toString('base64url')),
    )
    assert.doesNotMatch(
      stored,
      new RegExp(Buffer.from(secondKey).toString('base64url')),
    )
    assert.equal('key' in JSON.parse(row.request_json), false)
  }
})

test('Semrush rejects malformed mapped rows and provider errors', async () => {
  configure('semrush-test-key')
  const call = (body: string) =>
    cachedSemrushCall(
      'phrase_this',
      { phrase: body, database: 'us' },
      mapOverview,
      semrushKeywordOverviewSchema,
      60_000,
      10,
      true,
      {
        fetch: async () => new Response(body),
        baseUrl: 'https://provider.invalid',
      },
    )

  await assert.rejects(
    call('Ph;Nq\n;not-a-number'),
    (error) =>
      error instanceof ProviderError && error.code === 'invalid-response',
  )
  await assert.rejects(
    call('ERROR :: 50 :: NOTHING FOUND'),
    (error) => error instanceof ProviderError && error.code === 'remote-error',
  )
})
