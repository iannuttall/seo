import assert from 'node:assert/strict'
import test from 'node:test'
import type { ExtractedPage, GscRow, PageFetchDiagnostics } from '../types.js'
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

function diagnostics(
  overrides: Partial<PageFetchDiagnostics> = {},
): PageFetchDiagnostics {
  return {
    source: 'network',
    cache: 'miss',
    fetched: true,
    rendered: false,
    blocked: false,
    durationMs: 20,
    retries: 0,
    rateLimit: {
      host: 'example.com',
      concurrency: 2,
      intervalCap: 4,
      intervalMs: 1000,
    },
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

test('uses independent site peers when qualified and exposes fallback provenance', () => {
  const target = row({ query: 'technical seo guide', position: 5 })
  const siteResult = analyzePageOpportunitiesFromRows({
    targetRows: [target],
    benchmarkRows: sitePeers(),
    site,
    url,
    page: extractedPage(),
  })
  const fallbackResult = analyzePageOpportunitiesFromRows({
    targetRows: [target],
    benchmarkRows: sitePeers().slice(0, 2),
    site,
    url,
    page: extractedPage(),
  })

  assert.match(
    siteResult.items[0]?.benchmark.source ?? '',
    /^site_gsc_position_bucket_robust_p75/,
  )
  assert.equal(siteResult.items[0]?.benchmark.peerRows, 5)
  assert.equal(siteResult.items[0]?.benchmark.qualifiedPeerImpressions, 1000)
  assert.equal(
    fallbackResult.items[0]?.benchmark.source,
    'default_position_curve',
  )
  assert.equal(fallbackResult.items[0]?.benchmark.peerRows, 2)
})

test('excludes every target URL row from aggregate benchmarks', () => {
  const target = row({ query: 'technical seo guide', position: 5 })
  const targetBenchmarkRow = row({
    query: 'another target query',
    clicks: 1000,
    impressions: 1000,
    ctr: 1,
    position: 5,
  })
  const result = analyzePageOpportunitiesFromRows({
    targetRows: [target],
    benchmarkRows: [...sitePeers(), targetBenchmarkRow],
    site,
    url,
    page: extractedPage(),
  })

  assert.equal(result.excludedTargetBenchmarkRows, 1)
  assert.equal(result.items[0]?.benchmark.excludedTargetRows, 1)
  assert.equal(result.items[0]?.benchmark.peerRows, 5)
  assert.equal(result.items[0]?.benchmark.peerImpressions, 1000)
  assert.match(result.items[0]?.benchmark.source ?? '', /leave_group_out/)
})

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
  assert.match(item?.recommendation ?? '', /no CTR lift is claimed/)
})

test('keeps page-two ranking evidence when on-page verification is absent', () => {
  const result = analyzePageOpportunitiesFromRows({
    targetRows: [
      row({ query: 'technical seo guide', position: 14, clicks: 0, ctr: 0 }),
    ],
    benchmarkRows: sitePeers(),
    site,
    url,
  })

  assert.equal(result.items[0]?.verification.status, 'unverified')
  assert.equal(result.items[0]?.opportunityType, 'ranking')
  assert.equal(result.items[0]?.estimatedCtrClickShortfall, undefined)
})

test('keeps page-one CTR evidence when on-page verification is absent', () => {
  const result = analyzePageOpportunitiesFromRows({
    targetRows: [
      row({
        query: 'technical seo guide',
        impressions: 100,
        clicks: 0,
        ctr: 0,
      }),
    ],
    benchmarkRows: sitePeers(),
    site,
    url,
  })
  const item = result.items[0]

  assert.equal(item?.verification.status, 'unverified')
  assert.equal(item?.opportunityType, 'ctr')
  assert.equal(item?.expectedClicks, 5)
  assert.equal(item?.estimatedCtrClickShortfall, 5)
  assert.equal(item?.estimatedClickLift, 5)
})

test('labels technical and missing verification without calling either covered', () => {
  const target = row({ query: 'technical seo guide' })
  const redirected = analyzePageOpportunitiesFromRows({
    targetRows: [target],
    benchmarkRows: sitePeers(),
    site,
    url,
    page: extractedPage({ finalUrl: 'https://example.com/other' }),
    fetchDiagnostics: diagnostics(),
  })
  const failedFetch = analyzePageOpportunitiesFromRows({
    targetRows: [target],
    benchmarkRows: sitePeers(),
    site,
    url,
    fetchDiagnostics: diagnostics({ fetched: false }),
  })
  const notRun = analyzePageOpportunitiesFromRows({
    targetRows: [target],
    benchmarkRows: sitePeers(),
    site,
    url,
  })

  assert.equal(redirected.items[0]?.opportunityType, 'technical-check')
  assert.ok(redirected.items[0]?.verification.signals.includes('redirected'))
  assert.equal(failedFetch.items[0]?.opportunityType, 'technical-check')
  assert.deepEqual(failedFetch.items[0]?.verification.signals, [
    'fetch-incomplete',
  ])
  assert.equal(notRun.items[0]?.opportunityType, 'unverified')
  assert.equal(notRun.items[0]?.verification.status, 'unverified')
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

test('keeps valid cache hits non-technical and uses redirect-chain evidence once', () => {
  const targetRows = [row({ query: 'technical seo guide' })]
  const common = { targetRows, benchmarkRows: sitePeers(), site, url }
  const cacheHit = analyzePageOpportunitiesFromRows({
    ...common,
    page: extractedPage(),
    fetchDiagnostics: diagnostics({ source: 'cache', fetched: false }),
  })
  const redirected = analyzePageOpportunitiesFromRows({
    ...common,
    page: extractedPage({ finalUrl: `${url}/`, canonical: `${url}/` }),
    fetchDiagnostics: diagnostics({
      redirectChain: [{ url, status: 301, location: `${url}/` }],
    }),
  })

  assert.equal(cacheHit.items[0]?.verification.status, 'verified')
  assert.equal(cacheHit.items[0]?.opportunityType, 'covered')
  assert.deepEqual(redirected.items[0]?.verification.signals, ['redirected'])
  assert.equal(redirected.items[0]?.opportunityType, 'technical-check')
})

test('uses verified body gaps and meta omissions without overcalling coverage', () => {
  const targetRows = [row({ query: 'technical seo guide' })]
  const common = { targetRows, benchmarkRows: sitePeers(), site, url }
  const contentGap = analyzePageOpportunitiesFromRows({
    ...common,
    page: extractedPage({
      contentText: 'An unrelated article about gardening.',
    }),
  })
  const metaFraming = analyzePageOpportunitiesFromRows({
    ...common,
    page: extractedPage({ metaDescription: undefined }),
  })

  assert.equal(contentGap.items[0]?.opportunityType, 'content-gap')
  assert.equal(metaFraming.items[0]?.opportunityType, 'serp-framing')
  assert.match(metaFraming.items[0]?.recommendation ?? '', /meta description/)
})

test('preserves Unicode coverage evidence', () => {
  const query = 'تقنية تحسين محركات البحث'
  const result = analyzePageOpportunitiesFromRows({
    targetRows: [row({ query })],
    benchmarkRows: sitePeers(),
    site,
    url,
    page: extractedPage({
      title: query,
      metaDescription: query,
      headings: [{ level: 1, text: query }],
      contentText: `دليل شامل عن ${query}`,
    }),
  })

  assert.equal(result.items[0]?.verification.status, 'verified')
  assert.equal(
    result.items[0]?.verification.fields?.mainContent.termCoverage,
    1,
  )
  assert.equal(result.items[0]?.opportunityType, 'covered')
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

test('reports exact sequential selection and limit provenance', () => {
  const eligibleA = row({ query: 'technical seo guide' })
  const eligibleB = row({ query: 'seo audit checklist' })
  const invalid = { ...row({ query: 'invalid', impressions: 1 }), keys: [] }
  const result = analyzePageOpportunitiesFromRows({
    targetRows: [
      invalid,
      row({ query: 'wrong page', url: 'https://example.com/other' }),
      row({ query: 'below minimum', impressions: 9 }),
      row({ query: 'site:example.com' }),
      row({ query: 'Example guide' }),
      eligibleA,
      eligibleB,
    ],
    benchmarkRows: sitePeers(),
    site,
    url,
    brandTerms: ['example'],
    limit: 1,
  })

  assert.deepEqual(result.selection, {
    sourceRows: 7,
    invalidRows: 1,
    wrongPageRows: 1,
    belowMinimumRows: 1,
    lowActionabilityRows: 1,
    brandRows: 1,
    eligibleRows: 2,
    returnedRows: 1,
    limitedRows: 1,
  })
  assert.equal(result.summary.opportunities, 0)
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

test('breaks complete metric ties by query text', () => {
  const input = {
    benchmarkRows: sitePeers(),
    site,
    url,
    page: extractedPage({
      title: 'SEO guide alpha beta',
      metaDescription: 'SEO guide alpha beta',
      headings: [{ level: 1, text: 'SEO guide alpha beta' }],
      contentText: 'SEO guide alpha beta',
    }),
  }
  const result = analyzePageOpportunitiesFromRows({
    ...input,
    targetRows: [
      row({ query: 'seo guide beta' }),
      row({ query: 'seo guide alpha' }),
    ],
  })

  assert.deepEqual(
    result.items.map((item) => item.query),
    ['seo guide alpha', 'seo guide beta'],
  )
})
