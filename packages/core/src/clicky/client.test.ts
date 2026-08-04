import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { Response } from 'undici'
import { ClickyClient } from './client.js'

let configDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'seo-clicky-client-'))
  previousConfigDir = process.env.SEO_CONFIG_DIR
  process.env.SEO_CONFIG_DIR = configDir
})

afterEach(() => {
  if (previousConfigDir === undefined) delete process.env.SEO_CONFIG_DIR
  else process.env.SEO_CONFIG_DIR = previousConfigDir
  rmSync(configDir, { recursive: true, force: true })
})

test('Clicky reports are bounded, paged, and cached without the sitekey', async () => {
  const urls: URL[] = []
  const siteId = String(Date.now())
  const client = new ClickyClient({
    siteId,
    siteKey: 'abc123abc123',
    fetch: async (value) => {
      const url = new URL(String(value))
      urls.push(url)
      const page = Number(url.searchParams.get('page'))
      const count = page === 1 ? 1_000 : 1
      return new Response(
        JSON.stringify([
          {
            type: 'pages-entrance',
            dates: [
              {
                date: '2026-07-01,2026-07-28',
                items: Array.from({ length: count }, (_, index) => ({
                  value: '1',
                  url: `https://example.com/${page}-${index}`,
                })),
              },
            ],
          },
        ]),
        { headers: { 'content-type': 'application/json' } },
      )
    },
  })

  const first = await client.report({
    type: 'pages-entrance',
    startDate: '2026-07-01',
    endDate: '2026-07-28',
    limit: 1_500,
  })
  const second = await client.report({
    type: 'pages-entrance',
    startDate: '2026-07-01',
    endDate: '2026-07-28',
    limit: 1_500,
  })

  assert.equal(first.returnedRows, 1_001)
  assert.equal(first.retainedRowLimitReached, false)
  assert.equal(first.cache, 'miss')
  assert.equal(second.cache, 'hit')
  assert.equal(urls.length, 2)
  assert.equal(urls[0]?.searchParams.get('sitekey'), 'abc123abc123')

  const database = (await import('../storage/database.js')).getDb()
  const cached = database
    .prepare(
      "SELECT request_json, response_json FROM provider_cache WHERE provider = 'clicky'",
    )
    .get() as { request_json: string; response_json: string }
  assert.doesNotMatch(cached.request_json, /abc123abc123/u)
  assert.doesNotMatch(cached.response_json, /abc123abc123/u)
})

test('Clicky credential errors do not expose the rejected sitekey', async () => {
  const client = new ClickyClient({
    siteId: '123',
    siteKey: 'badkeybadkey1',
    fetch: async () =>
      new Response(JSON.stringify([{ error: 'Invalid sitekey.' }]), {
        headers: { 'content-type': 'application/json' },
      }),
  })

  await assert.rejects(
    client.verify(),
    (error: Error) =>
      /rejected the configured site ID or sitekey/u.test(error.message) &&
      !error.message.includes('badkeybadkey1'),
  )
})

test('Clicky rejects ranges longer than 31 days before fetching', async () => {
  let calls = 0
  const client = new ClickyClient({
    siteId: '123',
    siteKey: 'abc123abc123',
    fetch: async () => {
      calls += 1
      return new Response('[]')
    },
  })

  await assert.rejects(
    client.report({
      type: 'pages-entrance',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
    }),
    /limited to 31 days/u,
  )
  assert.equal(calls, 0)
})
