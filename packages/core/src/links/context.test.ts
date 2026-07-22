import assert from 'node:assert/strict'
import test from 'node:test'
import type { CrawlReport } from '../analyze/crawler/report.js'
import type { CrawlPageSnapshot } from '../analyze/monitoring/types.js'
import type { GscRow } from '../types.js'
import { linkTargetContext } from './context.js'
import type { CollectedLinkEvidence } from './types.js'

function page(
  url: string,
  overrides: Partial<CrawlPageSnapshot> = {},
): CrawlPageSnapshot {
  return {
    url,
    finalUrl: url,
    status: 200,
    indexable: true,
    wordCount: 100,
    contentHash: `hash:${url}`,
    outgoingInternalCount: 0,
    ...overrides,
  }
}

function crawl(pages: CrawlPageSnapshot[]): CrawlReport {
  return {
    id: 'crawl-1',
    generatedAt: '2026-07-20T10:00:00.000Z',
    pages,
    issues: [],
  } as unknown as CrawlReport
}

function evidence(
  targets: Array<{ targetUrl: string; observedLinks: number }>,
): CollectedLinkEvidence {
  return {
    rows: [],
    targetCounts: targets,
    provenance: {
      provider: 'dataforseo',
      observedAt: '2026-07-22T08:00:00.000Z',
      cached: false,
      suppliedRows: 0,
      validRows: 0,
      invalidRows: 0,
      duplicateRows: 0,
      capped: false,
      rowLimit: 100,
      completeness: 'partial',
    },
    warnings: [],
  }
}

function gscRow(input: {
  page: string
  clicks: number
  impressions: number
  position: number
}): GscRow {
  return {
    keys: [input.page],
    clicks: input.clicks,
    impressions: input.impressions,
    ctr: input.impressions ? input.clicks / input.impressions : 0,
    position: input.position,
  }
}

test('link context joins crawl and aggregated Search Console evidence without inventing zeros', async () => {
  const targets = [
    { targetUrl: 'https://example.com/quiet', observedLinks: 1 },
    { targetUrl: 'https://example.com/broken', observedLinks: 2 },
    { targetUrl: 'https://example.com/redirect', observedLinks: 8 },
    { targetUrl: 'https://example.com/not-retained', observedLinks: 3 },
  ]
  let searchBody: { dimensions?: string[]; rowLimit?: number } | undefined
  const result = await linkTargetContext(
    {
      evidence: evidence(targets),
      crawlSite: 'sc-domain:example.com',
      searchConsoleSite: 'sc-domain:example.com',
      days: 90,
    },
    {
      latestCrawl: (site) => {
        assert.equal(site, 'sc-domain:example.com')
        return crawl([
          page('https://example.com/broken', {
            status: 404,
            indexable: false,
          }),
          page('https://example.com/redirect', {
            finalUrl: 'https://example.com/final',
          }),
          page('https://example.com/quiet'),
        ])
      },
      searchAnalytics: async (_site, body) => {
        searchBody = body
        return {
          rows: [
            gscRow({
              page: 'https://example.com/broken',
              clicks: 2,
              impressions: 40,
              position: 7,
            }),
            gscRow({
              page: 'https://example.com/broken#fragment',
              clicks: 1,
              impressions: 60,
              position: 13,
            }),
          ],
          calls: 1,
          rowsFetched: 2,
        }
      },
      now: () => new Date('2026-07-22T12:00:00.000Z'),
    },
  )

  assert.deepEqual(searchBody?.dimensions, ['page'])
  assert.equal(searchBody?.rowLimit, 25_000)
  assert.equal(result.dataStatus, 'complete')
  assert.deepEqual(
    result.rows.map((row) => row.targetUrl),
    [
      'https://example.com/redirect',
      'https://example.com/not-retained',
      'https://example.com/broken',
      'https://example.com/quiet',
    ],
  )
  const broken = result.rows.find(
    (row) => row.targetUrl === 'https://example.com/broken',
  )
  assert.deepEqual(broken?.searchConsole, {
    state: 'observed',
    clicks: 3,
    impressions: 100,
    ctr: 0.03,
    position: 10.6,
  })
  const missing = result.rows.find(
    (row) => row.targetUrl === 'https://example.com/not-retained',
  )
  assert.equal(missing?.searchConsole.state, 'not-retained')
  assert.equal(missing?.crawl.state, 'not-observed')
  assert.deepEqual(
    result.findings.map((item) => [item.code, item.priority]),
    [
      ['linked-broken-target', 'high'],
      ['linked-redirect-target', 'medium'],
    ],
  )
})

test('link context never falls back to an unrelated crawl', async () => {
  let crawlCalls = 0
  const result = await linkTargetContext(
    {
      evidence: evidence([
        { targetUrl: 'https://example.com/page', observedLinks: 1 },
      ]),
    },
    {
      latestCrawl: () => {
        crawlCalls += 1
        return crawl([page('https://unrelated.example/page')])
      },
      searchAnalytics: async () => ({ rows: [], calls: 0, rowsFetched: 0 }),
      now: () => new Date('2026-07-22T12:00:00.000Z'),
    },
  )

  assert.equal(crawlCalls, 0)
  assert.equal(result.dataStatus, 'unavailable')
  assert.equal(result.rows[0]?.crawl.state, 'unavailable')
  assert.equal(result.rows[0]?.searchConsole.state, 'unavailable')
})

test('link context preserves crawl findings when Search Console fails', async () => {
  const result = await linkTargetContext(
    {
      evidence: evidence([
        { targetUrl: 'https://example.com/missing', observedLinks: 1 },
      ]),
      crawlSite: 'https://example.com/',
      searchConsoleSite: 'sc-domain:example.com',
    },
    {
      latestCrawl: () =>
        crawl([
          page('https://example.com/missing', {
            status: 410,
            indexable: false,
          }),
        ]),
      searchAnalytics: async () => {
        throw new Error('fixture provider failure')
      },
      now: () => new Date('2026-07-22T12:00:00.000Z'),
    },
  )

  assert.equal(result.dataStatus, 'partial')
  assert.equal(result.rows[0]?.searchConsole.state, 'unavailable')
  assert.equal(result.findings[0]?.code, 'linked-broken-target')
  assert.match(result.warnings[0] ?? '', /fixture provider failure/)
})

test('link context keeps large sources bounded and reports capped Search Console rows', async () => {
  const targets = Array.from({ length: 1_000 }, (_, index) => ({
    targetUrl: `https://example.com/page-${index}`,
    observedLinks: 1_000 - index,
  }))
  const pages = Array.from({ length: 10_000 }, (_, index) =>
    page(`https://example.com/page-${index}`),
  )
  const searchRows = Array.from({ length: 25_000 }, (_, index) =>
    gscRow({
      page: `https://example.com/search-${index}`,
      clicks: 0,
      impressions: 1,
      position: 10,
    }),
  )
  let crawlCalls = 0
  let searchCalls = 0
  const result = await linkTargetContext(
    {
      evidence: evidence(targets),
      crawlSite: 'https://example.com/',
      searchConsoleSite: 'sc-domain:example.com',
    },
    {
      latestCrawl: () => {
        crawlCalls += 1
        return crawl(pages)
      },
      searchAnalytics: async () => {
        searchCalls += 1
        return { rows: searchRows, calls: 1, rowsFetched: 25_000 }
      },
      now: () => new Date('2026-07-22T12:00:00.000Z'),
    },
  )

  assert.equal(crawlCalls, 1)
  assert.equal(searchCalls, 1)
  assert.deepEqual(result.selection, {
    availableTargets: 1_000,
    returnedTargets: 100,
    omittedTargets: 900,
    limit: 100,
  })
  assert.equal(result.provenance.crawl.availablePages, 10_000)
  assert.equal(result.provenance.searchConsole.rowsFetched, 25_000)
  assert.equal(result.provenance.searchConsole.retainedRowLimitReached, true)
  assert.equal(result.dataStatus, 'partial')
  assert.equal(result.rows[0]?.searchConsole.state, 'not-retained')
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 150_000)
})
