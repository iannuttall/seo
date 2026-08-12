import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auditCrawlPages } from './audit.js'
import { crawlPage as page } from './audit.test-fixtures.js'
import { createCrawlReport } from './report.js'
import { reviewObservations, topFixes } from './top-fixes.js'

test('auditCrawlPages flags multiple H1 headings once with the count', () => {
  const issues = auditCrawlPages([page({ h1Count: 2 })])
  const h1Issues = issues.filter((issue) => issue.ruleId === 'h1_multiple')

  assert.equal(h1Issues.length, 1)
  assert.equal(h1Issues[0]?.detail, '2 H1 headings')
  assert.equal(h1Issues[0]?.evidence?.h1Count, 2)
  assert.equal(
    issues.some((issue) => issue.ruleId === 'h1_missing'),
    false,
  )
})

test('auditCrawlPages keeps a single H1 free of heading-count issues', () => {
  const issues = auditCrawlPages([page({ h1Count: 1 })])

  assert.deepEqual(
    issues
      .filter((issue) => issue.category === 'headings')
      .map((issue) => issue.ruleId),
    [],
  )
})

test('auditCrawlPages reports a missing H1 without a multiple-H1 issue', () => {
  const issues = auditCrawlPages([page({ h1: undefined, h1Count: 0 })])

  assert.deepEqual(
    issues
      .filter((issue) => issue.category === 'headings')
      .map((issue) => issue.ruleId),
    ['h1_missing'],
  )
})

test('auditCrawlPages labels near-empty extracted content as a review heuristic', () => {
  const pages = [
    page({
      extractionStatus: 'complete',
      wordCount: 3,
      contentSample: 'Blog Loading posts...',
      outgoingInternalCount: 5,
    }),
  ]
  const issues = auditCrawlPages(pages)
  const observed = issues.find((issue) => issue.ruleId === 'near_empty_content')

  assert.equal(observed?.detail, '3 extracted words')
  assert.deepEqual(observed?.evidence, {
    wordCount: 3,
    reviewBelowWords: 10,
    contentSample: 'Blog Loading posts...',
    outgoingInternalCount: 5,
    rendering: undefined,
  })

  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages,
    issues,
  })
  assert.equal(
    topFixes(report).some((fix) => fix.ruleId === 'near_empty_content'),
    false,
  )
  assert.equal(
    reviewObservations(report).some(
      (observation) => observation.ruleId === 'near_empty_content',
    ),
    true,
  )
})

test('auditCrawlPages does not infer near-empty content without complete extraction', () => {
  for (const input of [
    { extractionStatus: 'failed' as const, wordCount: 3 },
    { extractionStatus: 'not-applicable' as const, wordCount: 3 },
    { extractionStatus: 'complete' as const, wordCount: 10 },
    {
      extractionStatus: 'complete' as const,
      wordCount: 3,
      indexable: false,
      metaRobots: 'noindex',
    },
  ]) {
    const issues = auditCrawlPages([page(input)])
    assert.equal(
      issues.some((issue) => issue.ruleId === 'near_empty_content'),
      false,
      JSON.stringify(input),
    )
  }
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

test('auditCrawlPages observes pages without structured data', () => {
  const issues = auditCrawlPages([
    page({ structuredDataFormats: [], schemaTypes: [] }),
  ])
  const observed = issues.filter(
    (issue) => issue.ruleId === 'structured_data_missing',
  )

  assert.equal(observed.length, 1)
  assert.equal(observed[0]?.detail, 'No structured data detected')
  assert.deepEqual(observed[0]?.evidence, {
    structuredDataFormats: [],
    schemaTypes: [],
    invalidJsonLdCount: 0,
    unrecognizedJsonLdTypeCount: 0,
  })
})

test('auditCrawlPages skips structured-data observation when JSON-LD exists', () => {
  const issues = auditCrawlPages([
    page({ structuredDataFormats: ['json-ld'], schemaTypes: ['Article'] }),
  ])

  assert.equal(
    issues.some((issue) => issue.ruleId === 'structured_data_missing'),
    false,
  )
})

test('auditCrawlPages skips structured-data observation without extraction evidence', () => {
  const issues = auditCrawlPages([
    page({ structuredDataFormats: undefined, schemaTypes: [] }),
  ])

  assert.equal(
    issues.some((issue) => issue.ruleId === 'structured_data_missing'),
    false,
  )
})

test('auditCrawlPages skips structured-data observation on status-only pages', () => {
  const issues = auditCrawlPages([
    page({ auditScope: 'status', structuredDataFormats: [], schemaTypes: [] }),
  ])

  assert.equal(
    issues.some((issue) => issue.ruleId === 'structured_data_missing'),
    false,
  )
})

test('auditCrawlPages skips structured-data observation on error statuses', () => {
  const issues = auditCrawlPages([
    page({ status: 404, structuredDataFormats: [], schemaTypes: [] }),
  ])

  assert.equal(
    issues.some((issue) => issue.ruleId === 'structured_data_missing'),
    false,
  )
  assert.equal(
    issues.some((issue) => issue.ruleId === 'client_error'),
    true,
  )
})

test('auditCrawlPages skips structured-data observation on redirected pages', () => {
  const issues = auditCrawlPages([
    page({
      url: 'https://example.com/old',
      finalUrl: 'https://example.com/new',
      structuredDataFormats: [],
      schemaTypes: [],
    }),
  ])

  assert.equal(
    issues.some((issue) => issue.ruleId === 'structured_data_missing'),
    false,
  )
})

test('auditCrawlPages skips structured-data observation on noindex pages', () => {
  const issues = auditCrawlPages([
    page({
      metaRobots: 'noindex',
      indexable: false,
      structuredDataFormats: [],
      schemaTypes: [],
    }),
  ])

  assert.equal(
    issues.some((issue) => issue.ruleId === 'structured_data_missing'),
    false,
  )
  assert.equal(
    issues.some((issue) => issue.ruleId === 'noindex'),
    true,
  )
})

test('auditCrawlPages keeps invalid JSON-LD separate from the missing observation', () => {
  const issues = auditCrawlPages([
    page({
      structuredDataFormats: [],
      schemaTypes: [],
      invalidJsonLdCount: 1,
      invalidJsonLdSamples: [{ snippet: '{ broken', error: 'Unexpected end' }],
    }),
  ])

  assert.equal(
    issues.some((issue) => issue.ruleId === 'structured_data_missing'),
    false,
  )
  assert.equal(
    issues.some((issue) => issue.ruleId === 'jsonld_invalid'),
    true,
  )
})

test('h1_multiple and structured_data_missing stay review observations', () => {
  const pages = [
    page({ h1Count: 3, structuredDataFormats: [], schemaTypes: [] }),
  ]
  const report = createCrawlReport({
    config: { url: 'https://example.com/' },
    pages,
    issues: auditCrawlPages(pages),
  })

  const fixRuleIds = topFixes(report).map((fix) => fix.ruleId)
  assert.equal(fixRuleIds.includes('h1_multiple'), false)
  assert.equal(fixRuleIds.includes('structured_data_missing'), false)

  const reviews = reviewObservations(report)
  const reviewRuleIds = reviews.map((observation) => observation.ruleId)
  assert.equal(reviewRuleIds.includes('h1_multiple'), true)
  assert.equal(reviewRuleIds.includes('structured_data_missing'), true)
  for (const observation of reviews) {
    assert.equal(observation.recommendation, 'review')
  }
})

test('auditCrawlPages returns deterministic issue ordering', () => {
  const pages = [
    page({
      url: 'https://example.com/multiple',
      h1Count: 2,
      structuredDataFormats: [],
      schemaTypes: [],
    }),
    page({
      url: 'https://example.com/missing',
      h1: undefined,
      h1Count: 0,
      structuredDataFormats: [],
      schemaTypes: [],
    }),
  ]

  const first = auditCrawlPages(pages)
  const second = auditCrawlPages(pages)

  assert.deepEqual(first, second)
  assert.ok(first.length > 0)
})
