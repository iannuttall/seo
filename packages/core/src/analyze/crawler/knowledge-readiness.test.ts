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
})
