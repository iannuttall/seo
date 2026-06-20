import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentOptimizationFromPageOpportunities } from './content-optimization.js'
import type { PageOpportunityReport } from './page-opportunities.js'

test('contentOptimizationFromPageOpportunities creates human actions and agent data', () => {
  const report: PageOpportunityReport = {
    site: 'sc-domain:example.com',
    url: 'https://example.com/pocket-alternatives',
    generatedAt: '2026-06-20T00:00:00.000Z',
    range: { startDate: '2026-05-01', endDate: '2026-05-28' },
    rangeDays: 28,
    page: {
      finalUrl: 'https://example.com/pocket-alternatives',
      title: 'Pocket alternatives',
      h1: 'Pocket alternatives',
      wordCount: 1200,
    },
    summary: {
      queries: 3,
      clicks: 10,
      impressions: 1000,
      opportunities: 2,
      estimatedClickLift: 50,
      verdict: '2 query opportunities found.',
      focus: 'content-gap',
    },
    items: [
      {
        query: 'best pocket alternatives',
        clicks: 5,
        impressions: 500,
        ctr: 0.01,
        position: 6,
        expectedCtr: 0.04,
        estimatedClickLift: 30,
        opportunityType: 'content-gap',
        recommendation: 'Add a direct comparison section.',
      },
      {
        query: 'pocket vs instapaper',
        clicks: 3,
        impressions: 300,
        ctr: 0.01,
        position: 8,
        expectedCtr: 0.03,
        estimatedClickLift: 20,
        opportunityType: 'serp-framing',
        recommendation: 'Make the comparison clearer in title/meta.',
      },
      {
        query: 'pocket app',
        clicks: 2,
        impressions: 200,
        ctr: 0.01,
        position: 4,
        expectedCtr: 0.06,
        estimatedClickLift: 0,
        opportunityType: 'covered',
        recommendation: 'Already covered.',
      },
    ],
    warnings: [],
    caveats: ['GSC caveat.'],
    recommendations: ['Start with best pocket alternatives.'],
  }

  const optimized = contentOptimizationFromPageOpportunities(report)

  assert.equal(optimized.summary.score, 60)
  assert.equal(optimized.summary.primaryIntent, 'comparison')
  assert.equal(optimized.summary.primaryQuery, 'best pocket alternatives')
  assert.equal(optimized.topActions[0]?.title, 'Add missing answer coverage')
  assert.match(optimized.brief.sections[0]?.heading ?? '', /Best Pocket/)
  assert.deepEqual(optimized.brief.internalLinkAnchors, [
    'best pocket alternatives',
    'pocket vs instapaper',
  ])
  assert.equal(optimized.sourceReport.items.length, 3)
})
