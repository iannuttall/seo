import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Response } from 'undici'
import { getDb } from '../storage/database.js'
import {
  fetchCruxFieldData,
  performanceAudit,
  performanceReportIsCacheable,
} from './performance.js'
import type { PerformanceAuditReport } from './performance-types.js'

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
): Promise<{ bin: string; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'seo-lighthouse-'))
  const bin = join(dir, 'lighthouse')
  await writeFile(
    bin,
    `#!/bin/sh
printf '%s\\n' '${JSON.stringify(result)}'
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
    assert.equal(
      report.metrics.fallbackFetchDuration?.value !== undefined,
      true,
    )
    assert.equal(report.score, undefined)
    assert.equal(report.grade, 'unknown')
    assert.equal(report.dataStatus, 'partial')
    assert.equal(report.fallbackEvidence?.httpStatus, 200)
    assert.match(report.headline, /fallback/)
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

test('performance cache excludes operational and custom results', () => {
  const report: PerformanceAuditReport = {
    schemaVersion: 1,
    methodology: 'performance-v2',
    dataStatus: 'complete' as const,
    id: 'perf_test',
    url: 'https://example.com/',
    strategy: 'mobile',
    generatedAt: '2026-07-09T00:00:00.000Z',
    cache: { status: 'miss', ttlHours: 24 },
    source: 'lighthouse' as const,
    score: 90,
    grade: 'good',
    headline: 'Complete Lighthouse evidence.',
    metrics: {},
    labInsights: [],
    labDataStatus: {
      provider: 'lighthouse',
      status: 'available',
      reason: 'Lighthouse completed.',
    },
    fieldDataStatus: {
      provider: 'crux',
      status: 'not_configured',
      reason: 'Not configured.',
      checkedUrl: 'https://example.com/',
      checkedOrigin: 'https://example.com',
      formFactor: 'PHONE',
    },
    topActions: [],
    caveats: [],
  }
  assert.equal(performanceReportIsCacheable({ report }), true)
  assert.equal(
    performanceReportIsCacheable({
      report: { ...report, source: 'fetch-fallback' },
    }),
    false,
  )
  assert.equal(
    performanceReportIsCacheable({
      report: {
        ...report,
        fieldDataStatus: {
          ...report.fieldDataStatus,
          status: 'request_failed',
        },
      },
    }),
    false,
  )
  assert.equal(
    performanceReportIsCacheable({ report, customLighthouse: true }),
    false,
  )
  assert.equal(
    performanceReportIsCacheable({ report, customCrux: true }),
    false,
  )
  assert.equal(
    performanceReportIsCacheable({ report, includeRaw: true }),
    false,
  )
  assert.equal(
    performanceReportIsCacheable({
      report: { ...report, dataStatus: 'partial' },
    }),
    false,
  )
  assert.equal(
    performanceReportIsCacheable({
      report: {
        ...report,
        labDataStatus: { ...report.labDataStatus, status: 'unavailable' },
      },
    }),
    false,
  )
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

test('custom CrUX providers bypass reads and cannot replace production cache', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Custom CrUX boundary</title>')
  })
  const port = await listen(server)
  const url = `http://127.0.0.1:${port}/custom-crux`
  const { bin, dir } = await fakeLighthouseBin()
  try {
    const noCoverage = async () =>
      new Response('{}', {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    const seed = await performanceAudit({
      url,
      lighthouseBin: bin,
      cruxApiKey: 'test-key',
      cruxFetch: noCoverage,
    })
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
        JSON.stringify(seed),
        Date.now(),
        Date.now() + 60_000,
      )
    let cruxCalls = 0

    const report = await performanceAudit({
      url,
      cruxApiKey: 'test-key',
      cruxFetch: async () => {
        cruxCalls += 1
        return noCoverage()
      },
      timeoutMs: 1,
    })
    const stored = getDb()
      .prepare('SELECT report_json FROM performance_reports WHERE id = ?')
      .get(seed.id) as { report_json: string }

    assert.equal(report.cache.status, 'bypass')
    assert.equal(report.id, seed.id)
    assert.equal(cruxCalls, 2)
    assert.equal(stored.report_json, JSON.stringify(seed))
  } finally {
    getDb().prepare('DELETE FROM performance_reports WHERE url = ?').run(url)
    await rm(dir, { recursive: true, force: true })
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
    {
      url: 'https://example.com/deep/page',
      formFactor: 'PHONE',
      metrics: [
        'cumulative_layout_shift',
        'interaction_to_next_paint',
        'largest_contentful_paint',
      ],
    },
    {
      origin: 'https://example.com',
      formFactor: 'PHONE',
      metrics: [
        'cumulative_layout_shift',
        'interaction_to_next_paint',
        'largest_contentful_paint',
      ],
    },
  ])
  assert.equal(result.fieldData, undefined)
  assert.equal(result.status.status, 'unavailable_no_coverage')
  assert.equal(result.status.httpStatus, 404)
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

test('performanceAudit uses TBT as a lab diagnostic and keeps output compact', async () => {
  const { bin, dir } = await fakeLighthouseBin()
  try {
    getDb()
      .prepare('DELETE FROM performance_reports WHERE url = ?')
      .run('https://example.com/inp')
    const report = await performanceAudit({
      url: 'https://example.com/inp',
      lighthouseBin: bin,
      refresh: true,
    })

    assert.equal(report.source, 'lighthouse')
    assert.equal(report.metrics.interactionToNextPaint, undefined)
    assert.equal(report.metrics.totalBlockingTime?.value, 240)
    assert.equal(report.raw, undefined)
    assert.equal(report.labInsights[0]?.id, 'render-blocking-insight')
    assert.equal(
      report.topActions.some(
        (action) => action.title === 'Reduce main-thread blocking',
      ),
      true,
    )
    assert.equal(
      report.topActions.some((action) =>
        action.title.startsWith('Review Lighthouse insight:'),
      ),
      true,
    )
    assert.equal(
      getDb()
        .prepare('SELECT id FROM performance_reports WHERE id = ?')
        .get(report.id),
      undefined,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
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

    assert.match(report.headline, /Core Web Vitals are poor/)
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

test('raw Lighthouse output is opt-in and bypasses cache', async () => {
  const { bin, dir } = await fakeLighthouseBin()
  try {
    const report = await performanceAudit({
      url: 'https://example.com/raw',
      lighthouseBin: bin,
      includeRaw: true,
    })

    assert.equal(report.cache.status, 'bypass')
    assert.equal(typeof report.raw, 'object')
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

test('null Lighthouse category scores stay unknown and partial', async () => {
  const { bin, dir } = await fakeLighthouseBin({
    lighthouseVersion: '13.4.0',
    categories: { performance: { score: null } },
    audits: {
      'largest-contentful-paint': {
        numericValue: 1_000,
        displayValue: '1.0 s',
        score: 1,
      },
    },
  })
  try {
    const report = await performanceAudit({
      url: 'https://example.com/null-score',
      lighthouseBin: bin,
      refresh: true,
    })

    assert.equal(report.source, 'lighthouse')
    assert.equal(report.score, undefined)
    assert.equal(report.grade, 'unknown')
    assert.equal(report.dataStatus, 'partial')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('empty Lighthouse results become a typed unavailable fallback', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><title>Page</title>')
  })
  const port = await listen(server)
  const { bin, dir } = await fakeLighthouseBin({
    categories: { performance: { score: null } },
    audits: {},
  })
  try {
    const report = await performanceAudit({
      url: `http://127.0.0.1:${port}/empty-lhr`,
      lighthouseBin: bin,
      refresh: true,
    })

    assert.equal(report.source, 'fetch-fallback')
    assert.equal(report.labDataStatus.failureCode, 'invalid_result')
    assert.deepEqual(
      report.topActions.map((action) => action.title),
      ['Collect performance evidence'],
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('good rolling field data does not hide a poor current lab metric', async () => {
  const { bin, dir } = await fakeLighthouseBin({
    lighthouseVersion: '13.4.0',
    categories: { performance: { score: 0.7 } },
    audits: {
      'largest-contentful-paint': {
        numericValue: 3_000,
        displayValue: '3.0 s',
        score: 0.3,
      },
      'total-blocking-time': {
        numericValue: 20,
        displayValue: '20 ms',
        score: 1,
      },
      'cumulative-layout-shift': {
        numericValue: 0.01,
        displayValue: '0.01',
        score: 1,
      },
      'render-blocking-insight': {
        title: 'Render blocking requests',
        score: 0,
        details: { overallSavingsMs: 300 },
      },
    },
  })
  try {
    const report = await performanceAudit({
      url: 'https://example.com/field-good-lab-poor',
      lighthouseBin: bin,
      cruxApiKey: 'test-key',
      refresh: true,
      cruxFetch: async () =>
        new Response(
          JSON.stringify({
            record: {
              key: { url: 'https://example.com/field-good-lab-poor' },
              metrics: {
                largest_contentful_paint: { percentiles: { p75: 2_000 } },
                interaction_to_next_paint: { percentiles: { p75: 150 } },
                cumulative_layout_shift: { percentiles: { p75: 0.05 } },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    })

    assert.match(report.headline, /Core Web Vitals are good/)
    assert.equal(
      report.topActions.some(
        (action) =>
          action.title === 'Investigate the current lab LCP regression',
      ),
      true,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('desktop lab actions follow the Lighthouse audit score', async () => {
  const { bin, dir } = await fakeLighthouseBin({
    lighthouseVersion: '13.4.0',
    categories: { performance: { score: 0.8 } },
    audits: {
      'largest-contentful-paint': {
        numericValue: 1_300,
        displayValue: '1.3 s',
        score: 0.4,
      },
    },
  })
  try {
    const report = await performanceAudit({
      url: 'https://example.com/desktop',
      strategy: 'desktop',
      lighthouseBin: bin,
      refresh: true,
    })

    assert.equal(report.metrics.largestContentfulPaint?.rating, 'poor')
    assert.equal(
      report.topActions.some(
        (action) => action.title === 'Improve the largest visible content',
      ),
      true,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
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

test('compact Lighthouse insights stay inside the global byte budget', async () => {
  const largeValue = 'x'.repeat(160)
  const audits = Object.fromEntries([
    [
      'largest-contentful-paint',
      { numericValue: 1_000, displayValue: '1.0 s', score: 1 },
    ],
    ...Array.from({ length: 12 }, (_, index) => [
      `large-${index}-insight`,
      {
        title: `Large insight ${index}`,
        score: 0,
        details: {
          overallSavingsMs: 1_000 - index,
          items: Array.from({ length: 5 }, () => ({
            a: largeValue,
            b: largeValue,
            c: largeValue,
            d: largeValue,
            e: largeValue,
          })),
        },
      },
    ]),
  ])
  const { bin, dir } = await fakeLighthouseBin({
    lighthouseVersion: '13.4.0',
    categories: { performance: { score: 0.9 } },
    audits,
  })
  try {
    const report = await performanceAudit({
      url: 'https://example.com/compact-insights',
      lighthouseBin: bin,
      refresh: true,
    })

    assert.equal(
      Buffer.byteLength(JSON.stringify(report.labInsights), 'utf8') <= 24_000,
      true,
    )
    assert.equal(report.labInsights.length <= 8, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
