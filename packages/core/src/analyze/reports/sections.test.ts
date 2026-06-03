import assert from 'node:assert/strict'
import test from 'node:test'
import type { DiagnosePropertyReport } from '../diagnose-property.js'
import { contentOpportunityBullets, headlineLine } from './sections.js'

function emptyDiagnosis(): DiagnosePropertyReport {
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
      filters: {
        minDropPct: 20,
        minPreviousClicks: 2,
        minClickLoss: 1,
        brand: 'excluded',
      },
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
      verification: { requested: false, verified: 0, failed: 0 },
      items: [],
      templates: [],
    },
    quickWins: {
      site: 'sc-domain:example.com',
      generatedAt: '',
      verification: { requested: false, verified: 0, failed: 0 },
      templates: [],
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
