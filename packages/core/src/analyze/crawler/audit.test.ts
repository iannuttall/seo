import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listRules } from '../../rules.js'
import { auditCrawlPages, auditCrawlRequests } from './audit.js'
import { crawlPage as page } from './audit.test-fixtures.js'

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

test('none creates noindex and nofollow findings while other-bot headers do not', () => {
  const metaIssues = auditCrawlPages([
    page({ metaRobots: 'index, NONE', indexable: false }),
  ])
  assert.deepEqual(
    metaIssues
      .filter((issue) => ['noindex', 'nofollow'].includes(issue.ruleId))
      .map((issue) => issue.ruleId),
    ['noindex', 'nofollow'],
  )

  const unrelatedHeaderIssues = auditCrawlPages([
    page({ xRobotsTag: 'otherbot: none' }),
  ])
  assert.equal(
    unrelatedHeaderIssues.some((issue) =>
      ['x_robots_noindex', 'nofollow'].includes(issue.ruleId),
    ),
    false,
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
        mainContentHash: 'duplicate-template',
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
      page({
        url: 'http://example.com/duplicate-template',
        finalUrl: 'http://example.com/duplicate-template',
        canonical: 'http://example.com/duplicate-template',
        mainContentHash: 'duplicate-template',
      }),
    ],
    { startUrl: 'http://example.com/bad-template' },
  )
  const coveredFamilies = [
    ...new Set(issues.map((issue) => issue.category)),
  ].sort()

  assert.deepEqual(coveredFamilies, registryFamilies)
})

test('auditCrawlPages does not turn uncertain external checks into issues', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/source',
      externalLinkChecks: [
        {
          url: 'https://external.example/transient',
          status: 200,
          state: 'transient',
          attempts: [
            { method: 'HEAD', status: 404 },
            { method: 'GET', status: 200 },
          ],
        },
        {
          url: 'https://external.example/blocked',
          status: 403,
          state: 'provider-blocked',
          attempts: [{ method: 'HEAD', status: 403 }],
        },
        {
          url: 'https://external.example/legacy',
          status: 404,
        },
      ],
    }),
  ])

  assert.equal(
    issues.some((issue) => issue.ruleId === 'broken_external_link'),
    false,
  )
})

test('hreflang requires a self target rather than a language label or x-default', () => {
  const missingSelfReference = auditCrawlPages([
    page({
      url: 'https://example.com/gb',
      finalUrl: 'https://example.com/gb',
      lang: 'en-gb',
      hreflang: [
        { hreflang: 'en-gb', href: 'https://example.com/en' },
        { hreflang: 'x-default', href: 'https://example.com/' },
      ],
    }),
  ])
  const selfReference = auditCrawlPages([
    page({
      url: 'https://example.com/gb',
      finalUrl: 'https://example.com/gb',
      lang: 'en-gb',
      hreflang: [
        { hreflang: 'en-gb', href: 'https://example.com/gb' },
        { hreflang: 'x-default', href: 'https://example.com/' },
      ],
    }),
  ])

  assert.equal(
    missingSelfReference.some(
      (issue) => issue.ruleId === 'hreflang_incomplete',
    ),
    true,
  )
  assert.equal(
    selfReference.some((issue) => issue.ruleId === 'hreflang_incomplete'),
    false,
  )
})

test('auditCrawlPages keeps ambiguous canonical evidence explicit', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/conflict',
      finalUrl: 'https://example.com/conflict',
      canonical: undefined,
      canonicalRaw: 'https://example.com/html',
      canonicalStatus: 'conflicting',
      canonicalCandidates: [
        {
          source: 'html-head',
          raw: 'https://example.com/html',
          resolved: 'https://example.com/html',
        },
        {
          source: 'http-header',
          raw: 'https://example.com/header',
          resolved: 'https://example.com/header',
        },
      ],
    }),
    page({
      url: 'https://example.com/body',
      finalUrl: 'https://example.com/body',
      canonical: undefined,
      canonicalRaw: 'https://example.com/preferred',
      canonicalStatus: 'outside-head-only',
      canonicalCandidates: [
        {
          source: 'html-body',
          raw: 'https://example.com/preferred',
          ignoredReason: 'outside-head',
        },
      ],
    }),
    page({
      url: 'https://example.com/duplicate',
      finalUrl: 'https://example.com/duplicate',
      canonical: 'https://example.com/duplicate',
      canonicalRaw: 'https://example.com/duplicate',
      canonicalStatus: 'duplicate',
      canonicalCandidates: [
        {
          source: 'html-head',
          raw: 'https://example.com/duplicate',
          resolved: 'https://example.com/duplicate',
        },
        {
          source: 'http-header',
          raw: 'https://example.com/duplicate',
          resolved: 'https://example.com/duplicate',
        },
      ],
    }),
  ])

  assert.deepEqual(
    issues
      .filter((issue) => issue.category === 'canonical')
      .map((issue) => [issue.url, issue.ruleId]),
    [
      ['https://example.com/conflict', 'canonical_conflict'],
      ['https://example.com/body', 'canonical_outside_head'],
      ['https://example.com/duplicate', 'canonical_multiple'],
    ],
  )
})

test('auditCrawlPages does not turn word count or llms.txt into SEO issues', () => {
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

  assert.deepEqual(geoIssues, [])
})
