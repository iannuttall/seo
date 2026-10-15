import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SeoError } from '../errors.js'
import { streamedArticleHtml } from '../extract/react-streaming.test-fixtures.js'
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
  assert.equal(report.page.canonical, undefined)
  assert.equal(report.page.canonicalEvidence?.status, 'invalid')
  assert.equal(report.page.canonicalEvidence?.candidates[0]?.raw, 'http://[::1')
  assert.equal(
    report.page.canonicalEvidence?.candidates[0]?.ignoredReason,
    'invalid-url',
  )
  assert.equal(report.issues[0]?.code, 'canonical_invalid')
  assert.ok(
    report.recommendations.every(
      (recommendation) =>
        recommendation.evidenceRef !== 'No canonical link tag detected.',
    ),
  )
})

test('auditPage does not select conflicting canonical declarations', async () => {
  const result = fetched('https://example.com/foo')
  result.headers.link = '<https://example.com/bar>; rel="canonical"'

  const report = await auditPage(
    { url: 'https://example.com/foo', extractor: 'readability' },
    dependencies(result),
  )

  assert.equal(report.page.canonical, undefined)
  assert.equal(report.page.canonicalEvidence?.status, 'conflicting')
  assert.deepEqual(
    report.page.canonicalEvidence?.candidates.map(
      (candidate) => candidate.source,
    ),
    ['html-head', 'http-header'],
  )
  assert.equal(report.issues[0]?.code, 'canonical_conflict')
})

test('auditPage reports streamed canonicals and still checks their target', async () => {
  const result = fetched('https://example.com/foo')
  result.html = streamedArticleHtml({
    canonicalUrl: 'https://example.com/preferred',
    metadata: 'body',
  })

  const report = await auditPage(
    { url: 'https://example.com/foo', extractor: 'readability' },
    dependencies(result),
  )

  assert.equal(report.page.canonicalEvidence?.status, 'streamed-outside-head')
  assert.deepEqual(
    report.issues
      .map((issue) => issue.code)
      .filter((code) => code.startsWith('canonical')),
    ['canonical_streamed_in_body', 'canonical_mismatch'],
  )
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
