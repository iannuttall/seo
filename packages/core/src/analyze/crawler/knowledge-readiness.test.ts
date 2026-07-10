import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aiReadiness } from './ai-readiness.js'
import { entityReadiness } from './entity-readiness.js'
import { auditLlmsTxt, generateLlmsTxt } from './llms.js'
import {
  buildOkfBundle,
  explainOkfValidation,
  validateOkfFiles,
} from './okf.js'
import { createCrawlReport } from './report.js'

function fixtureReport() {
  return createCrawlReport({
    config: { url: 'https://example.com' },
    generatedAt: '2026-06-20T00:00:00.000Z',
    ai: {
      llmsTxt: {
        url: 'https://example.com/llms.txt',
        exists: false,
        status: 404,
      },
      robotsTxt: {
        url: 'https://example.com/robots.txt',
        exists: true,
        availability: 'available',
        status: 200,
        sitemapUrls: ['https://example.com/sitemap.xml'],
        botAccess: [
          {
            userAgent: 'GPTBot',
            allowed: true,
            declared: true,
            coveredByWildcard: false,
          },
          {
            userAgent: 'ClaudeBot',
            allowed: false,
            declared: true,
            coveredByWildcard: false,
          },
        ],
      },
      agentResources: [
        {
          url: 'https://example.com/openapi.json',
          exists: true,
          status: 200,
          contentType: 'application/json',
          validJson: true,
        },
      ],
    },
    pages: [
      {
        url: 'https://example.com/',
        finalUrl: 'https://example.com/',
        status: 200,
        title: 'Example',
        metaDescription: 'Example product home.',
        h1: 'Example',
        h1Count: 1,
        indexable: true,
        wordCount: 500,
        contentHash: 'a',
        contentSample: 'Example helps teams understand technical SEO.',
        textRatio: 0.2,
        lang: 'en',
        hasViewport: true,
        isHttps: true,
        outgoingInternalCount: 2,
        sampleInternalLinks: [
          'https://example.com/docs',
          'https://example.com/blog/answer',
        ],
        schemaTypes: ['Organization', 'WebSite'],
        schemaSameAs: ['https://www.linkedin.com/company/example'],
        socialProfileLinks: ['https://www.linkedin.com/company/example'],
        author: 'Example Team',
        hasDate: true,
        geo: {
          semanticHtml: true,
          structuredData: true,
          hasAuthor: true,
          hasDate: true,
          questionHeadings: 1,
          structuredBlocks: 2,
          answerable: true,
          hasLlmsTxt: false,
          llmsTxtUrl: 'https://example.com/llms.txt',
          llmsTxtStatus: 404,
        },
      },
      {
        url: 'https://example.com/docs',
        finalUrl: 'https://example.com/docs',
        status: 200,
        title: 'Docs',
        metaDescription: 'Read the docs.',
        h1: 'Docs',
        h1Count: 1,
        indexable: true,
        wordCount: 700,
        contentHash: 'b',
        contentSample: 'Documentation for agents and humans.',
        textRatio: 0.18,
        lang: 'en',
        hasViewport: true,
        isHttps: true,
        outgoingInternalCount: 1,
        sampleInternalLinks: ['https://example.com/'],
        schemaTypes: ['Article'],
        hasDate: true,
        geo: {
          semanticHtml: true,
          structuredData: true,
          hasAuthor: false,
          hasDate: true,
          questionHeadings: 2,
          structuredBlocks: 3,
          answerable: true,
          hasLlmsTxt: false,
        },
      },
    ],
  })
}

function fixturePage(report: ReturnType<typeof fixtureReport>, index: number) {
  const page = report.pages[index]
  assert.ok(page)
  return page
}

test('aiReadiness returns scored checks, bot access, and actions', () => {
  const report = aiReadiness(fixtureReport())

  assert.equal(report.url, 'https://example.com/')
  assert.equal(report.botAccess.length, 2)
  assert.ok(report.score > 0)
  assert.ok(report.topActions.some((action) => action.id === 'robots-ai-bots'))
  assert.ok(
    report.checks.some((check) => check.plainEnglish.includes('llms.txt')),
  )
})

test('aiReadiness treats unavailable robots evidence as unknown, not blocked', () => {
  const crawl = fixtureReport()
  if (!crawl.ai) throw new Error('Expected AI fixture signals.')
  crawl.ai.robotsTxt = {
    url: 'https://example.com/robots.txt',
    exists: false,
    availability: 'unreachable',
    status: 503,
    error: 'robots.txt returned HTTP 503.',
    sitemapUrls: [],
    botAccess: [
      {
        userAgent: 'Googlebot',
        allowed: null,
        declared: false,
        coveredByWildcard: false,
      },
    ],
  }

  const report = aiReadiness(crawl)
  const access = report.checks.find((check) => check.id === 'robots-ai-bots')
  const sitemap = report.checks.find((check) => check.id === 'robots-sitemap')

  assert.equal(report.dataStatus, 'partial')
  assert.equal(access?.status, 'unknown')
  assert.equal(access?.evaluated, false)
  assert.equal(sitemap?.status, 'unknown')
  assert.match(access?.plainEnglish ?? '', /cannot say whether/)
  assert.match(report.headline, /evidence is incomplete/i)
  assert.equal(report.botAccess[0]?.allowed, null)
})

test('aiReadiness is deterministic for a saved crawl report', () => {
  const report = fixtureReport()

  assert.deepEqual(aiReadiness(report), aiReadiness(report))
  assert.equal(aiReadiness(report).generatedAt, report.generatedAt)
})

test('llms audit and generator use crawl inventory', () => {
  const report = fixtureReport()
  const audit = auditLlmsTxt(report)
  const generated = generateLlmsTxt(report, { tokenBudget: 2_000 })

  assert.equal(audit.exists, false)
  assert.equal(audit.issues[0]?.id, 'missing-llms-txt')
  assert.match(generated.content, /^# example\.com/m)
  assert.match(generated.content, /https:\/\/example.com\/docs/)
  assert.equal(generated.includedUrls, 2)
})

test('entityReadiness summarizes schema and official profile signals', () => {
  const report = entityReadiness(fixtureReport())

  assert.equal(report.entities.schemaTypes.Organization, 1)
  assert.deepEqual(report.entities.sameAs, [
    'https://www.linkedin.com/company/example',
  ])
  assert.ok(report.score > 0)
})

test('OKF bundle builds concept files and validates frontmatter', () => {
  const bundle = buildOkfBundle(fixtureReport())
  const validation = validateOkfFiles(bundle.files)
  const explanation = explainOkfValidation(validation)

  assert.ok(bundle.files.some((file) => file.path === 'index.md'))
  assert.equal(bundle.conceptCount, 2)
  assert.equal(validation.valid, true)
  assert.equal(explanation.valid, true)
  assert.match(explanation.summary, /passes seo OKF checks/)
  assert.equal(bundle.generatedAt, '2026-06-20T00:00:00.000Z')
  assert.equal(bundle.selection.eligiblePages, 2)
})

test('OKF concept paths stay unique when readable URL prefixes collide', () => {
  const report = fixtureReport()
  const home = fixturePage(report, 0)
  const base = `https://example.com/${'same-prefix-'.repeat(10)}`
  report.pages = [
    { ...home, url: `${base}one`, finalUrl: `${base}one` },
    { ...home, url: `${base}two`, finalUrl: `${base}two` },
  ]

  const bundle = buildOkfBundle(report)
  const paths = bundle.files
    .filter((file) => file.path.startsWith('concepts/'))
    .filter((file) => file.path !== 'concepts/index.md')
    .map((file) => file.path)

  assert.equal(paths.length, 2)
  assert.equal(new Set(paths).size, 2)
  assert.equal(validateOkfFiles(bundle.files).valid, true)
})

test('OKF selection deduplicates final URLs and excludes non-2xx pages', () => {
  const report = fixtureReport()
  const home = fixturePage(report, 0)
  const docs = fixturePage(report, 1)
  report.pages = [
    home,
    {
      ...home,
      url: 'https://example.com/home-alias',
    },
    {
      ...docs,
      status: 301,
    },
  ]

  const bundle = buildOkfBundle(report)

  assert.equal(bundle.conceptCount, 1)
  assert.equal(bundle.selection.sourcePages, 3)
  assert.equal(bundle.selection.eligiblePages, 1)
  assert.equal(bundle.selection.duplicateFinalUrls, 1)
  assert.match(bundle.caveats.join(' '), /duplicate final URL/i)
})

test('OKF selection prioritizes observed search demand deterministically', () => {
  const report = fixtureReport()
  const home = fixturePage(report, 0)
  const docs = fixturePage(report, 1)
  report.pages = [
    {
      ...home,
      url: 'https://example.com/high-authority',
      finalUrl: 'https://example.com/high-authority',
      internalLinkAuthorityScore: 100,
    },
    {
      ...docs,
      url: 'https://example.com/search-demand',
      finalUrl: 'https://example.com/search-demand',
      internalLinkAuthorityScore: 0,
      searchMetrics: { clicks: 10, impressions: 100, ctr: 0.1, position: 4 },
    },
  ]

  const first = buildOkfBundle(report, { maxConcepts: 1 })
  const second = buildOkfBundle(report, { maxConcepts: 1 })
  const concept = first.files.find(
    (file) =>
      file.path.startsWith('concepts/') && file.path !== 'concepts/index.md',
  )

  assert.match(concept?.content ?? '', /https:\/\/example\.com\/search-demand/)
  assert.equal(first.selection.limitedPages, 1)
  assert.deepEqual(first, second)
})

test('OKF rejects unsafe concept limits', () => {
  const report = fixtureReport()

  for (const maxConcepts of [0, -1, 1.5, 5_001, Number.NaN]) {
    assert.throws(
      () => buildOkfBundle(report, { maxConcepts }),
      /whole number between 1 and 5000/,
    )
  }
  assert.throws(
    () => buildOkfBundle(report, { title: 'x'.repeat(201) }),
    /1 to 200 characters/,
  )
})

test('OKF validation rejects duplicate and unsafe paths', () => {
  const bundle = buildOkfBundle(fixtureReport())
  const concept = bundle.files.find(
    (file) =>
      file.path.startsWith('concepts/') && file.path !== 'concepts/index.md',
  )
  assert.ok(concept)

  const duplicate = validateOkfFiles([...bundle.files, concept])
  assert.equal(duplicate.valid, false)
  assert.match(
    duplicate.issues.map((issue) => issue.message).join(' '),
    /duplicated/,
  )

  const unsafe = validateOkfFiles([
    ...bundle.files,
    { path: '../outside.md', content: '# outside' },
  ])
  assert.equal(unsafe.valid, false)
  assert.match(
    unsafe.issues.map((issue) => issue.message).join(' '),
    /safe relative/,
  )
})
