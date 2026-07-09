import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { QuickWinItem } from './site-diagnostics/types.js'
import { templateOpportunityRecommendation } from './workflows/template-recommendations.js'

function item(query: string, url: string): QuickWinItem {
  return {
    query,
    url,
    template: {
      id: 'surname-entity',
      label: 'Surname entity page',
      confidence: 'high',
    },
    position: 6,
    clicks: 0,
    impressions: 1000,
    ctr: 0.02,
    targetCtr: 0.035,
    benchmark: {
      targetCtr: 0.035,
      source: 'builtin_position_ctr_curve_v1',
      samplePopulation: 'all_qualified_url_samples',
      peerRows: 0,
      peerImpressions: 0,
      qualifiedPeerImpressions: 0,
      urlSamples: 0,
      positiveUrlSamples: 0,
      excludedTargetRows: 1,
      leaveOut: 'target_url',
      confidence: 'fallback',
      heuristic: true,
    },
    estimatedCtrClickShortfall: 80,
    priority: {
      method: 'impressions_x_target_ctr_shortfall',
      score: 80,
      heuristic: true,
      estimatedClickLift: false,
    },
    finding: 'ctr-target-shortfall',
    recommendation: {
      principle: 'C.3',
      evidenceRef: query,
      action: 'Inspect page evidence.',
      effort: 'S',
      confidence: 'low',
    },
  }
}

test('template recommendations stay tied to observed queries and URLs', () => {
  const result = templateOpportunityRecommendation({
    templateId: 'surname-entity',
    templateLabel: 'Surname entity page',
    items: [
      item('origin of the last name laroya', 'https://example.com/laroya'),
      item(
        'how many people have the name keller',
        'https://example.com/keller',
      ),
    ],
  })

  assert.match(result.action, /live search results/)
  assert.match(result.evidence, /2 distinct URLs/)
  assert.match(result.evidence, /origin of the last name laroya/)
  assert.doesNotMatch(result.action, /rarity|country popularity|people-count/)
})

test('verified technical evidence takes precedence over shared edits', () => {
  const first = item('query one', 'https://example.com/a')
  first.contentVerification = {
    verifiedAt: '2026-01-01T00:00:00.000Z',
    query: first.query,
    url: first.url,
    status: 'verified',
    contentGapScore: 0,
    queryTerms: [],
    fields: {
      title: {
        phraseCount: 0,
        matchedTerms: [],
        missingTerms: [],
        termCoverage: 0,
      },
      h1: {
        phraseCount: 0,
        matchedTerms: [],
        missingTerms: [],
        termCoverage: 0,
      },
      metaDescription: {
        phraseCount: 0,
        matchedTerms: [],
        missingTerms: [],
        termCoverage: 0,
      },
      mainContent: {
        phraseCount: 0,
        matchedTerms: [],
        missingTerms: [],
        termCoverage: 0,
      },
    },
    classification: 'technical-check',
    signals: ['meta-noindex'],
    recommendation: 'Fix noindex.',
    summary: 'Noindex found.',
  }
  const result = templateOpportunityRecommendation({
    templateId: 'surname-entity',
    templateLabel: 'Surname entity page',
    items: [first, item('query two', 'https://example.com/b')],
  })

  assert.match(result.action, /Fix verified technical evidence/)
  assert.doesNotMatch(result.action, /title|heading|body/)
})
