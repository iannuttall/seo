import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CrawlPageSnapshot } from '../monitoring/types.js'
import {
  AI_SEARCH_SCORECARD_METHODOLOGY_ID,
  AI_SEARCH_SCORECARD_METHODOLOGY_VERSION,
  aiSearchScorecard,
  SCORECARD_CHECK_WEIGHTS,
  SCORECARD_STATUS_CREDIT,
  type ScorecardStatus,
} from './ai-search-scorecard.js'
import type { CrawlAiSignals } from './report.js'
import { createCrawlReport } from './report.js'

function cleanPage(url: string, overrides: Partial<CrawlPageSnapshot> = {}) {
  return {
    url,
    finalUrl: url,
    status: 200,
    contentType: 'text/html',
    title: 'Title',
    metaDescription: 'Meta.',
    h1: 'Heading',
    h1Count: 1,
    indexable: true,
    wordCount: 500,
    contentHash: url,
    lang: 'en',
    hasViewport: true,
    isHttps: true,
    outgoingInternalCount: 1,
    structuredDataFormats: ['json-ld'] as Array<'json-ld'>,
    schemaTypes: ['Organization', 'WebSite'],
    geo: {
      semanticHtml: true,
      structuredData: true,
      hasAuthor: true,
      hasDate: true,
      questionHeadings: 1,
      structuredBlocks: 2,
      answerable: true,
    },
    ...overrides,
  } satisfies CrawlPageSnapshot
}

const cleanAiSignals: CrawlAiSignals = {
  llmsTxt: {
    url: 'https://example.com/llms.txt',
    exists: true,
    status: 200,
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
        allowed: true,
        declared: true,
        coveredByWildcard: false,
      },
    ],
  },
  agentResources: [],
}

function cleanReport(
  overrides: Partial<Parameters<typeof createCrawlReport>[0]> = {},
) {
  return createCrawlReport({
    id: 'crawl_fixture',
    config: { url: 'https://example.com' },
    generatedAt: '2026-06-20T00:00:00.000Z',
    requestEvidenceStatus: 'available',
    ai: cleanAiSignals,
    pages: [
      cleanPage('https://example.com/', {
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
      }),
      cleanPage('https://example.com/docs'),
    ],
    ...overrides,
  })
}

function expectedScore(
  checks: Array<{ status: ScorecardStatus; weight: number }>,
  partial: boolean,
): number | null {
  const scored = checks.filter((check) => check.status !== 'unknown')
  const weight = scored.reduce((total, check) => total + check.weight, 0)
  if (weight === 0) return null
  const earned = scored.reduce(
    (total, check) =>
      total +
      check.weight *
        SCORECARD_STATUS_CREDIT[
          check.status as Exclude<ScorecardStatus, 'unknown'>
        ],
    0,
  )
  const raw = Math.round((earned / weight) * 100)
  return raw === 100 && partial ? 99 : raw
}

test('aiSearchScorecard scores a clean complete crawl at 100 with no unknowns', () => {
  const card = aiSearchScorecard(cleanReport())

  assert.equal(card.methodology.id, AI_SEARCH_SCORECARD_METHODOLOGY_ID)
  assert.equal(
    card.methodology.version,
    AI_SEARCH_SCORECARD_METHODOLOGY_VERSION,
  )
  assert.equal(card.score, 100)
  assert.equal(card.scoreLabel, 'heuristic-check-summary')
  assert.equal(card.band, 'strong')
  assert.equal(card.partial, false)
  assert.equal(card.crawlComplete, true)
  assert.equal(card.counts.unknown, 0)
  assert.equal(card.counts.scored, card.checks.length)
  assert.equal(card.excluded.length, 0)
  assert.equal(card.weightScored, 100)
  assert.equal(card.weightTotal, 100)
  assert.ok(card.checks.every((check) => check.status === 'pass'))
})

test('aiSearchScorecard keeps a stable check order and reports each weight', () => {
  const card = aiSearchScorecard(cleanReport())
  assert.deepEqual(
    card.checks.map((check) => check.id),
    [
      'ai-bot-access',
      'https',
      'indexable-pages',
      'structured-data',
      'valid-json-ld',
      'entity-identity',
      'answerable-content',
    ],
  )
  for (const check of card.checks) {
    assert.equal(check.weight, SCORECARD_CHECK_WEIGHTS[check.id])
  }
})

test('aiSearchScorecard follows its own formula for mixed statuses', () => {
  // Blocked-but-not-all AI bot (warn), no entity sameAs (warn), and a page
  // with no structured data drag coverage below the pass threshold (fail).
  const card = aiSearchScorecard(
    createCrawlReport({
      config: { url: 'https://example.com' },
      generatedAt: '2026-06-20T00:00:00.000Z',
      requestEvidenceStatus: 'available',
      ai: {
        ...cleanAiSignals,
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
      },
      pages: [
        cleanPage('https://example.com/', {
          // no schemaSameAsEvidence -> entity warn (schema present, no sameAs)
        }),
        cleanPage('https://example.com/plain', {
          structuredDataFormats: [],
          schemaTypes: [],
        }),
        cleanPage('https://example.com/plain-two', {
          structuredDataFormats: [],
          schemaTypes: [],
        }),
      ],
    }),
  )

  const status = Object.fromEntries(
    card.checks.map((check) => [check.id, check.status]),
  )
  assert.equal(status['ai-bot-access'], 'warn')
  assert.equal(status['entity-identity'], 'warn')
  assert.equal(status['structured-data'], 'warn') // 1 of 3 pages -> >0 but <50%
  assert.equal(
    card.score,
    expectedScore(
      card.checks.map((check) => ({
        status: check.status,
        weight: check.weight,
      })),
      card.partial,
    ),
  )
})

test('aiSearchScorecard marks unknown checks excluded and never counts them as fail', () => {
  const card = aiSearchScorecard(
    createCrawlReport({
      config: { url: 'https://example.com' },
      generatedAt: '2026-06-20T00:00:00.000Z',
      requestEvidenceStatus: 'available',
      status: 'partial',
      stats: { pageLimitReached: true },
      ai: {
        // No robotsTxt evidence -> ai-bot-access unknown.
        llmsTxt: {
          url: 'https://example.com/llms.txt',
          exists: false,
          status: 404,
        },
      },
      pages: [
        cleanPage('https://example.com/', {
          // No structured data and no JSON-LD -> structured-data fail,
          // valid-json-ld unknown, entity-identity fail, answerable fail.
          structuredDataFormats: [],
          schemaTypes: [],
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
      ],
    }),
  )

  const excludedIds = card.excluded.map((entry) => entry.id).sort()
  assert.deepEqual(excludedIds, ['ai-bot-access', 'valid-json-ld'])
  assert.equal(card.counts.unknown, 2)
  assert.equal(card.partial, true)
  assert.equal(card.crawlComplete, false)
  // Three real failures, and the two unknowns are not among them.
  assert.equal(card.counts.fail, 3)
  for (const entry of card.excluded) {
    assert.ok(entry.reason.length > 0)
  }
  assert.equal(
    card.score,
    expectedScore(
      card.checks.map((check) => ({
        status: check.status,
        weight: check.weight,
      })),
      card.partial,
    ),
  )
})

test('aiSearchScorecard caps a partial crawl below a clean 100', () => {
  const card = aiSearchScorecard(
    cleanReport({ status: 'partial', stats: { pageLimitReached: true } }),
  )
  assert.equal(card.partial, true)
  assert.equal(card.crawlComplete, false)
  assert.ok(card.checks.every((check) => check.status === 'pass'))
  assert.equal(card.score, 99)
  assert.ok(
    card.caveats.some((caveat) => caveat.includes('cannot be a clean 100')),
  )
})

test('aiSearchScorecard returns a null score when every check is unknown', () => {
  const card = aiSearchScorecard(
    createCrawlReport({
      config: { url: 'https://example.com' },
      generatedAt: '2026-06-20T00:00:00.000Z',
      pages: [],
    }),
  )
  assert.equal(card.score, null)
  assert.equal(card.band, 'unscored')
  assert.equal(card.partial, true)
  assert.equal(card.counts.scored, 0)
  assert.ok(card.headline.includes('could not be scored'))
})

test('aiSearchScorecard is deterministic for identical input', () => {
  const first = aiSearchScorecard(cleanReport())
  const second = aiSearchScorecard(cleanReport())
  assert.equal(JSON.stringify(first), JSON.stringify(second))
})

test('aiSearchScorecard keeps optional signals as unscored observations', () => {
  const card = aiSearchScorecard(cleanReport())
  const observationIds = card.observations.map((item) => item.id)
  assert.deepEqual(observationIds, [
    'llms-txt',
    'agent-descriptors',
    'snippet-controls',
  ])
  // None of the observation ids leak into the scored checks.
  const checkIds = new Set<string>(card.checks.map((check) => check.id))
  for (const id of observationIds) assert.equal(checkIds.has(id), false)
})

test('aiSearchScorecard frames the score as a heuristic, not an eligibility verdict', () => {
  const card = aiSearchScorecard(cleanReport())
  assert.ok(card.methodology.summary.includes('heuristic'))
  assert.equal(card.scoreLabel, 'heuristic-check-summary')
  // The disclaimer must explicitly deny each unsupported claim.
  assert.ok(
    card.caveats.some(
      (caveat) =>
        caveat.includes('not a Google or AI-engine requirement') &&
        caveat.includes('eligibility verdict'),
    ),
  )
  assert.ok(card.methodology.summary.includes('not a Google or AI-engine'))
})

test('aiSearchScorecard separates observed evidence from derived findings', () => {
  const card = aiSearchScorecard(cleanReport())
  for (const check of card.checks) {
    assert.equal(typeof check.observed, 'object')
    assert.ok(check.finding.length > 0)
    assert.ok(check.verification.length > 0)
  }
})

test('aiSearchScorecard recognizes software identity without treating it as site identity', () => {
  const card = aiSearchScorecard(
    cleanReport({
      pages: [
        cleanPage('https://example.com/', {
          schemaTypes: ['SoftwareApplication', 'WebPage'],
          schemaSameAs: [],
          schemaSameAsEvidence: [],
          socialProfileLinks: [],
        }),
      ],
    }),
  )
  const identity = card.checks.find((check) => check.id === 'entity-identity')

  assert.equal(identity?.status, 'warn')
  assert.deepEqual(identity?.observed.schemaTypes, {
    SoftwareApplication: 1,
    WebPage: 1,
  })
  assert.deepEqual(identity?.observed.siteSameAs, [])
  assert.match(identity?.finding ?? '', /Entity schema is present/)
})

test('aiSearchScorecard does not count a page-level type as entity identity', () => {
  const card = aiSearchScorecard(
    cleanReport({
      pages: [
        cleanPage('https://example.com/', {
          schemaTypes: ['WebPage'],
          schemaSameAs: [],
          schemaSameAsEvidence: [],
          socialProfileLinks: [],
        }),
      ],
    }),
  )
  const identity = card.checks.find((check) => check.id === 'entity-identity')

  assert.equal(identity?.status, 'fail')
})
