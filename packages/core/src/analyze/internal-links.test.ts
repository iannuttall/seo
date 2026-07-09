import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SearchAnalyticsRequest } from '../gsc/client.js'
import type { ExtractedPage, GscRow, PageFetchResult } from '../types.js'
import { internalLinksReport } from './internal-links.js'

function diagnostics(url: string): PageFetchResult['diagnostics'] {
  return {
    source: 'network',
    cache: 'miss',
    fetched: true,
    rendered: false,
    blocked: false,
    durationMs: 10,
    retries: 0,
    rateLimit: {
      host: new URL(url).host,
      concurrency: 1,
      intervalCap: 1,
      intervalMs: 1_000,
    },
  }
}

function fetched(url: string, finalUrl = url, status = 200): PageFetchResult {
  return {
    url,
    finalUrl,
    status,
    headers: { 'content-type': 'text/html' },
    html: '<html><body><main>Fixture</main></body></html>',
    usedJs: false,
    diagnostics: diagnostics(url),
    warnings: [],
  }
}

function page(input: {
  url: string
  finalUrl?: string
  canonical?: string
  metaRobots?: string
  links?: ExtractedPage['links']
}): ExtractedPage {
  const finalUrl = input.finalUrl ?? input.url
  return {
    url: input.url,
    finalUrl,
    title: 'Fixture page',
    metaDescription: 'Fixture description',
    metaRobots: input.metaRobots,
    canonical: input.canonical,
    hasViewport: true,
    headings: [{ level: 1, text: 'Fixture page' }],
    links: input.links ?? [],
    hreflang: [],
    jsonLd: [],
    invalidJsonLdCount: 0,
    invalidJsonLdSamples: [],
    schemaTypes: [],
    openGraph: {},
    twitter: {},
    hasAuthor: false,
    hasDate: false,
    imagesTotal: 0,
    imagesMissingAlt: 0,
    oversizedImageCandidates: [],
    mixedContentUrls: [],
    semanticHtml: true,
    questionHeadings: 0,
    listCount: 0,
    tableCount: 0,
    structuredBlocks: 0,
    answerable: true,
    contentText: 'Fixture page content',
    wordCount: 3,
    contentExtraction: {
      requested: 'defuddle',
      used: 'defuddle',
      fallback: false,
      wordCountSource: 'defuddle',
      baseUrl: finalUrl,
    },
    warnings: [],
  }
}

function row(query: string, url: string, impressions: number): GscRow {
  return {
    keys: [query, url],
    clicks: Math.floor(impressions / 10),
    impressions,
    ctr: Math.floor(impressions / 10) / impressions,
    position: 4,
  }
}

test('validates the target property before provider or page calls', async () => {
  let calls = 0
  await assert.rejects(
    internalLinksReport(
      {
        site: 'sc-domain:example.com',
        targetUrl: 'https://other.example/target',
      },
      {
        searchAnalytics: async () => {
          calls += 1
          return { rows: [], calls: 0, rowsFetched: 0 }
        },
        fetch: async (url) => {
          calls += 1
          return fetched(url)
        },
        extract: async (result) => page({ url: result.url }),
        now: () => new Date('2026-07-09T12:00:00.000Z'),
      },
    ),
    /outside the Search Console property/i,
  )
  assert.equal(calls, 0)
})

test('uses target aliases, verifies placement, and excludes technical sources', async () => {
  const requested = 'https://example.com/target'
  const preferred = 'https://example.com/preferred'
  const requests: SearchAnalyticsRequest[] = []
  const sourceRows = [
    row('technical crawl audit', 'https://example.com/direct', 400),
    row('technical crawl audit', 'https://example.com/alias-link', 300),
    row('technical crawl audit', 'https://example.com/missing', 200),
    row('technical crawl audit', 'https://example.com/noindex', 100),
  ]
  const report = await internalLinksReport(
    {
      site: 'sc-domain:example.com',
      targetUrl: requested,
      days: 90,
      limit: 10,
      checkLimit: 10,
      includeBrand: true,
    },
    {
      searchAnalytics: async (_site, request) => {
        requests.push(request)
        const filter =
          request.dimensionFilterGroups?.[0]?.filters[0]?.expression
        const rows = filter
          ? [
              row(
                'technical crawl audit',
                filter,
                filter === requested ? 80 : 40,
              ),
            ]
          : sourceRows
        return { rows, calls: 1, rowsFetched: rows.length }
      },
      fetch: async (url) =>
        url === requested ? fetched(url, preferred) : fetched(url),
      extract: async (result) => {
        if (result.url === requested) {
          return page({
            url: requested,
            finalUrl: preferred,
            canonical: preferred,
          })
        }
        if (result.url.endsWith('/direct')) {
          return page({
            url: result.url,
            links: [
              {
                href: preferred,
                text: 'Preferred target',
                rel: [],
                internal: true,
                location: 'main-content',
              },
            ],
          })
        }
        if (result.url.endsWith('/alias-link')) {
          return page({
            url: result.url,
            links: Array.from({ length: 25 }, (_, index) => ({
              href: `${requested}/#details-${index}`,
              text: `Old target ${index}`,
              rel: [],
              internal: true,
              location: 'main-content',
            })),
          })
        }
        if (result.url.endsWith('/noindex')) {
          return page({ url: result.url, metaRobots: 'noindex, follow' })
        }
        return page({ url: result.url })
      },
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.deepEqual(report.range, {
    startDate: '2026-04-07',
    endDate: '2026-07-05',
  })
  assert.equal(requests.length, 3)
  assert.deepEqual(report.source.target.pageFilters, [requested, preferred])
  assert.equal(requests[0]?.maxRows, 100_000)
  assert.equal(requests[2]?.dimensionFilterGroups, undefined)
  assert.equal(report.target.preferredUrl, preferred)
  assert.equal(report.target.verification, 'verified')
  assert.deepEqual(report.target.technicalSignals, ['redirected'])
  assert.equal(report.selection.existingLinkExclusions, 1)
  assert.equal(report.selection.technicalExclusions, 1)
  assert.equal(report.summary.returnedSources, 2)
  assert.deepEqual(
    report.items.map((item) => item.actionType),
    ['update-alias-link', 'add-contextual-link'],
  )
  assert.equal(report.items[0]?.linkEvidence.status, 'alias-contextual')
  assert.equal(report.items[0]?.linkEvidence.observedCount, 25)
  assert.equal(report.items[0]?.linkEvidence.observed.length, 20)
  assert.equal(report.items[1]?.linkEvidence.status, 'missing')
  assert.equal(report.items[0]?.confidence, 'medium')
  assert.match(report.ledgerSummary, /GSC: 3 calls, 6 rows/)
})

test('blocks link actions when the target has a technical issue', async () => {
  const targetUrl = 'https://example.com/target'
  const report = await internalLinksReport(
    {
      site: 'sc-domain:example.com',
      targetUrl,
      includeBrand: true,
    },
    {
      searchAnalytics: async (_site, request) => {
        const filter =
          request.dimensionFilterGroups?.[0]?.filters[0]?.expression ??
          targetUrl
        return {
          rows: [row('technical crawl audit', filter, 100)],
          calls: 1,
          rowsFetched: 1,
        }
      },
      fetch: async (url) => fetched(url),
      extract: async (result) =>
        page({ url: result.url, metaRobots: 'noindex' }),
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.equal(report.dataStatus, 'target-technical-issue')
  assert.equal(report.source.candidates.queried, false)
  assert.equal(report.selection.checkedSources, 0)
  assert.equal(report.items.length, 0)
  assert.match(report.summary.verdict, /technical issue/i)
})

test('backfills failures until the check budget and reports unchecked sources', async () => {
  const targetUrl = 'https://example.com/target'
  const report = await internalLinksReport(
    {
      site: 'sc-domain:example.com',
      targetUrl,
      limit: 1,
      checkLimit: 2,
      includeBrand: true,
    },
    {
      searchAnalytics: async (_site, request) => {
        const filter =
          request.dimensionFilterGroups?.[0]?.filters[0]?.expression
        const rows = filter
          ? [row('technical crawl audit', filter, 100)]
          : [
              row('technical crawl audit', 'https://example.com/fails', 300),
              row('technical crawl audit', 'https://example.com/works', 200),
              row(
                'technical crawl audit',
                'https://example.com/unchecked',
                100,
              ),
            ]
        return { rows, calls: 1, rowsFetched: rows.length }
      },
      fetch: async (url) => {
        if (url.endsWith('/fails')) throw new Error('fixture fetch failure')
        return fetched(url)
      },
      extract: async (result) => page({ url: result.url }),
      now: () => new Date('2026-07-09T12:00:00.000Z'),
    },
  )

  assert.equal(report.selection.checkedSources, 2)
  assert.equal(report.selection.failedChecks, 1)
  assert.equal(report.selection.returnedSources, 1)
  assert.equal(report.selection.uncheckedCandidates, 1)
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.warnings[0]?.code, 'fetch-failed')
  assert.match(report.caveats.join('\n'), /not checked/)
})

test('propagates Search Console provider failures', async () => {
  const targetUrl = 'https://example.com/target'
  await assert.rejects(
    internalLinksReport(
      {
        site: 'sc-domain:example.com',
        targetUrl,
      },
      {
        searchAnalytics: async () => {
          throw new Error('provider unavailable')
        },
        fetch: async (url) => fetched(url),
        extract: async (result) => page({ url: result.url }),
        now: () => new Date('2026-07-09T12:00:00.000Z'),
      },
    ),
    /provider unavailable/,
  )
})
