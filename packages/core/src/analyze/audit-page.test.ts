import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SeoError } from '../errors.js'
import type { PageFetchResult } from '../types.js'
import { type AuditPageDependencies, auditPage } from './audit-page.js'

function fetched(canonical: string): PageFetchResult {
  return {
    url: 'https://example.com/foo',
    finalUrl: 'https://example.com/foo',
    status: 200,
    headers: { 'content-type': 'text/html' },
    html: `<!doctype html><html><head>
      <title>Canonical fixture page</title>
      <link rel="canonical" href="${canonical}">
    </head><body><main><h1>Canonical fixture</h1><p>Useful content.</p></main></body></html>`,
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: 'miss',
      fetched: true,
      rendered: false,
      blocked: false,
      durationMs: 10,
      retries: 0,
      rateLimit: {
        host: 'example.com',
        concurrency: 8,
        intervalCap: 30,
        intervalMs: 1_000,
      },
    },
    warnings: [],
  }
}

function dependencies(result: PageFetchResult): AuditPageDependencies {
  return {
    fetchPage: async () => result,
    queryPageMetrics: async () => ({
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      position: 3,
    }),
    now: () => new Date('2026-07-09T12:00:00.000Z'),
  }
}

test('auditPage reports malformed canonical evidence without throwing', async () => {
  const report = await auditPage(
    { url: 'https://example.com/foo', extractor: 'readability' },
    dependencies(fetched('http://[::1')),
  )

  assert.equal(report.fetchedAt, '2026-07-09T12:00:00.000Z')
  assert.equal(report.page.title, 'Canonical fixture page')
  assert.equal(report.page.canonical, 'http://[::1')
  assert.equal(report.issues[0]?.code, 'canonical_invalid')
})

test('auditPage preserves case-sensitive URL path identity', async () => {
  const report = await auditPage(
    { url: 'https://example.com/foo', extractor: 'readability' },
    dependencies(fetched('https://example.com/Foo')),
  )

  assert.ok(report.issues.some((issue) => issue.code === 'canonical_mismatch'))
})

test('auditPage does not hide Search Console provider errors', async () => {
  const deps = dependencies(fetched('https://example.com/foo'))
  deps.queryPageMetrics = async () => {
    throw new SeoError('AUTH_EXPIRED', 'Login expired.')
  }

  await assert.rejects(
    auditPage(
      {
        url: 'https://example.com/foo',
        site: 'sc-domain:example.com',
        extractor: 'readability',
      },
      deps,
    ),
    (error) => error instanceof SeoError && error.code === 'AUTH_EXPIRED',
  )
})
