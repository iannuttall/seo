import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Response } from 'undici'
import { fetchCruxFieldData, performanceAudit } from './performance.js'

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
}

async function fakeLighthouseBin(): Promise<{ bin: string; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'seo-lighthouse-'))
  const bin = join(dir, 'lighthouse')
  await writeFile(
    bin,
    `#!/bin/sh
printf '%s\n' '{"categories":{"performance":{"score":0.82}},"audits":{"largest-contentful-paint":{"numericValue":1200,"displayValue":"1.2 s","score":0.9},"interaction-to-next-paint":{"numericValue":240,"displayValue":"240 ms","score":0.7}}}'
`,
  )
  await chmod(bin, 0o755)
  return { bin, dir }
}

test('performanceAudit falls back when Lighthouse is unavailable', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Fast</title><h1>Fast page</h1>')
  })
  const port = await listen(server)
  try {
    const report = await performanceAudit({
      url: `http://127.0.0.1:${port}/`,
      lighthouseBin: 'definitely-not-lighthouse',
      refresh: true,
    })

    assert.equal(report.source, 'fetch-fallback')
    assert.equal(report.strategy, 'mobile')
    assert.equal(report.metrics.responseTime?.value !== undefined, true)
    assert.match(report.headline, /fallback/)
    assert.ok(report.topActions.length >= 1)
    assert.ok(
      report.caveats.some((item) => item.includes('Lighthouse unavailable')),
    )
    assert.equal(report.fieldDataStatus.status, 'not_configured')
    assert.equal(
      report.caveats.some((item) => item.includes('Pass a CrUX API key')),
      false,
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('CrUX lookup reports no coverage after URL and origin attempts', async () => {
  const calls: unknown[] = []
  const result = await fetchCruxFieldData({
    url: 'https://example.com/deep/page',
    apiKey: 'test-key',
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(String(init?.body ?? '{}')))
      return new Response('{}', {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    },
  })

  assert.deepEqual(calls, [
    { url: 'https://example.com/deep/page' },
    { origin: 'https://example.com' },
  ])
  assert.equal(result.fieldData, undefined)
  assert.equal(result.status.status, 'unavailable_no_coverage')
  assert.equal(result.status.httpStatus, 404)
})

test('CrUX lookup falls back from URL to origin data', async () => {
  const result = await fetchCruxFieldData({
    url: 'https://example.com/deep/page',
    apiKey: 'test-key',
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        url?: string
        origin?: string
      }
      if (body.url) {
        return new Response('{}', {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(
        JSON.stringify({
          record: {
            key: { origin: body.origin },
            metrics: {
              largest_contentful_paint: { percentiles: { p75: 1200 } },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    },
  })

  assert.equal(result.status.status, 'available')
  assert.equal(result.fieldData?.status, 'available')
  assert.equal(result.fieldData?.origin, 'https://example.com')
})

test('CrUX lookup keeps provider errors out of user-facing reasons', async () => {
  const result = await fetchCruxFieldData({
    url: 'https://example.com/',
    apiKey: 'test-key',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: {
            message: 'Requests from referer <empty> are blocked.',
          },
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      ),
  })

  assert.equal(result.status.status, 'request_failed')
  assert.equal(result.status.httpStatus, 403)
  assert.equal(
    result.status.reason,
    'Chrome UX Report field data could not be fetched.',
  )
  assert.equal(result.status.reason.includes('referer'), false)
})

test('performanceAudit captures INP and recommends responsiveness work', async () => {
  const { bin, dir } = await fakeLighthouseBin()
  try {
    const report = await performanceAudit({
      url: 'https://example.com/inp',
      lighthouseBin: bin,
      refresh: true,
    })

    assert.equal(report.source, 'lighthouse')
    assert.equal(report.metrics.interactionToNextPaint?.value, 240)
    assert.equal(
      report.topActions.some(
        (action) => action.title === 'Improve interaction responsiveness',
      ),
      true,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
