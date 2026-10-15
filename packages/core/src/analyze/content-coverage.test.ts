import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  ExtractedPage,
  PageFetchDiagnostics,
  PageFetchResult,
} from '../types.js'
import {
  queryContentCoverageFromPage,
  verifyQueryContent,
} from './content-coverage.js'

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
