import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { QuickWinItem } from './site-diagnostics/types.js'
import { templateOpportunityRecommendation } from './workflows/template-recommendations.js'

function item(query: string): QuickWinItem {
  return {
    query,
    url: 'https://example.com/page/',
    template: {
      id: 'example-site-surname',
      label: 'ExampleSite surname page',
      confidence: 'high',
    },
    position: 6,
    impressions: 1000,
    ctr: 0.02,
    expectedCtrAt3: 0.1,
    estimatedClickLift: 80,
    contentVerification: {
      verifiedAt: '2026-01-01T00:00:00.000Z',
      url: 'https://example.com/page/',
      status: 'verified',
      contentGapScore: 4,
      queryTerms: [],
      fields: {
        title: {
          phraseCount: 0,
          matchedTerms: [],
          missingTerms: [],
          termCoverage: 1,
        },
        h1: {
          phraseCount: 0,
          matchedTerms: [],
          missingTerms: [],
          termCoverage: 1,
        },
        metaDescription: {
          phraseCount: 0,
          matchedTerms: [],
          missingTerms: [],
          termCoverage: 1,
        },
        mainContent: {
          phraseCount: 0,
          matchedTerms: [],
          missingTerms: [],
          termCoverage: 1,
        },
      },
      classification: 'serp-framing',
      signals: ['exact-phrase-missing'],
      recommendation: 'Test title/H1 wording.',
      summary: 'SERP wording may be weak.',
    },
    recommendation: {
      principle: 'C.3',
      evidenceRef: query,
      action: 'Test title/H1 wording.',
      effort: 'S',
      confidence: 'medium',
    },
  }
}

test('templateOpportunityRecommendation gives surname-specific action', () => {
  const result = templateOpportunityRecommendation({
    templateId: 'example-site-surname',
    templateLabel: 'ExampleSite surname page',
    items: [
      item('origin of the last name laroya'),
      item('how many people with last name keller in usa'),
    ],
  })

  assert.match(result.action, /origin/)
  assert.match(result.action, /how many people/)
  assert.match(result.evidence, /origin of the last name laroya/)
})

test('templateOpportunityRecommendation gives tide-specific action', () => {
  const result = templateOpportunityRecommendation({
    templateId: 'example-site-location',
    templateLabel: 'ExampleSite location page',
    items: [item('high tide today'), item('low tide today')],
  })

  assert.match(result.action, /high tide today/)
  assert.match(result.action, /low tide today/)
})
