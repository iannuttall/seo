import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentOptimizationFromPageOpportunities } from './content-optimization.js'
import type { PageOpportunityReport } from './page-opportunities.js'

const reportUrl = 'https://example.com/pocket-alternatives'

const benchmark = {
  applicable: true,
  expectedCtr: 0.04,
  source: 'default_position_curve',
  peerRows: 0,
  peerImpressions: 0,
  qualifiedPeerImpressions: 0,
  urlSamples: 0,
  positiveUrlSamples: 0,
  excludedTargetRows: 0,
}

const verification = {
  status: 'verified' as const,
  reason: 'Test page evidence.',
  signals: [],
}

test('contentOptimizationFromPageOpportunities creates human actions and agent data', () => {
  const report: PageOpportunityReport = {
    site: 'sc-domain:example.com',
    url: reportUrl,
    generatedAt: '2026-06-20T00:00:00.000Z',
    range: { startDate: '2026-05-01', endDate: '2026-05-28' },
    rangeDays: 28,
    source: {
      provider: 'google-search-console',
      dimensions: ['query', 'page'],
      searchType: 'web',
      dataState: 'final',
      targetRowsFetched: 3,
      targetCalls: 1,
    },
    dataStatus: 'available',
    selection: {
      sourceRows: 3,
      invalidRows: 0,
      wrongPageRows: 0,
      belowMinimumRows: 0,
      lowActionabilityRows: 0,
      brandRows: 0,
      eligibleRows: 3,
      returnedRows: 3,
      limitedRows: 0,
    },
    verification: {
      status: 'verified',
      reason: 'Test page evidence.',
    },
    benchmark: {
      sourceRows: 5,
      eligibleRows: 5,
      excludedTargetRows: 0,
      rowsFetched: 5,
      calls: 1,
      maxRows: 100_000,
      possiblyTruncated: false,
    },
    summary: {
      queries: 3,
      clicks: 10,
      impressions: 1000,
      opportunities: 2,
      estimatedCtrClickShortfall: 50,
      estimatedClickLift: 50,
      verdict: '2 query opportunities found.',
      focus: 'content-gap',
    },
    items: [
      {
        query: 'best pocket alternatives',
        url: reportUrl,
        clicks: 5,
        impressions: 500,
        ctr: 0.01,
        position: 6,
        expectedCtr: 0.04,
        expectedClicks: 20,
        estimatedCtrClickShortfall: 30,
        estimatedClickLift: 30,
        opportunityType: 'content-gap',
        benchmark,
        verification,
        recommendation: 'Add a direct comparison section.',
      },
      {
        query: 'pocket vs instapaper',
        url: reportUrl,
        clicks: 3,
        impressions: 300,
        ctr: 0.01,
        position: 8,
        expectedCtr: 0.03,
        expectedClicks: 9,
        estimatedCtrClickShortfall: 20,
        estimatedClickLift: 20,
        opportunityType: 'serp-framing',
        benchmark,
        verification,
        recommendation: 'Make the comparison clearer in title/meta.',
      },
      {
        query: 'pocket app',
        url: reportUrl,
        clicks: 2,
        impressions: 200,
        ctr: 0.01,
        position: 4,
        expectedCtr: 0.06,
        expectedClicks: 12,
        estimatedCtrClickShortfall: 0,
        estimatedClickLift: 0,
        opportunityType: 'covered',
        benchmark,
        verification,
        recommendation: 'Already covered.',
      },
    ],
    warnings: [],
    caveats: ['GSC caveat.'],
    recommendations: ['Start with best pocket alternatives.'],
  }

  const optimized = contentOptimizationFromPageOpportunities(report)

  assert.equal(optimized.summary.score, 60)
  assert.equal(optimized.generatedAt, report.generatedAt)
  assert.equal(optimized.summary.primaryIntent, 'comparison')
  assert.equal(optimized.summary.primaryQuery, 'best pocket alternatives')
  assert.equal(optimized.topActions[0]?.title, 'Add missing answer coverage')
  assert.match(optimized.brief.sections[0]?.heading ?? '', /Best Pocket/)
  assert.deepEqual(optimized.brief.internalLinkAnchors, [
    'best pocket alternatives',
  ])
  assert.equal(optimized.sourceReport.items.length, 3)
  const firstItem = report.items[0]
  assert.ok(firstItem)

  const technical = contentOptimizationFromPageOpportunities({
    ...report,
    summary: {
      ...report.summary,
      opportunities: 1,
      focus: 'technical-check',
    },
    items: [
      {
        ...firstItem,
        opportunityType: 'technical-check',
        verification: {
          status: 'technical-check',
          reason: 'The URL returned 404.',
          signals: ['http-non-2xx'],
          httpStatus: 404,
        },
      },
    ],
  })
  assert.deepEqual(technical.brief.sections, [])
  assert.equal(technical.brief.titleAngle, undefined)
  assert.equal(technical.brief.h1Angle, undefined)
  assert.equal(technical.brief.metaAngle, undefined)
  assert.equal(
    technical.topActions[0]?.title,
    'Resolve technical evidence first',
  )
})
