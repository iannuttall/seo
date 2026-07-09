import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  ExtractedPage,
  PageFetchDiagnostics,
  PageFetchResult,
} from '../types.js'
import {
  contentCoverageRecommendation,
  measureCoverage,
  normalizeForCoverage,
  queryContentCoverageFromPage,
  verifyQueryContent,
} from './content-coverage.js'

test('normalizeForCoverage folds accents and apostrophe variants', () => {
  assert.equal(normalizeForCoverage('Peoplé’s surname'), 'peoples surname')
  assert.equal(normalizeForCoverage('peoples surname'), 'peoples surname')
})

test('normalizeForCoverage preserves non-Latin scripts', () => {
  assert.equal(
    normalizeForCoverage('تويتر: بحث بدون حساب'),
    'تويتر بحث بدون حساب',
  )
  assert.equal(normalizeForCoverage('技术 搜索引擎优化'), '技术 搜索引擎优化')
})

test('measureCoverage counts normalized phrase matches', () => {
  const coverage = measureCoverage(
    'peoples surname',
    'This page explains Peoplé’s surname distribution.',
  )

  assert.equal(coverage.phraseCount, 1)
  assert.deepEqual(coverage.missingTerms, [])
})

test('measureCoverage separates phrase match from term coverage', () => {
  const coverage = measureCoverage(
    'origin of the last name laroya',
    'Laroya appears in census records. This page discusses last name origin.',
  )

  assert.equal(coverage.phraseCount, 0)
  assert.equal(coverage.termCoverage, 1)
})

test('measureCoverage matches Arabic and CJK content', () => {
  const arabic = measureCoverage(
    'تويتر بحث بدون حساب',
    'دليل تويتر بحث بدون حساب للمبتدئين.',
  )
  const cjk = measureCoverage('搜索引擎优化', '搜索引擎优化技术指南')

  assert.equal(arabic.phraseCount, 1)
  assert.equal(arabic.termCoverage, 1)
  assert.equal(cjk.termCoverage, 1)
})

function page(input: Partial<ExtractedPage> = {}): ExtractedPage {
  return {
    url: 'https://example.com/page/',
    finalUrl: input.finalUrl ?? 'https://example.com/page/',
    title: input.title ?? 'Laroya surname origin and popularity',
    metaDescription: input.metaDescription ?? 'Learn about Laroya origin.',
    metaRobots: undefined,
    xRobotsTag: undefined,
    canonical: undefined,
    lang: 'en',
    hasViewport: true,
    headings: input.headings ?? [{ level: 1, text: 'Laroya surname' }],
    links: [],
    hreflang: [],
    jsonLd: [],
    invalidJsonLdCount: 0,
    invalidJsonLdSamples: [],
    schemaTypes: [],
    openGraph: {},
    twitter: {},
    author: undefined,
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
    contentText:
      input.contentText ??
      'Laroya is a last name. This page covers origin, popularity, rarity, and Philippines census data.',
    excerpt: undefined,
    wordCount: 100,
    contentExtraction: {
      requested: 'defuddle',
      used: 'defuddle',
      fallback: false,
      wordCountSource: 'defuddle',
      baseUrl: input.finalUrl ?? 'https://example.com/page/',
    },
    warnings: [],
    ...input,
  }
}

function diagnostics(
  input: Partial<PageFetchDiagnostics> = {},
): PageFetchDiagnostics {
  return {
    source: 'network',
    cache: 'miss',
    fetched: true,
    rendered: false,
    blocked: false,
    durationMs: 10,
    retries: 0,
    rateLimit: {
      host: 'example.com',
      concurrency: 2,
      intervalCap: 4,
      intervalMs: 1000,
    },
    ...input,
  }
}

test('contentCoverageRecommendation explains field-specific wording gaps', () => {
  const coverage = queryContentCoverageFromPage({
    query: 'origin of the last name laroya',
    url: 'https://example.com/page/',
    page: page(),
  })

  assert.equal(coverage.classification, 'serp-framing')
  assert.match(contentCoverageRecommendation(coverage), /title/)
  assert.match(contentCoverageRecommendation(coverage), /H1/)
  assert.match(contentCoverageRecommendation(coverage), /important terms/)
  assert.match(contentCoverageRecommendation(coverage), /do not make/)
  assert.match(
    contentCoverageRecommendation(coverage),
    /origin of the last name laroya/,
  )
})

test('contentCoverageRecommendation names missing body terms', () => {
  const coverage = queryContentCoverageFromPage({
    query: 'air pasang surut batu pahat',
    url: 'https://example.com/page/',
    page: page({
      title: 'Batu Pahat tide times',
      headings: [{ level: 1, text: 'Batu Pahat tide times' }],
      contentText: 'Batu Pahat tide times and tide chart.',
    }),
  })

  assert.equal(coverage.classification, 'content-gap')
  assert.match(contentCoverageRecommendation(coverage), /air/)
  assert.match(contentCoverageRecommendation(coverage), /pasang/)
})

test('contentCoverageRecommendation flags redirected GSC URLs first', () => {
  const coverage = queryContentCoverageFromPage({
    query: 'salary for plumber',
    url: 'https://example.com/city/plumber/',
    page: page({
      finalUrl: 'https://example.com/country/plumber/',
      title: 'Plumber salary',
      headings: [{ level: 1, text: 'Plumber salary' }],
      contentText: 'Plumber salary by country.',
    }),
  })

  assert.equal(coverage.classification, 'technical-check')
  assert.match(contentCoverageRecommendation(coverage), /resolves/)
  assert.match(contentCoverageRecommendation(coverage), /salary for plumber/)
})

test('queryContentCoverageFromPage does not invent Arabic content gaps', () => {
  const query = 'تويتر بحث بدون حساب'
  const coverage = queryContentCoverageFromPage({
    query,
    url: 'https://example.com/page/',
    page: page({
      title: query,
      metaDescription: `دليل ${query}`,
      headings: [{ level: 1, text: query }],
      contentText: `هذا دليل ${query} للمبتدئين.`,
    }),
  })

  assert.equal(coverage.classification, 'covered')
  assert.deepEqual(coverage.fields.mainContent.missingTerms, [])
})

test('classifies HTTP, robots, canonical, redirect, and block evidence first', () => {
  const common = {
    query: 'laroya surname',
    url: 'https://example.com/page/',
  }
  const cases = [
    {
      signal: 'http-non-2xx',
      coverage: queryContentCoverageFromPage({
        ...common,
        page: page(),
        httpStatus: 404,
      }),
    },
    {
      signal: 'http-no-content',
      coverage: queryContentCoverageFromPage({
        ...common,
        page: page(),
        httpStatus: 204,
      }),
    },
    {
      signal: 'meta-noindex',
      coverage: queryContentCoverageFromPage({
        ...common,
        page: page({ metaRobots: 'none' }),
      }),
    },
    {
      signal: 'x-robots-noindex',
      coverage: queryContentCoverageFromPage({
        ...common,
        page: page({ xRobotsTag: 'noindex, follow' }),
      }),
    },
    {
      signal: 'canonical-mismatch',
      coverage: queryContentCoverageFromPage({
        ...common,
        page: page({ canonical: '/different/' }),
      }),
    },
    {
      signal: 'redirected',
      coverage: queryContentCoverageFromPage({
        ...common,
        page: page(),
        fetchDiagnostics: diagnostics({
          redirectChain: [
            {
              url: 'https://example.com/page',
              status: 301,
              location: 'https://example.com/page/',
            },
          ],
        }),
      }),
    },
    {
      signal: 'blocked',
      coverage: queryContentCoverageFromPage({
        ...common,
        page: page(),
        fetchDiagnostics: diagnostics({ blocked: true }),
      }),
    },
  ]

  for (const item of cases) {
    assert.equal(item.coverage.classification, 'technical-check')
    assert.ok(item.coverage.signals.some((signal) => signal === item.signal))
  }
})

test('preserves structured status, warnings, and deterministic verification time', () => {
  const coverage = queryContentCoverageFromPage({
    query: 'laroya surname',
    url: 'https://example.com/page/',
    page: page({ warnings: ['Extraction warning'] }),
    httpStatus: 200,
    warnings: ['Fetch warning'],
    verifiedAt: '2026-07-09T12:00:00.000Z',
  })

  assert.equal(coverage.httpStatus, 200)
  assert.equal(coverage.verifiedAt, '2026-07-09T12:00:00.000Z')
  assert.deepEqual(coverage.warnings, ['Fetch warning', 'Extraction warning'])
})

test('keeps valid cache hits out of technical classification', () => {
  const coverage = queryContentCoverageFromPage({
    query: 'laroya surname',
    url: 'https://example.com/page/',
    page: page(),
    httpStatus: 200,
    fetchDiagnostics: diagnostics({ source: 'cache', fetched: false }),
  })

  assert.equal(coverage.signals.includes('fetch-incomplete'), false)
  assert.notEqual(coverage.classification, 'technical-check')
})

test('uses meaningful field coverage instead of requiring an exact title phrase', () => {
  const coverage = queryContentCoverageFromPage({
    query: 'origin of the last name laroya',
    url: 'https://example.com/page/',
    page: page({
      title: 'Laroya last name origin',
      metaDescription: 'Laroya last name origin explained',
      headings: [{ level: 1, text: 'Laroya last name origin' }],
      contentText: 'Laroya last name origin and historical records.',
    }),
  })

  assert.ok(coverage.signals.includes('exact-phrase-missing'))
  assert.equal(coverage.classification, 'covered')
})

test('includes meta-description term gaps in SERP framing', () => {
  const coverage = queryContentCoverageFromPage({
    query: 'laroya surname',
    url: 'https://example.com/page/',
    page: page({
      title: 'Laroya surname',
      metaDescription: 'Read the complete guide',
      headings: [{ level: 1, text: 'Laroya surname' }],
      contentText: 'Laroya surname history and distribution.',
    }),
  })

  assert.ok(coverage.signals.includes('meta-description-gap'))
  assert.equal(coverage.classification, 'serp-framing')
})

test('verifyQueryContent preserves fetch evidence when extraction fails', async () => {
  const fetched: PageFetchResult = {
    url: 'https://example.com/page/',
    finalUrl: 'https://example.com/page/',
    status: 200,
    headers: {},
    html: '<html></html>',
    usedJs: false,
    diagnostics: diagnostics(),
    warnings: ['Fetch warning'],
  }
  const coverage = await verifyQueryContent({
    query: 'laroya surname',
    url: fetched.url,
    verifiedAt: '2026-07-09T12:00:00.000Z',
    fetch: async () => fetched,
    extract: async () => {
      throw new Error('Extraction failed')
    },
  })

  assert.equal(coverage.status, 'failed')
  assert.equal(coverage.classification, 'fetch-failed')
  assert.equal(coverage.httpStatus, 200)
  assert.deepEqual(coverage.warnings, ['Fetch warning'])
  assert.equal(coverage.verifiedAt, '2026-07-09T12:00:00.000Z')
  assert.notEqual(coverage.classification, 'covered')
})
