import assert from 'node:assert/strict'
import { test } from 'node:test'
import { indexingRow, labelOf, sortRows } from './indexing.js'
import type { LiveCheck } from './page-facts.js'
import { indexStatusFrom } from './site.js'
import type { PageFacts } from './types.js'

// URL Inspection responses shaped like the API's, with the live responses
// a server sends for each case.

const inspection = (status: Record<string, unknown>) =>
  indexStatusFrom({
    inspectionResult: {
      indexStatusResult: { robotsTxtState: 'ALLOWED', ...status },
    },
  })

const page = (url: string, extra: Partial<PageFacts> = {}): PageFacts => ({
  url,
  status: 200,
  redirects_to: null,
  title: null,
  description: null,
  h1: null,
  canonical: url,
  robots: null,
  ...extra,
})

const redirect = (from: string, status: number, to: string): LiveCheck => ({
  first: page(from, { status, redirects_to: to, canonical: null }),
  hops: [
    {
      from,
      status,
      to,
      kind: status === 301 || status === 308 ? 'permanent' : 'temporary',
    },
  ],
  last: page(to),
})

const still = (facts: PageFacts): LiveCheck => ({
  first: facts,
  hops: [],
  last: facts,
})

test('labels Google reasons from the URL Inspection payload and live checks', () => {
  const sitemap = new Set(['https://example.com/docs', 'https://example.com/a'])
  const cases = [
    {
      url: 'https://example.com/mcp',
      status: inspection({
        verdict: 'NEUTRAL',
        coverageState: 'Blocked due to unauthorized request (401)',
        indexingState: 'INDEXING_ALLOWED',
        pageFetchState: 'ACCESS_DENIED',
        lastCrawlTime: '2026-10-18T13:39:40Z',
        crawledAs: 'MOBILE',
        referringUrls: ['https://example.com/docs'],
      }),
      live: still(
        page('https://example.com/mcp', {
          status: 401,
          canonical: null,
          www_authenticate: 'Bearer resource_metadata="https://example.com/x"',
        }),
      ),
      inSitemap: false,
      label: 'expected',
    },
    {
      url: 'http://example.com/docs',
      status: inspection({
        verdict: 'NEUTRAL',
        coverageState: 'Page with redirect',
        pageFetchState: 'SUCCESSFUL',
        googleCanonical: 'https://example.com/docs',
        referringUrls: ['http://example.com/'],
      }),
      live: redirect(
        'http://example.com/docs',
        301,
        'https://example.com/docs',
      ),
      inSitemap: false,
      label: 'expected',
    },
    {
      url: 'https://example.com/a',
      status: inspection({
        verdict: 'NEUTRAL',
        coverageState: 'Page with redirect',
        pageFetchState: 'SUCCESSFUL',
      }),
      live: redirect('https://example.com/a', 302, 'https://example.com/a/'),
      inSitemap: true,
      label: 'fix',
    },
    {
      url: 'https://example.com/gone',
      status: inspection({
        verdict: 'FAIL',
        coverageState: 'Not found (404)',
        pageFetchState: 'NOT_FOUND',
        referringUrls: ['https://example.com/docs'],
      }),
      live: still(page('https://example.com/gone', { status: 404 })),
      inSitemap: false,
      label: 'fix',
    },
    {
      url: 'https://example.com/old',
      status: inspection({
        verdict: 'FAIL',
        coverageState: 'Not found (404)',
        pageFetchState: 'NOT_FOUND',
      }),
      live: still(page('https://example.com/old', { status: 404 })),
      inSitemap: false,
      label: 'expected',
    },
    {
      url: 'https://example.com/b',
      status: inspection({
        verdict: 'NEUTRAL',
        coverageState: 'Crawled - currently not indexed',
        pageFetchState: 'SUCCESSFUL',
        lastCrawlTime: '2026-10-13T08:00:00Z',
      }),
      live: still(page('https://example.com/b')),
      inSitemap: true,
      label: 'check',
    },
    {
      url: 'https://example.com/c',
      status: inspection({
        verdict: 'NEUTRAL',
        coverageState: 'Excluded by ‘noindex’ tag',
        indexingState: 'BLOCKED_BY_META_TAG',
        lastCrawlTime: '2026-05-11T08:00:00Z',
      }),
      live: still(page('https://example.com/c')),
      inSitemap: true,
      label: 'check',
    },
    {
      url: 'https://example.com/d',
      status: inspection({
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        googleCanonical: 'https://example.com/e',
        userCanonical: 'https://example.com/d',
      }),
      live: still(page('https://example.com/d')),
      inSitemap: true,
      label: 'check',
    },
    {
      url: 'https://example.com/docs',
      status: inspection({
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        googleCanonical: 'https://example.com/docs',
        userCanonical: 'https://example.com/docs',
        sitemap: ['https://example.com/sitemap.xml'],
      }),
      live: still(page('https://example.com/docs')),
      inSitemap: true,
      label: 'indexed',
    },
  ]
  for (const item of cases) {
    const { label } = labelOf({ ...item, sitemap })
    assert.equal(label, item.label, item.url)
  }

  const first = cases[0]
  assert.ok(first)
  assert.deepEqual(
    {
      fetch: first.status.page_fetch,
      referring: first.status.referring_urls,
      crawled: first.status.crawled_as,
    },
    {
      fetch: 'ACCESS_DENIED',
      referring: ['https://example.com/docs'],
      crawled: 'MOBILE',
    },
  )

  // Reason first, then URL, whatever order the inspections finish in.
  const rows = sortRows(
    [...cases].reverse().map((item) => indexingRow({ ...item, sitemap }, [])),
  )
  assert.deepEqual(
    rows.map((row) => `${row.reason} ${row.url}`),
    [
      'Blocked due to unauthorized request (401) https://example.com/mcp',
      'Crawled - currently not indexed https://example.com/b',
      'Excluded by ‘noindex’ tag https://example.com/c',
      'Not found (404) https://example.com/gone',
      'Not found (404) https://example.com/old',
      'Page with redirect http://example.com/docs',
      'Page with redirect https://example.com/a',
      'Submitted and indexed https://example.com/d',
      'Submitted and indexed https://example.com/docs',
    ],
  )
})
