import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateLlmsTxtV2 } from './agent-discovery.js'
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
        structuredDataFormats: ['json-ld'],
        schemaSameAs: ['https://www.linkedin.com/company/example'],
        schemaSameAsEvidence: [
          {
            url: 'https://www.linkedin.com/company/example',
            block: 0,
            path: '$.sameAs',
            subjectId: 'https://example.com/#organization',
            subjectTypes: ['Organization'],
          },
        ],
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
        structuredDataFormats: ['json-ld'],
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

test('llms audit and generator use crawl inventory', () => {
  const report = fixtureReport()
  const audit = auditLlmsTxt(report)
  const generated = generateLlmsTxt(report, { tokenBudget: 2_000 })

  assert.equal(audit.exists, false)
  assert.equal(audit.optional, true)
  assert.equal(audit.googleSearchImpact, 'none')
  assert.equal(
    audit.issues.some((issue) => issue.id === 'missing-llms-txt'),
    false,
  )
  assert.match(audit.headline, /not an SEO issue/i)
  assert.match(generated.content, /^# example\.com/m)
  assert.match(generated.content, /https:\/\/example.com\/docs/)
  assert.deepEqual(validateLlmsTxtV2(generated.content), [])
  assert.doesNotMatch(generated.content, /^## Notes$/mu)
  assert.equal(generated.includedUrls, 2)
})

test('entityReadiness scopes partial crawls and unclassified social links', () => {
  const crawl = fixtureReport()
  crawl.status = 'partial'
  const firstPage = crawl.pages[0]
  assert.ok(firstPage)
  crawl.pages = [
    {
      ...firstPage,
      schemaSameAs: [],
      schemaSameAsEvidence: [],
      socialProfileLinks: ['https://youtube.com/watch?v=not-a-profile'],
    },
  ]

  const report = entityReadiness(crawl)
  const sameAs = report.checks.find((check) => check.id === 'same-as')

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.evaluatedPages, 1)
  assert.match(report.headline, /not the whole site/i)
  assert.equal(report.entities.sameAs.length, 0)
  assert.equal(sameAs?.status, 'info')
  assert.equal(sameAs?.evidence?.observedCoveragePercent, 0)
  assert.match(sameAs?.plainEnglish ?? '', /not enough to prove/i)
  assert.match(report.caveats.join(' '), /not proof/i)
})

test('OKF bundle builds concept files and validates frontmatter', () => {
  const bundle = buildOkfBundle(fixtureReport())
  const validation = validateOkfFiles(bundle.files, {
    profile: 'seo-export',
    now: bundle.generatedAt,
  })
  const explanation = explainOkfValidation(validation)
  const root = bundle.files.find((file) => file.path === 'index.md')
  const log = bundle.files.find((file) => file.path === 'log.md')
  const concept = bundle.files.find(
    (file) =>
      file.path.startsWith('concepts/') && file.path !== 'concepts/index.md',
  )

  assert.equal(bundle.schemaVersion, 2)
  assert.equal(bundle.okfVersion, '0.2')
  assert.equal(bundle.pageConceptCount, 2)
  assert.equal(bundle.conceptCount, 5)
  assert.equal(validation.valid, true)
  assert.equal(validation.formatVersion, '0.2')
  assert.equal(validation.compatibility, 'v0.2')
  assert.equal(validation.profile, 'seo-export')
  assert.equal(validation.concepts, 5)
  assert.equal(validation.provenance.sources, 5)
  assert.equal(validation.generation.generated, 5)
  assert.equal(validation.trust.unverified, 5)
  assert.equal(validation.lifecycle.stable, 5)
  assert.equal(validation.freshness.unspecified, 5)
  assert.equal(validation.attestation.concepts, 0)
  assert.equal(explanation.valid, true)
  assert.equal(explanation.compatibility, 'v0.2')
  assert.equal(explanation.provenance.sources, 5)
  assert.equal(explanation.generation.generated, 5)
  assert.equal(explanation.trust.unverified, 5)
  assert.equal(explanation.lifecycle.stable, 5)
  assert.equal(explanation.freshness.unspecified, 5)
  assert.equal(explanation.attestation.concepts, 0)
  assert.match(explanation.summary, /OKF v0\.2 validation passed/)
  assert.equal(bundle.generatedAt, '2026-06-20T00:00:00.000Z')
  assert.equal(bundle.selection.eligiblePages, 2)
  assert.match(root?.content ?? '', /okf_version: "0\.2"/)
  assert.doesNotMatch(root?.content ?? '', /^type:/m)
  assert.match(log?.content ?? '', /^## 2026-06-20$/m)
  assert.match(concept?.content ?? '', /^resource: "https:/m)
  assert.match(concept?.content ?? '', /^http_status: 200$/m)
  assert.match(concept?.content ?? '', /^generated:/m)
  assert.match(concept?.content ?? '', /^sources:/m)
  assert.doesNotMatch(concept?.content ?? '', /^status: 200$/m)
  assert.doesNotMatch(concept?.content ?? '', /^# Citations$/m)
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
