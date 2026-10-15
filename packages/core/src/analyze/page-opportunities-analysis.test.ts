import assert from 'node:assert/strict'
import test from 'node:test'
import type { ExtractedPage, GscRow } from '../types.js'
import { analyzePageOpportunitiesFromRows } from './page-opportunities-analysis.js'

const site = 'sc-domain:example.com'
const url = 'https://example.com/guide'

function row(input: {
  query: string
  url?: string
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}): GscRow {
  const clicks = input.clicks ?? 5
  const impressions = input.impressions ?? 100
  return {
    keys: [input.query, input.url ?? url],
    clicks,
    impressions,
    ctr: input.ctr ?? clicks / impressions,
    position: input.position ?? 5,
  }
}

function extractedPage(overrides: Partial<ExtractedPage> = {}): ExtractedPage {
  return {
    url,
    finalUrl: url,
    title: 'Technical SEO guide',
    metaDescription: 'A practical technical SEO guide',
    canonical: '/guide',
    hasViewport: true,
    headings: [{ level: 1, text: 'Technical SEO guide' }],
    links: [],
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
    contentText: 'This technical SEO guide explains practical technical SEO.',
    wordCount: 9,
    contentExtraction: {
      requested: 'defuddle',
      used: 'defuddle',
      fallback: false,
      wordCountSource: 'defuddle',
      baseUrl: url,
    },
    warnings: [],
    ...overrides,
  }
}

function sitePeers(): GscRow[] {
  return Array.from({ length: 5 }, (_, index) =>
    row({
      query: `peer query ${index}`,
      url: `https://example.com/peer-${index}`,
      clicks: 10,
      impressions: 200,
      ctr: 0.05,
      position: 5,
    }),
  )
}

test('does not claim CTR lift for page-two queries', () => {
  const result = analyzePageOpportunitiesFromRows({
    targetRows: [
      row({
        query: 'technical seo guide',
        clicks: 0,
        ctr: 0,
        position: 14,
      }),
    ],
    benchmarkRows: sitePeers(),
    site,
    url,
    page: extractedPage(),
  })
  const item = result.items[0]

  assert.equal(item?.opportunityType, 'ranking')
  assert.equal(item?.estimatedClickLift, undefined)
  assert.equal(item?.estimatedCtrClickShortfall, undefined)
  assert.equal(item?.expectedClicks, undefined)
  assert.equal(item?.expectedCtr, undefined)
  assert.equal(item?.benchmark.applicable, false)
  assert.equal(item?.benchmark.source, 'not_applicable_outside_page_one')
})

test('treats non-2xx, noindex, and mismatched canonicals as technical', () => {
  const targetRows = [row({ query: 'technical seo guide' })]
  const common = { targetRows, benchmarkRows: sitePeers(), site, url }
  const notFound = analyzePageOpportunitiesFromRows({
    ...common,
    httpStatus: 404,
  })
  const noindex = analyzePageOpportunitiesFromRows({
    ...common,
    httpStatus: 200,
    page: extractedPage({ metaRobots: 'none' }),
  })
  const canonical = analyzePageOpportunitiesFromRows({
    ...common,
    page: extractedPage({ canonical: '/different-page' }),
  })
  const noContent = analyzePageOpportunitiesFromRows({
    ...common,
    httpStatus: 204,
  })

  assert.equal(notFound.items[0]?.opportunityType, 'technical-check')
  assert.equal(notFound.items[0]?.verification.httpStatus, 404)
  assert.ok(notFound.items[0]?.verification.signals.includes('http-non-2xx'))
  assert.ok(noindex.items[0]?.verification.signals.includes('meta-noindex'))
  assert.ok(
    canonical.items[0]?.verification.signals.includes('canonical-mismatch'),
  )
  assert.ok(
    noContent.items[0]?.verification.signals.includes('http-no-content'),
  )
})

test('distinguishes empty source data from rows removed by filters', () => {
  const empty = analyzePageOpportunitiesFromRows({
    targetRows: [],
    benchmarkRows: [],
    site,
    url,
  })
  const filtered = analyzePageOpportunitiesFromRows({
    targetRows: [row({ query: 'technical seo guide', impressions: 9 })],
    benchmarkRows: [],
    site,
    url,
  })

  assert.deepEqual(
    [
      empty.dataStatus,
      empty.sourceRows,
      empty.eligibleRows,
      empty.returnedRows,
    ],
    ['empty', 0, 0, 0],
  )
  assert.deepEqual(
    [
      filtered.dataStatus,
      filtered.sourceRows,
      filtered.eligibleRows,
      filtered.returnedRows,
    ],
    ['filtered', 1, 0, 0],
  )
  assert.equal(filtered.selection.belowMinimumRows, 1)
})

test('normalizes bounds and returns deterministic ordering', () => {
  const rows = Array.from({ length: 105 }, (_, index) =>
    row({
      query: `technical seo guide ${String(index).padStart(3, '0')}`,
      impressions: 50,
      clicks: 0,
      ctr: 0,
    }),
  )
  const input = {
    benchmarkRows: sitePeers(),
    site,
    url,
    page: extractedPage(),
    minImpressions: Number.NaN,
    limit: 999,
  }
  const forward = analyzePageOpportunitiesFromRows({
    ...input,
    targetRows: rows,
  })
  const reversed = analyzePageOpportunitiesFromRows({
    ...input,
    targetRows: [...rows].reverse(),
  })
  const minimums = analyzePageOpportunitiesFromRows({
    ...input,
    targetRows: rows,
    minImpressions: 0,
    limit: 0,
  })

  assert.equal(forward.minImpressions, 10)
  assert.equal(forward.limit, 100)
  assert.equal(forward.eligibleRows, 105)
  assert.equal(forward.returnedRows, 100)
  assert.deepEqual(
    forward.items.map((item) => item.query),
    reversed.items.map((item) => item.query),
  )
  assert.equal(minimums.minImpressions, 1)
  assert.equal(minimums.limit, 1)
  assert.equal(minimums.returnedRows, 1)
})
