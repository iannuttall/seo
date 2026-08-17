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

function fixturePage(report: ReturnType<typeof fixtureReport>, index: number) {
  const page = report.pages[index]
  assert.ok(page)
  return page
}

test('aiReadiness returns evidence without an aggregate verdict', () => {
  const report = aiReadiness(fixtureReport())

  assert.equal(report.url, 'https://example.com/')
  assert.equal(report.botAccess.length, 2)
  assert.equal(report.assessment, 'evidence-only')
  assert.equal('score' in report, false)
  assert.equal('grade' in report, false)
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

test('aiReadiness keeps missing top-level robots evidence inconclusive', () => {
  const missingAi = fixtureReport()
  delete missingAi.ai
  const missingRobots = fixtureReport()
  if (!missingRobots.ai) throw new Error('Expected AI fixture signals.')
  delete missingRobots.ai.robotsTxt

  for (const crawl of [missingAi, missingRobots]) {
    const report = aiReadiness(crawl)
    const access = report.checks.find((check) => check.id === 'robots-ai-bots')
    const sitemap = report.checks.find((check) => check.id === 'robots-sitemap')

    assert.equal(report.dataStatus, 'partial')
    assert.equal(access?.status, 'unknown')
    assert.equal(access?.evaluated, false)
    assert.doesNotMatch(access?.title ?? '', /can fetch/i)
    assert.equal(sitemap?.status, 'unknown')
    assert.equal(sitemap?.evaluated, false)
    assert.match(sitemap?.plainEnglish ?? '', /could not be checked/i)
    assert.doesNotMatch(sitemap?.plainEnglish ?? '', /does not declare/i)
    assert.match(report.headline, /evidence is incomplete/i)
  }
})

test('aiReadiness keeps missing per-bot policy evidence inconclusive', () => {
  const crawl = fixtureReport()
  if (!crawl.ai?.robotsTxt) throw new Error('Expected robots.txt fixture data.')
  crawl.ai.robotsTxt.botAccess = []

  const report = aiReadiness(crawl)
  const access = report.checks.find((check) => check.id === 'robots-ai-bots')
  const sitemap = report.checks.find((check) => check.id === 'robots-sitemap')

  assert.equal(report.dataStatus, 'partial')
  assert.equal(access?.status, 'unknown')
  assert.equal(access?.evaluated, false)
  assert.match(access?.plainEnglish ?? '', /does not include per-bot/i)
  assert.equal(sitemap?.status, 'info')
  assert.equal(sitemap?.evaluated, true)
  assert.match(sitemap?.plainEnglish ?? '', /declares at least one sitemap/i)
  assert.ok(
    report.caveats.some((caveat) =>
      /without per-bot policy evidence/i.test(caveat),
    ),
  )
})

test('aiReadiness scopes robots findings to start-URL policy evidence', () => {
  const report = aiReadiness(fixtureReport())
  const access = report.checks.find((check) => check.id === 'robots-ai-bots')

  assert.match(
    access?.title ?? '',
    /robots\.txt blocks selected crawler tokens/i,
  )
  assert.match(access?.plainEnglish ?? '', /at the start URL/i)
  assert.doesNotMatch(access?.title ?? '', /can fetch the site/i)
  assert.deepEqual(access?.evidence?.scope, 'start-url-robots-policy')
  assert.deepEqual(access?.evidence?.startUrl, 'https://example.com/')
  assert.ok(
    report.caveats.some((caveat) =>
      /do not verify actual crawler requests or site-wide access/i.test(caveat),
    ),
  )
})

test('aiReadiness is deterministic for a saved crawl report', () => {
  const report = fixtureReport()

  assert.deepEqual(aiReadiness(report), aiReadiness(report))
  assert.equal(aiReadiness(report).generatedAt, report.generatedAt)
})

test('aiReadiness preserves page-level snippet control evidence', () => {
  const crawl = fixtureReport()
  fixturePage(crawl, 0).metaRobots = 'nosnippet'
  fixturePage(crawl, 1).xRobotsTag = 'googlebot: max-snippet:40'

  const report = aiReadiness(crawl)
  const check = report.checks.find((item) => item.id === 'snippet-controls')

  assert.equal(check?.status, 'info')
  assert.deepEqual(check?.urls, [
    'https://example.com/',
    'https://example.com/docs',
  ])
  assert.deepEqual(check?.evidence, {
    evaluatedPages: 2,
    blockedPages: 1,
    limitedPages: 1,
    restrictions: [
      {
        url: 'https://example.com/',
        control: {
          status: 'blocked',
          reason: 'nosnippet',
          maxCharacters: 0,
          evidence: [
            {
              source: 'meta-robots',
              directive: 'nosnippet',
              raw: 'nosnippet',
            },
          ],
        },
      },
      {
        url: 'https://example.com/docs',
        control: {
          status: 'limited',
          reason: 'max-snippet-limit',
          maxCharacters: 40,
          evidence: [
            {
              source: 'x-robots-tag',
              directive: 'max-snippet',
              raw: 'max-snippet:40',
              value: 40,
            },
          ],
        },
      },
    ],
  })
  assert.equal(
    report.topActions.some((item) => item.id === 'snippet-controls'),
    false,
  )
})

test('aiReadiness does not score absent JSON-LD as valid or invalid', () => {
  const crawl = fixtureReport()
  for (const page of crawl.pages) {
    page.schemaTypes = []
    page.structuredDataFormats = []
    page.invalidJsonLdCount = 0
    if (page.geo) page.geo.structuredData = false
  }

  const report = aiReadiness(crawl)
  const check = report.checks.find((item) => item.id === 'valid-json-ld')

  assert.equal(check?.evaluated, false)
  assert.equal(check?.status, 'unknown')
  assert.match(check?.plainEnglish ?? '', /cannot make a syntax claim/i)
  assert.equal(
    report.checks.some((item) => item.id === 'structured-data-coverage'),
    false,
  )
})

test('aiReadiness keeps indexable-page coverage unknown without eligible pages', () => {
  const crawl = fixtureReport()
  for (const page of crawl.pages) page.indexable = false

  const report = aiReadiness(crawl)
  const coverageChecks = [
    'answerable-content',
    'semantic-html',
    'titles-headings-meta',
    'language',
    'entity-schema',
    'snippet-controls',
  ]

  for (const id of coverageChecks) {
    const check = report.checks.find((item) => item.id === id)
    assert.equal(check?.evaluated, false, id)
    assert.equal(check?.status, 'unknown', id)
    assert.match(check?.plainEnglish ?? '', /not evaluated/i, id)
    assert.doesNotMatch(check?.plainEnglish ?? '', /0% of indexable/i, id)
  }

  const indexability = report.checks.find(
    (item) => item.id === 'status-indexability',
  )
  assert.equal(indexability?.evaluated, true)
  assert.match(indexability?.plainEnglish ?? '', /^0% of crawled pages/)
})

test('aiReadiness does not infer a page-cap stop from an exact page count', () => {
  const crawl = fixtureReport()
  crawl.config.maxPages = crawl.pages.length

  const report = aiReadiness(crawl)
  const depth = report.checks.find((item) => item.id === 'crawl-depth')

  assert.equal(crawl.summary.pageLimitReached, false)
  assert.equal(depth?.status, 'pass')
  assert.match(depth?.title ?? '', /without hitting the page cap/i)
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

test('llms generator preserves partial source coverage and readable truncation', () => {
  const report = fixtureReport()
  report.status = 'partial'
  report.summary.discoveredUrls = 164
  report.summary.crawledUrls = 10
  report.warnings = ['Sitemap inventory is incomplete.']
  const first = report.pages[0]
  assert.ok(first)
  first.metaDescription =
    'A long description about TypeScript reports and reliable crawl evidence that should stop on a complete word instead of producing an unfinished fragment for users.'
  const second = report.pages[1]
  assert.ok(second)
  second.metaDescription = 'x'.repeat(200)

  const generated = generateLlmsTxt(report, { tokenBudget: 2_000 })

  assert.equal(generated.source.status, 'partial')
  assert.equal(generated.source.crawledUrls, 10)
  assert.equal(generated.source.discoveredUrls, 164)
  assert.deepEqual(generated.source.warnings, [
    'Sitemap inventory is incomplete.',
  ])
  assert.doesNotMatch(generated.content, /Crawl coverage:/)
  assert.doesNotMatch(generated.content, /Source warning:/)
  assert.doesNotMatch(generated.content, /unfinished frag\b/)
  assert.doesNotMatch(generated.content, /x{20}/)
  assert.match(
    generated.content,
    /\[Docs\]\(https:\/\/example\.com\/docs\): \.\.\./,
  )
})

test('llms v2 validation rejects non-link section entries', () => {
  assert.deepEqual(
    validateLlmsTxtV2(`# Example\n\n## Notes\n\n- Generated today.\n`),
    [
      'Section "Notes" contains a line that is not a Markdown link entry: - Generated today.',
      'Section "Notes" has no Markdown links.',
    ],
  )
})

test('llms v2 validation allows more than 12 file sections', () => {
  const content = [
    '# Example',
    '',
    ...Array.from({ length: 13 }, (_, index) =>
      [
        `## Section ${index}`,
        '',
        `- [Page ${index}](https://example.com/page-${index}.md)`,
        '',
      ].join('\n'),
    ),
  ].join('\n')

  assert.deepEqual(validateLlmsTxtV2(content), [])
})

test('llms generator allows more than 100 links', () => {
  const report = fixtureReport()
  const source = report.pages[0]
  assert.ok(source)
  report.pages = Array.from({ length: 150 }, (_, index) => ({
    ...source,
    url: `https://example.com/docs/page-${index}`,
    finalUrl: `https://example.com/docs/page-${index}`,
    title: `Guide ${index}`,
    contentHash: `hash-${index}`,
  }))
  report.summary.crawledUrls = report.pages.length
  report.summary.discoveredUrls = report.pages.length

  const generated = generateLlmsTxt(report, {
    maxUrls: 250,
    tokenBudget: 100_000,
  })

  assert.equal(generated.includedUrls, 150)
  assert.equal(generated.limits.maxUrls, 250)
  assert.equal(generated.limits.truncated, false)
  assert.deepEqual(validateLlmsTxtV2(generated.content), [])
})

test('llms generator uses an explicit output budget above 100,000 bytes', () => {
  const report = fixtureReport()
  const source = report.pages[0]
  assert.ok(source)
  report.pages = Array.from({ length: 400 }, (_, index) => ({
    ...source,
    url: `https://example.com/docs/page-${index}`,
    finalUrl: `https://example.com/docs/page-${index}`,
    title: `Guide ${index} ${'title '.repeat(20)}`,
    metaDescription: `Description ${index} ${'detail '.repeat(30)}`,
    contentHash: `hash-${index}`,
  }))
  report.summary.crawledUrls = report.pages.length
  report.summary.discoveredUrls = report.pages.length

  const complete = generateLlmsTxt(report, {
    maxUrls: 400,
    tokenBudget: 500_000,
  })
  assert.ok(Buffer.byteLength(complete.content) > 100_000)
  assert.equal(complete.includedUrls, 400)
  assert.equal(complete.limits.truncated, false)
  assert.deepEqual(validateLlmsTxtV2(complete.content), [])

  const bounded = generateLlmsTxt(report, {
    maxUrls: 400,
    tokenBudget: 500_000,
    maxBytes: 4_096,
  })
  assert.ok(Buffer.byteLength(bounded.content) <= 4_096)
  assert.equal(bounded.limits.truncated, true)
  assert.deepEqual(bounded.limits.reasons, ['maxBytes'])
  assert.deepEqual(validateLlmsTxtV2(bounded.content), [])
})

test('llms.txt remains an informational AI-search observation', () => {
  const missing = fixtureReport()
  const present = fixtureReport()
  if (!present.ai?.llmsTxt) throw new Error('Expected llms.txt fixture data.')
  present.ai.llmsTxt.exists = true
  present.ai.llmsTxt.status = 200

  const missingReadiness = aiReadiness(missing)
  const presentReadiness = aiReadiness(present)
  const check = missingReadiness.checks.find((item) => item.id === 'llms-txt')

  assert.equal('score' in missingReadiness, false)
  assert.equal('score' in presentReadiness, false)
  assert.equal(check?.status, 'info')
  assert.equal(check && 'score' in check, false)
  assert.equal(check && 'maxScore' in check, false)
  assert.equal(
    missingReadiness.topActions.some((item) => item.id === 'llms-txt'),
    false,
  )
})

test('paragraph shape remains an informational AI-search observation', () => {
  const observed = fixtureReport()
  const absent = fixtureReport()
  for (const page of absent.pages) {
    if (page.geo) page.geo.answerable = false
  }

  const observedReadiness = aiReadiness(observed)
  const absentReadiness = aiReadiness(absent)
  const check = absentReadiness.checks.find(
    (item) => item.id === 'answerable-content',
  )

  assert.equal('score' in observedReadiness, false)
  assert.equal('score' in absentReadiness, false)
  assert.equal(check?.status, 'info')
  assert.equal(check && 'score' in check, false)
  assert.equal(check && 'maxScore' in check, false)
  assert.match(check?.plainEnglish ?? '', /does not establish/i)
  assert.equal(
    absentReadiness.topActions.some((item) => item.id === 'answerable-content'),
    false,
  )
})

test('entityReadiness summarizes schema and official profile signals', () => {
  const report = entityReadiness(fixtureReport())

  assert.equal(report.entities.schemaTypes.Organization, 1)
  assert.deepEqual(report.entities.sameAs, [
    'https://www.linkedin.com/company/example',
  ])
  assert.equal(report.assessment, 'evidence-only')
  assert.equal('score' in report, false)
  assert.equal(report.dataStatus, 'complete')
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

test('entityReadiness does not use an author profile as site identity', () => {
  const crawl = fixtureReport()
  const page = crawl.pages[0]
  assert.ok(page)
  page.schemaSameAs = ['https://example.net/jane']
  page.schemaSameAsEvidence = [
    {
      url: 'https://example.net/jane',
      block: 0,
      path: '$.author.sameAs',
      subjectId: 'https://example.com/#jane',
      subjectTypes: ['Person'],
    },
  ]

  const report = entityReadiness(crawl)
  const check = report.checks.find((item) => item.id === 'same-as')

  assert.deepEqual(report.entities.sameAsByType, {
    Person: ['https://example.net/jane'],
  })
  assert.equal(check?.status, 'info')
  assert.equal(check?.evidence?.observedCoveragePercent, 0)
  assert.match(check?.plainEnglish ?? '', /Person sameAs links/)
})

test('entityReadiness counts SoftwareApplication without conflating identity signals', () => {
  const crawl = fixtureReport()
  const page = crawl.pages[0]
  assert.ok(page)
  const geo = page.geo
  assert.ok(geo)
  crawl.pages = [
    {
      ...page,
      schemaTypes: ['SoftwareApplication', 'WebPage'],
      schemaSameAs: [],
      schemaSameAsEvidence: [],
      socialProfileLinks: [],
      author: undefined,
      hasDate: false,
      geo: {
        ...geo,
        hasAuthor: false,
        hasDate: false,
      },
    },
  ]

  const report = entityReadiness(crawl)
  const entitySchema = report.checks.find((item) => item.id === 'entity-schema')
  const officialProfiles = report.checks.find((item) => item.id === 'same-as')
  const authorship = report.checks.find(
    (item) => item.id === 'authority-freshness',
  )

  assert.equal(report.entities.schemaTypes.SoftwareApplication, 1)
  assert.equal(report.entities.schemaTypes.WebPage, 1)
  assert.equal(entitySchema?.evidence?.observedCoveragePercent, 100)
  assert.equal(officialProfiles?.evidence?.observedCoveragePercent, 0)
  assert.equal(authorship?.evidence?.observedCoveragePercent, 0)
  assert.deepEqual(report.entities.sameAs, [])
  assert.deepEqual(report.entities.sameAsByType, {})
  assert.deepEqual(report.entities.authors, [])
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

test('OKF validation summaries inflect one concept', () => {
  const validation = validateOkfFiles(
    [
      {
        path: 'metric.md',
        content: '---\ntype: Metric\n---\n\n# Metric\n',
      },
    ],
    { now: '2026-06-20T00:00:00.000Z' },
  )

  const explanation = explainOkfValidation(validation)
  assert.match(explanation.summary, /1 concept\./)
  assert.doesNotMatch(explanation.summary, /1 concepts/)
  assert.match(explanation.nextActions.join(' '), /against its sources/)
})

test('OKF validation summaries use plural source wording', () => {
  const validation = validateOkfFiles(
    [
      {
        path: 'first.md',
        content: '---\ntype: Metric\n---\n\n# First\n',
      },
      {
        path: 'second.md',
        content: '---\ntype: Metric\n---\n\n# Second\n',
      },
    ],
    { now: '2026-06-20T00:00:00.000Z' },
  )

  assert.match(
    explainOkfValidation(validation).nextActions.join(' '),
    /2 unverified concepts against their sources/,
  )
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

  assert.equal(bundle.pageConceptCount, 1)
  assert.equal(bundle.conceptCount, 4)
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
