import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Response } from 'undici'
import { getDb } from '../storage/database.js'
import { fetchCruxFieldData, performanceAudit } from './performance.js'

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
}

async function fakeLighthouseBin(
  result: Record<string, unknown> = {
    lighthouseVersion: '13.4.0',
    finalUrl: 'https://example.com/final',
    categories: { performance: { score: 0.82 } },
    audits: {
      'largest-contentful-paint': {
        numericValue: 1_200,
        displayValue: '1.2 s',
        score: 0.9,
      },
      'total-blocking-time': {
        numericValue: 240,
        displayValue: '240 ms',
        score: 0.7,
      },
      'cumulative-layout-shift': {
        numericValue: 0.05,
        displayValue: '0.05',
        score: 1,
      },
      'render-blocking-insight': {
        title: 'Render blocking requests',
        score: 0,
        details: {
          overallSavingsMs: 420,
          items: [{ url: 'https://example.com/app.css', wastedMs: 420 }],
        },
      },
    },
  },
  options: { expectResolvedBrowser?: boolean } = {},
): Promise<{ bin: string; browser?: string; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'seo-lighthouse-'))
  const bin = join(dir, 'lighthouse')
  const browser = options.expectResolvedBrowser
    ? join(dir, 'managed-chrome')
    : undefined
  if (browser) {
    await writeFile(browser, '')
    await chmod(browser, 0o755)
  }
  const browserCheck = browser
    ? `if [ "$CHROME_PATH" != "${browser}" ]; then exit 12; fi\n`
    : ''
  await writeFile(
    bin,
    `#!/bin/sh
${browserCheck}
printf '%s\\n' '${JSON.stringify(result)}'
`,
  )
  await chmod(bin, 0o755)
  return { bin, browser, dir }
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
    assert.equal(
      report.metrics.fallbackFetchDuration?.value !== undefined,
      true,
    )
    assert.equal(report.score, undefined)
    assert.equal(report.grade, 'unknown')
    assert.equal(report.dataStatus, 'partial')
    assert.equal(report.fallbackEvidence?.httpStatus, 200)
    assert.deepEqual(
      report.topActions.map((action) => action.title),
      ['Collect performance evidence'],
    )
    assert.equal(report.labDataStatus.failureCode, 'binary_missing')
    assert.ok(report.caveats.some((item) => item.includes('not TTFB')))
    assert.equal(report.fieldDataStatus.status, 'not_configured')
    assert.equal(
      report.caveats.some((item) => item.includes('Pass a CrUX API key')),
      false,
    )
    assert.equal(
      getDb()
        .prepare('SELECT id FROM performance_reports WHERE id = ?')
        .get(report.id),
      undefined,
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('performance cache rejects stale partial reports on read', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Cache boundary</title>')
  })
  const port = await listen(server)
  const url = `http://127.0.0.1:${port}/stale-partial`
  const { bin, dir } = await fakeLighthouseBin()
  try {
    const seed = await performanceAudit({ url, lighthouseBin: bin })
    const stale = {
      ...seed,
      dataStatus: 'partial',
      headline: 'Stale partial cache entry.',
    }
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO performance_reports
        (id, url, strategy, report_json, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        seed.id,
        url,
        'mobile',
        JSON.stringify(stale),
        Date.now(),
        Date.now() + 60_000,
      )

    const report = await performanceAudit({ url, timeoutMs: 1 })

    assert.equal(report.cache.status, 'miss')
    assert.equal(report.source, 'fetch-fallback')
    assert.notEqual(report.headline, stale.headline)
  } finally {
    getDb().prepare('DELETE FROM performance_reports WHERE url = ?').run(url)
    await rm(dir, { recursive: true, force: true })
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('CrUX lookup falls back from URL to origin data', async () => {
  const result = await fetchCruxFieldData({
    url: 'https://example.com/deep/page',
    apiKey: 'test-key',
    strategy: 'desktop',
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
  assert.equal(result.fieldData?.formFactor, 'DESKTOP')
  assert.equal(result.fieldData?.metrics.largestContentfulPaint?.rating, 'good')
  assert.equal(result.fieldData?.assessment.status, 'incomplete')
})

test('CrUX field evidence overrides a good Lighthouse lab result', async () => {
  const { bin, dir } = await fakeLighthouseBin({
    lighthouseVersion: '13.4.0',
    categories: { performance: { score: 0.96 } },
    audits: {
      'largest-contentful-paint': {
        numericValue: 1_100,
        displayValue: '1.1 s',
        score: 0.96,
      },
      'total-blocking-time': {
        numericValue: 40,
        displayValue: '40 ms',
        score: 0.99,
      },
      'cumulative-layout-shift': {
        numericValue: 0.02,
        displayValue: '0.02',
        score: 1,
      },
    },
  })
  try {
    const report = await performanceAudit({
      url: 'https://example.com/field-poor',
      lighthouseBin: bin,
      cruxApiKey: 'test-key',
      refresh: true,
      cruxFetch: async () =>
        new Response(
          JSON.stringify({
            record: {
              key: { url: 'https://example.com/field-poor' },
              collectionPeriod: {
                firstDate: { year: 2026, month: 6, day: 1 },
                lastDate: { year: 2026, month: 6, day: 28 },
              },
              metrics: {
                largest_contentful_paint: { percentiles: { p75: 4_100 } },
                interaction_to_next_paint: { percentiles: { p75: 550 } },
                cumulative_layout_shift: { percentiles: { p75: 0.3 } },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    })

    assert.deepEqual(
      report.topActions.map((action) => action.title),
      [
        'Improve the largest visible content',
        'Improve interaction responsiveness',
        'Reduce layout shifts',
      ],
    )
    assert.equal(
      report.topActions.every((action) => action.plainEnglish.includes('CrUX')),
      true,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('non-2xx fallback remains unscored and blocks speed advice', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(404, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Missing</title>')
  })
  const port = await listen(server)
  try {
    const report = await performanceAudit({
      url: `http://127.0.0.1:${port}/missing`,
      lighthouseBin: 'definitely-not-lighthouse',
      refresh: true,
    })

    assert.equal(report.score, undefined)
    assert.equal(report.fallbackEvidence?.httpStatus, 404)
    assert.deepEqual(
      report.topActions.map((action) => action.title),
      ['Fix the page response first'],
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('Lighthouse server response evidence stays separate from fallback fetch duration', async () => {
  const { bin, dir } = await fakeLighthouseBin({
    lighthouseVersion: '13.4.0',
    categories: { performance: { score: 0.8 } },
    audits: {
      'largest-contentful-paint': {
        numericValue: 1_000,
        displayValue: '1.0 s',
        score: 1,
      },
      'document-latency-insight': {
        title: 'Document request latency',
        score: 0,
        details: { debugData: { serverResponseTime: 700 } },
      },
    },
  })
  try {
    const report = await performanceAudit({
      url: 'https://example.com/server-response',
      lighthouseBin: bin,
      refresh: true,
    })

    assert.equal(report.metrics.serverResponseTime?.value, 700)
    assert.equal(report.metrics.fallbackFetchDuration, undefined)
    assert.equal(
      report.topActions.some(
        (action) => action.title === 'Reduce Lighthouse server response time',
      ),
      true,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
