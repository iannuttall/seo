import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listRules } from '../../rules.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import { auditCrawlPages, auditCrawlRequests } from './audit.js'

function page(input: Partial<CrawlPageSnapshot> = {}): CrawlPageSnapshot {
  const url = input.url ?? 'https://example.com/page'
  const finalUrl = input.finalUrl ?? url
  const canonical = 'canonical' in input ? input.canonical : finalUrl
  return {
    status: 200,
    contentType: 'text/html',
    title: 'A useful page title for search teams',
    metaDescription:
      'A useful page description that explains the page value for search teams.',
    h1: 'Useful page',
    h1Count: 1,
    h2Count: 2,
    h3Count: 1,
    indexable: true,
    wordCount: 500,
    contentHash: 'hash',
    hasViewport: true,
    lang: 'en',
    imagesTotal: 1,
    imagesMissingAlt: 0,
    outgoingInternalCount: 1,
    schemaTypes: ['Article'],
    invalidJsonLdCount: 0,
    invalidJsonLdSamples: [],
    openGraphTitle: 'A useful page title for search teams',
    openGraphDescription:
      'A useful page description that explains the page value for sharing.',
    openGraphImage: 'https://example.com/share.jpg',
    twitterCard: 'summary',
    geo: {
      semanticHtml: true,
      structuredData: true,
      hasAuthor: true,
      hasDate: true,
      questionHeadings: 1,
      structuredBlocks: 1,
      answerable: true,
    },
    ...input,
    url,
    finalUrl,
    canonical,
  }
}

test('auditCrawlRequests preserves failures and redirect request identity', () => {
  const issues = auditCrawlRequests([
    {
      requestedUrl: 'https://missing.example/',
      outcome: 'failure',
      durationMs: 250,
      failureKind: 'dns',
      error: 'getaddrinfo ENOTFOUND missing.example',
      extraction: 'not-applicable',
    },
    {
      requestedUrl: 'https://example.com/old',
      outcome: 'response',
      finalUrl: 'https://example.com/new',
      status: 200,
      redirectChain: [
        {
          url: 'https://example.com/old',
          status: 301,
          location: 'https://example.com/new',
        },
      ],
      extraction: 'complete',
    },
    {
      requestedUrl: 'https://example.com/missing',
      outcome: 'response',
      finalUrl: 'https://example.com/missing',
      status: 404,
      extraction: 'complete',
    },
    {
      requestedUrl: 'https://example.com/error',
      outcome: 'response',
      finalUrl: 'https://example.com/error',
      status: 500,
      extraction: 'complete',
    },
    {
      requestedUrl: 'https://example.com/cancelled',
      outcome: 'failure',
      failureKind: 'aborted',
      error: 'The operation was aborted.',
      extraction: 'not-applicable',
    },
  ])

  assert.deepEqual(
    issues.map((issue) => [issue.ruleId, issue.url]),
    [
      ['connection_error', 'https://missing.example/'],
      ['redirected_url', 'https://example.com/old'],
    ],
  )
  assert.equal(issues[0]?.evidence?.failureKind, 'dns')
  assert.equal(issues[1]?.evidence?.status, 301)
  assert.equal(issues[1]?.evidence?.finalStatus, 200)
})

test('non-HTML responses skip HTML-only findings', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/api',
      finalUrl: 'https://example.com/api',
      contentType: 'application/json',
      title: undefined,
      metaDescription: undefined,
      canonical: undefined,
      h1: undefined,
      h1Count: 0,
      wordCount: 0,
      hasViewport: false,
      lang: undefined,
      schemaTypes: [],
      openGraphTitle: undefined,
      openGraphDescription: undefined,
      openGraphImage: undefined,
      twitterCard: undefined,
      xRobotsTag: 'noindex',
      indexable: false,
      indexability: 'X-Robots-Tag noindex',
      declaredIndexability: 'not-html',
      extractionStatus: 'not-applicable',
    }),
  ])

  assert.deepEqual(
    issues.map((issue) => issue.ruleId),
    ['x_robots_noindex'],
  )
})

test('unknown response media types do not invent HTML findings', () => {
  const issues = auditCrawlPages([
    page({
      contentType: undefined,
      canonical: undefined,
      title: undefined,
      metaDescription: undefined,
      h1: undefined,
      h1Count: 0,
      indexable: false,
      wordCount: 0,
      extractionStatus: 'not-applicable',
    }),
  ])

  assert.deepEqual(issues, [])
})

test('redirect aliases are not audited as destination documents', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/old',
      finalUrl: 'https://example.com/new',
      title: undefined,
      metaDescription: undefined,
      canonical: undefined,
      h1: undefined,
      h1Count: 0,
      wordCount: 0,
    }),
  ])

  assert.deepEqual(
    issues.map((issue) => issue.ruleId),
    ['redirected_url'],
  )
})

test('noindex and non-self canonical remain separate observed signals', () => {
  const issues = auditCrawlPages([
    page({
      canonical: 'https://example.com/preferred',
      metaRobots: 'noindex',
      indexable: false,
      indexability: 'Meta robots noindex',
      declaredIndexability: 'noindex',
    }),
  ])

  assert.deepEqual(
    issues
      .filter((issue) =>
        ['noindex', 'canonicalized_page', 'canonical_mismatch'].includes(
          issue.ruleId,
        ),
      )
      .map((issue) => issue.ruleId),
    ['noindex', 'canonical_mismatch'],
  )
})

test('auditCrawlPages has issue-producing coverage for every rule family', () => {
  const registryFamilies = [
    ...new Set(listRules().map((rule) => rule.category)),
  ].sort()
  const issues = auditCrawlPages(
    [
      page({
        url: 'https://example.com/broken',
        finalUrl: 'https://example.com/broken',
        status: 404,
        internalInlinkCount: 1,
      }),
      page({
        url: 'http://example.com/bad-template',
        finalUrl: 'http://example.com/bad-template',
        contentType: 'text/html',
        sizeBytes: 20_000,
        compression: undefined,
        isHttps: false,
        title: undefined,
        metaDescription: undefined,
        canonical: undefined,
        h1: undefined,
        h1Count: 0,
        metaRobots: 'noindex',
        indexable: false,
        indexability: 'Meta robots noindex',
        wordCount: 80,
        textRatio: 0.03,
        imagesTotal: 1,
        imagesMissingAlt: 1,
        hasViewport: false,
        lang: undefined,
        schemaTypes: [],
        invalidJsonLdCount: 1,
        invalidJsonLdSamples: [{ snippet: '{', error: 'Unexpected end' }],
        openGraphTitle: undefined,
        openGraphDescription: undefined,
        openGraphImage: undefined,
        twitterCard: undefined,
        geo: {
          semanticHtml: false,
          structuredData: false,
          hasAuthor: false,
          hasDate: false,
          questionHeadings: 0,
          structuredBlocks: 0,
          answerable: false,
          hasLlmsTxt: false,
          llmsTxtUrl: 'https://example.com/llms.txt',
          llmsTxtStatus: 404,
        },
      }),
    ],
    { startUrl: 'http://example.com/bad-template' },
  )
  const coveredFamilies = [
    ...new Set(issues.map((issue) => issue.category)),
  ].sort()

  assert.deepEqual(coveredFamilies, registryFamilies)
})

test('auditCrawlPages flags response errors first', () => {
  const issues = auditCrawlPages([
    page({ status: 0, error: 'fetch failed' }),
    page({ status: 404 }),
    page({ url: 'https://example.com/500', status: 500 }),
    page({ url: 'https://example.com/raw-redirect', status: 302 }),
  ])

  assert.deepEqual(
    issues.map((issue) => issue.ruleId),
    ['connection_error', 'client_error', 'server_error', 'redirected_url'],
  )
  assert.equal(issues[0]?.evidence?.error, 'fetch failed')
})

test('auditCrawlPages flags redirected URLs with final target evidence', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/old',
      finalUrl: 'https://example.com/new',
      canonical: 'https://example.com/new',
    }),
  ])

  assert.equal(issues[0]?.ruleId, 'redirected_url')
  assert.equal(issues[0]?.evidence?.finalUrl, 'https://example.com/new')
})

test('auditCrawlPages flags redirect chains and slow responses', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/old',
      finalUrl: 'https://example.com/final',
      canonical: 'https://example.com/final',
      responseTimeMs: 2_500,
      fetchDiagnostics: {
        source: 'network',
        cache: 'miss',
        fetched: true,
        rendered: false,
        blocked: false,
        durationMs: 2_500,
        retries: 0,
        rateLimit: {
          host: 'example.com',
          concurrency: 8,
          intervalCap: 4,
          intervalMs: 1000,
        },
        redirectChain: [
          {
            url: 'https://example.com/old',
            status: 301,
            location: 'https://example.com/mid',
          },
          {
            url: 'https://example.com/mid',
            status: 301,
            location: 'https://example.com/final',
          },
        ],
      },
    }),
  ])

  assert.deepEqual(
    issues
      .filter((issue) => issue.category === 'response')
      .map((issue) => issue.ruleId),
    ['redirected_url', 'redirect_chain', 'slow_response'],
  )
  assert.equal(issues[1]?.evidence?.hops, 2)
  assert.equal(issues[2]?.evidence?.thresholdMs, 2000)
})

test('auditCrawlPages flags performance and security issues', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/heavy',
      contentType: 'text/html; charset=utf-8',
      sizeBytes: 2_500_000,
      compression: undefined,
      isHttps: true,
      hasHsts: true,
    }),
    page({
      url: 'http://example.com/plain',
      finalUrl: 'http://example.com/plain',
      contentType: 'text/html',
      sizeBytes: 20_000,
      isHttps: false,
    }),
    page({
      url: 'https://example.com/mixed',
      contentType: 'text/html',
      sizeBytes: 20_000,
      compression: 'br',
      isHttps: true,
      hasHsts: false,
      mixedContentCount: 2,
      mixedContentSamples: [
        'http://cdn.example/image.jpg',
        'http://cdn.example/app.js',
      ],
    }),
  ])

  assert.deepEqual(
    issues
      .filter(
        (issue) =>
          issue.category === 'performance' || issue.category === 'security',
      )
      .map((issue) => issue.ruleId),
    [
      'large_html',
      'no_compression',
      'no_compression',
      'http_not_secure',
      'mixed_content',
      'hsts_missing',
    ],
  )
  assert.equal(
    issues.find((issue) => issue.ruleId === 'large_html')?.evidence
      ?.thresholdBytes,
    2 * 1024 * 1024,
  )
  assert.deepEqual(
    issues.find((issue) => issue.ruleId === 'mixed_content')?.evidence
      ?.mixedContentSamples,
    ['http://cdn.example/image.jpg', 'http://cdn.example/app.js'],
  )
})

test('auditCrawlPages flags link issues', () => {
  const issues = auditCrawlPages(
    [
      page({
        url: 'https://example.com/missing',
        finalUrl: 'https://example.com/missing',
        status: 404,
        internalInlinkCount: 2,
      }),
      page({
        url: 'https://example.com/source',
        externalLinkChecks: [
          { url: 'https://external.example/missing', status: 404 },
        ],
      }),
      page({
        url: 'https://example.com/orphan',
        internalInlinkCount: 0,
      }),
      page({
        url: 'https://example.com/deep',
        internalInlinkCount: 2,
        crawlDepth: 5,
      }),
      page({
        url: 'https://example.com/money',
        internalInlinkCount: 1,
        searchMetrics: {
          clicks: 5,
          impressions: 200,
          ctr: 0.025,
          position: 6,
        },
      }),
    ],
    { startUrl: 'https://example.com/source' },
  )

  assert.deepEqual(
    issues
      .filter((issue) => issue.category === 'links')
      .map((issue) => issue.ruleId),
    [
      'broken_internal_link',
      'broken_external_link',
      'orphan_page',
      'deep_page',
      'weak_internal_links_to_valuable_page',
    ],
  )
})

test('auditCrawlPages flags high-value on-page issues', () => {
  const issues = auditCrawlPages([
    page({
      title: undefined,
      metaDescription: undefined,
      canonical: undefined,
      h1: undefined,
      h1Count: 0,
      metaRobots: 'noindex',
      indexable: false,
      indexability: 'Meta robots noindex',
      wordCount: 80,
      imagesTotal: 2,
      imagesMissingAlt: 1,
      oversizedImageCandidates: [
        {
          src: 'https://example.com/hero-2400x1200.jpg',
          width: 2400,
          height: 1200,
          detectedFrom: 'width,filename',
        },
      ],
      hasViewport: false,
      lang: undefined,
      geo: undefined,
    }),
  ])

  assert.deepEqual(
    issues.map((issue) => issue.ruleId),
    [
      'missing_title',
      'missing_meta_description',
      'h1_missing',
      'canonical_missing',
      'noindex',
      'thin_content',
      'image_missing_alt',
      'image_oversized_candidate',
      'viewport_missing',
      'lang_missing',
    ],
  )
  assert.deepEqual(
    issues.find((issue) => issue.ruleId === 'image_oversized_candidate')
      ?.evidence?.candidates,
    [
      {
        src: 'https://example.com/hero-2400x1200.jpg',
        width: 2400,
        height: 1200,
        detectedFrom: 'width,filename',
      },
    ],
  )
})

test('auditCrawlPages flags mobile and international issues', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/mobile',
      hasViewport: false,
      lang: undefined,
    }),
    page({
      url: 'https://example.com/uk',
      lang: 'en',
      hreflang: [
        { hreflang: 'fr-ca', href: 'https://example.com/ca-fr' },
        { hreflang: 'fr-ca', href: 'https://example.com/ca-fr-copy' },
        { hreflang: 'english-uk', href: 'https://example.com/uk' },
      ],
    }),
  ])

  assert.deepEqual(
    issues
      .filter(
        (issue) =>
          issue.category === 'mobile' || issue.category === 'international',
      )
      .map((issue) => issue.ruleId),
    [
      'viewport_missing',
      'lang_missing',
      'hreflang_invalid',
      'hreflang_duplicate',
      'hreflang_incomplete',
    ],
  )
  assert.deepEqual(
    issues.find((issue) => issue.ruleId === 'hreflang_invalid')?.evidence
      ?.invalid,
    [{ hreflang: 'english-uk', href: 'https://example.com/uk' }],
  )
  assert.deepEqual(
    issues.find((issue) => issue.ruleId === 'hreflang_duplicate')?.evidence
      ?.duplicateCodes,
    ['fr-ca'],
  )
})

test('auditCrawlPages flags heading issues', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/no-h1',
      h1: undefined,
      h1Count: 0,
      h2Count: 2,
      h3Count: 1,
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/multiple-h1',
      h1Count: 3,
      h2Count: 2,
      h3Count: 1,
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/weak-outline',
      h2Count: 0,
      h3Count: 0,
      wordCount: 600,
      internalInlinkCount: 1,
    }),
  ])

  assert.deepEqual(
    issues
      .filter((issue) => issue.category === 'headings')
      .map((issue) => issue.ruleId),
    ['h1_missing', 'multiple_h1', 'heading_structure_weak'],
  )
  assert.deepEqual(
    issues.find((issue) => issue.ruleId === 'heading_structure_weak')?.evidence
      ?.minWords,
    300,
  )
})

test('auditCrawlPages flags indexability issues', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/meta-noindex',
      metaRobots: 'noindex, nofollow',
      indexable: false,
      indexability: 'Meta robots noindex',
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/header-noindex',
      xRobotsTag: 'noindex',
      indexable: false,
      indexability: 'X-Robots-Tag noindex',
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/blocked',
      robotsTxt: {
        url: 'https://example.com/robots.txt',
        allowed: false,
        matchedLine: 'Disallow: /blocked',
      },
      indexable: false,
      indexability: 'Robots.txt disallowed',
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/canonicalized',
      finalUrl: 'https://example.com/canonicalized',
      canonical: 'https://example.com/preferred',
      indexable: false,
      indexability: 'Canonicalized',
      internalInlinkCount: 1,
    }),
  ])

  assert.deepEqual(
    issues
      .filter((issue) => issue.category === 'indexability')
      .map((issue) => issue.ruleId),
    [
      'noindex',
      'nofollow',
      'x_robots_noindex',
      'robots_blocked',
      'canonicalized_page',
    ],
  )
  assert.deepEqual(
    issues.find((issue) => issue.ruleId === 'robots_blocked')?.evidence
      ?.robotsTxt,
    page({
      robotsTxt: {
        url: 'https://example.com/robots.txt',
        allowed: false,
        matchedLine: 'Disallow: /blocked',
      },
    }).robotsTxt,
  )
})

test('auditCrawlPages flags canonical issues', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/missing-canonical',
      canonical: undefined,
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/relative-canonical',
      finalUrl: 'https://example.com/relative-canonical',
      canonical: 'https://example.com/relative-canonical',
      canonicalRaw: '/relative-canonical',
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/chain-a',
      finalUrl: 'https://example.com/chain-a',
      canonical: 'https://example.com/chain-b',
      canonicalRaw: 'https://example.com/chain-b',
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/chain-b',
      finalUrl: 'https://example.com/chain-b',
      canonical: 'https://example.com/final',
      canonicalRaw: 'https://example.com/final',
      internalInlinkCount: 1,
    }),
  ])

  assert.deepEqual(
    issues
      .filter((issue) => issue.category === 'canonical')
      .map((issue) => issue.ruleId),
    [
      'canonical_missing',
      'canonical_non_absolute',
      'canonical_chain',
      'canonical_mismatch',
      'canonical_mismatch',
    ],
  )
  assert.deepEqual(
    issues.find((issue) => issue.ruleId === 'canonical_chain')?.evidence?.chain,
    [
      'https://example.com/chain-a',
      'https://example.com/chain-b',
      'https://example.com/final',
    ],
  )
})

test('auditCrawlPages flags content issues', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/thin',
      wordCount: 80,
      textRatio: 0.03,
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/duplicate-a',
      mainContentHash: 'same-main-content',
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/duplicate-b',
      mainContentHash: 'same-main-content',
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/query-gap',
      title: 'Salary guide',
      metaDescription:
        'A practical guide with useful compensation context for readers.',
      h1: 'Salary guide',
      contentSample: 'This guide explains typical pay and career factors.',
      topQuery: {
        query: 'plumber salary london',
        clicks: 1,
        impressions: 100,
        ctr: 0.01,
        position: 12,
      },
      internalInlinkCount: 1,
    }),
  ])

  assert.deepEqual(
    issues
      .filter((issue) => issue.category === 'content')
      .map((issue) => issue.ruleId),
    [
      'thin_content',
      'low_text_ratio',
      'duplicate_content',
      'duplicate_content',
      'query_coverage_missing',
    ],
  )
  assert.deepEqual(
    issues.find((issue) => issue.ruleId === 'query_coverage_missing')?.evidence
      ?.missingTerms,
    ['plumber', 'london'],
  )
})

test('auditCrawlPages flags metadata length and duplicate issues', () => {
  const duplicateTitle = 'Evergreen Product Guide for Search Teams'
  const duplicateDescription =
    'A clear product guide for search teams that explains the exact page value and why someone should read it today.'
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/short',
      title: 'Short',
      metaDescription: 'Too short.',
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/long',
      title:
        'This is a very long page title that keeps going until it will almost certainly truncate in search results',
      metaDescription:
        'This description is intentionally long so the crawler can flag it as too long for a search snippet because it keeps adding details, caveats, context, and filler beyond the useful limit.',
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/duplicate-a',
      title: duplicateTitle,
      metaDescription: duplicateDescription,
      internalInlinkCount: 1,
    }),
    page({
      url: 'https://example.com/duplicate-b',
      title: duplicateTitle.toLowerCase(),
      metaDescription: duplicateDescription.replace(/\s+/g, '  '),
      internalInlinkCount: 1,
    }),
  ])
  const metadataIssues = issues.filter((issue) => issue.category === 'metadata')

  assert.deepEqual(
    metadataIssues.map((issue) => issue.ruleId),
    [
      'title_too_short',
      'meta_description_too_short',
      'title_too_wide',
      'meta_description_too_long',
      'title_duplicate',
      'meta_description_duplicate',
      'title_duplicate',
      'meta_description_duplicate',
    ],
  )
  assert.equal(
    metadataIssues.find((issue) => issue.ruleId === 'title_duplicate')?.evidence
      ?.duplicateCount,
    2,
  )
  assert.deepEqual(
    metadataIssues.find(
      (issue) => issue.ruleId === 'meta_description_duplicate',
    )?.evidence?.sampleUrls,
    ['https://example.com/duplicate-a', 'https://example.com/duplicate-b'],
  )
})

test('auditCrawlPages flags social, schema, and GEO gaps', () => {
  const issues = auditCrawlPages([
    page({
      internalInlinkCount: 1,
      schemaTypes: [],
      invalidJsonLdCount: 1,
      invalidJsonLdSamples: [
        {
          snippet: '{"@context":"https://schema.org"',
          error: 'Unexpected end',
        },
      ],
      openGraphTitle: undefined,
      openGraphDescription: undefined,
      openGraphImage: undefined,
      twitterCard: undefined,
      geo: {
        semanticHtml: false,
        structuredData: false,
        hasAuthor: false,
        hasDate: false,
        questionHeadings: 0,
        structuredBlocks: 0,
        answerable: false,
      },
    }),
  ])

  assert.deepEqual(
    issues.map((issue) => issue.ruleId),
    [
      'structured_data_missing',
      'jsonld_invalid',
      'og_title_missing',
      'og_description_missing',
      'og_image_missing',
      'twitter_card_missing',
      'geo_no_structured_data',
      'geo_not_answerable',
      'geo_no_author',
      'geo_no_date',
      'geo_no_semantic_html',
    ],
  )
  assert.deepEqual(
    issues.find((issue) => issue.ruleId === 'jsonld_invalid')?.evidence
      ?.invalidJsonLdSamples,
    [{ snippet: '{"@context":"https://schema.org"', error: 'Unexpected end' }],
  )
})

test('auditCrawlPages flags thin GEO pages and missing llms.txt once', () => {
  const issues = auditCrawlPages(
    [
      page({
        url: 'https://example.com/',
        wordCount: 180,
        geo: {
          semanticHtml: true,
          structuredData: true,
          hasAuthor: true,
          hasDate: true,
          questionHeadings: 1,
          structuredBlocks: 1,
          answerable: true,
          hasLlmsTxt: false,
          llmsTxtUrl: 'https://example.com/llms.txt',
          llmsTxtStatus: 404,
        },
      }),
      page({
        url: 'https://example.com/child',
        wordCount: 180,
        geo: {
          semanticHtml: true,
          structuredData: true,
          hasAuthor: true,
          hasDate: true,
          questionHeadings: 1,
          structuredBlocks: 1,
          answerable: true,
          hasLlmsTxt: false,
          llmsTxtUrl: 'https://example.com/llms.txt',
          llmsTxtStatus: 404,
        },
      }),
    ],
    { startUrl: 'https://example.com/' },
  )
  const geoIssues = issues.filter((issue) => issue.category === 'geo')

  assert.deepEqual(
    geoIssues.map((issue) => issue.ruleId),
    ['geo_thin_to_cite', 'geo_no_llms_txt', 'geo_thin_to_cite'],
  )
  assert.equal(
    geoIssues.find((issue) => issue.ruleId === 'geo_no_llms_txt')?.url,
    'https://example.com/',
  )
  assert.equal(
    geoIssues.find((issue) => issue.ruleId === 'geo_thin_to_cite')?.evidence
      ?.threshold,
    300,
  )
})

test('auditCrawlPages copies search metrics onto issues', () => {
  const issues = auditCrawlPages([
    page({
      metaDescription: undefined,
      searchMetrics: {
        clicks: 12,
        impressions: 400,
        ctr: 0.03,
        position: 8.5,
      },
    }),
  ])

  assert.deepEqual(issues[0]?.searchMetrics, {
    clicks: 12,
    impressions: 400,
    ctr: 0.03,
    position: 8.5,
  })
})
