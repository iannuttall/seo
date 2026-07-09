import assert from 'node:assert/strict'
import test from 'node:test'
import type { DiagnosePropertyReport } from '../diagnose-property.js'
import { analyzeStrikingDistanceRows } from '../striking-distance.js'
import { contentOpportunityBullets, headlineLine } from './sections.js'

function emptyDiagnosis(): DiagnosePropertyReport {
  const striking = analyzeStrikingDistanceRows({
    site: 'sc-domain:example.com',
    rows: [],
  })
  return {
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-03T00:00:00.000Z',
    summary: {
      classification: 'not-enough-evidence',
      significantAnomalies: 0,
      updateMatches: 0,
      largestPageMovements: 0,
      decayItems: 0,
      cannibalItems: 0,
      strikingDistanceItems: 0,
    },
    priorities: [],
    anomaly: {
      site: 'sc-domain:example.com',
      generatedAt: '2026-06-03T00:00:00.000Z',
      anomalies: [],
      rows: 0,
    },
    updateCorrelation: {
      site: 'sc-domain:example.com',
      generatedAt: '2026-06-03T00:00:00.000Z',
      anomalies: [],
      overlappingUpdates: [],
      classification: 'not-enough-evidence',
      attribution: 'weak-or-no-overlap',
      confidence: 'low',
      confounders: [],
      summary: 'No official update overlap.',
      evidence: [],
      caveats: [],
      actions: [],
      source: {
        name: 'Google Search Status Dashboard incidents feed',
        url: 'https://status.search.google.com/incidents.json',
        product: 'Ranking',
      },
    },
    segments: {
      page: segment('page'),
      query: segment('query'),
      device: segment('device'),
      country: segment('country'),
    },
    decay: {
      site: 'sc-domain:example.com',
      generatedAt: '',
      ranges: {
        current: { startDate: '2026-05-01', endDate: '2026-05-28' },
        previous: { startDate: '2026-04-03', endDate: '2026-04-30' },
      },
      filters: {
        minDropPct: 20,
        minPreviousClicks: 2,
        minClickLoss: 1,
        brand: 'excluded',
      },
      summary: {
        rows: 0,
        groups: 0,
        totalClickLoss: 0,
        brandFiltering: 'excluded',
        verdict: 'No material decay matched these filters.',
      },
      caveats: [],
      recommendations: [],
      items: [],
      groups: [],
      templates: [],
    },
    cannibalization: {
      site: 'sc-domain:example.com',
      generatedAt: '',
      items: [],
      suppressed: [],
      suppressionSummary: {},
      templates: [],
    },
    strikingDistance: {
      site: 'sc-domain:example.com',
      generatedAt: '',
      range: { startDate: '2026-05-01', endDate: '2026-05-30' },
      rangeDays: 30,
      source: {
        provider: 'google-search-console',
        dimensions: ['query', 'page'],
        searchType: 'web',
        dataState: 'final',
        rowsFetched: 0,
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
        completeness: 'retained-query-rows-only',
      },
      dataStatus: striking.dataStatus,
      selection: striking.selection,
      methodology: striking.methodology,
      verification: {
        requested: false,
        attempted: 0,
        verified: 0,
        technical: 0,
        failed: 0,
      },
      items: [],
      templates: [],
      groups: [],
      summary: {
        ...striking.summary,
        brandFiltering: 'excluded',
        verdict: 'No position 11-20 opportunities matched these filters.',
      },
      caveats: [],
      recommendations: [],
    },
    quickWins: {
      site: 'sc-domain:example.com',
      generatedAt: '',
      range: { startDate: '2026-05-01', endDate: '2026-05-28' },
      benchmark: {
        method: 'site_gsc_position_bucket_robust_p75_leave_one_out',
        peerRows: 0,
        byPosition: {},
      },
      verification: { requested: false, verified: 0, failed: 0 },
      summary: {
        rows: 0,
        repeatedQueryGroups: 0,
        templatePatterns: 0,
        totalEstimatedClickLift: 0,
        brandFiltering: 'excluded',
        verdict: 'No quick wins matched these filters.',
      },
      caveats: [],
      recommendations: [],
      templates: [],
      templateRecommendations: [],
      groups: [],
      items: [],
    },
  }
}

function segment(dimension: 'page' | 'query' | 'device' | 'country') {
  return {
    site: 'sc-domain:example.com',
    dimension,
    before: { startDate: '2026-04-01', endDate: '2026-04-30' },
    after: { startDate: '2026-05-01', endDate: '2026-05-30' },
    generatedAt: '',
    items: [],
  }
}

test('contentOpportunityBullets hides zero-count non-findings', () => {
  const bullets = contentOpportunityBullets(emptyDiagnosis())

  assert.equal(bullets.length, 1)
  assert.match(bullets[0] ?? '', /No material content opportunity/)
  assert.doesNotMatch(bullets.join('\n'), /0 decaying/)
  assert.doesNotMatch(bullets.join('\n'), /0 cannibalisation/)
})

test('headlineLine writes zero counts as plain English', () => {
  const headline = headlineLine(emptyDiagnosis())

  assert.equal(
    headline,
    'not-enough-evidence; no significant anomaly signals; no decay items; no striking-distance opportunities.',
  )
  assert.doesNotMatch(headline, /0 .*item/)
})
