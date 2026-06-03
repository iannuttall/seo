import assert from 'node:assert/strict'
import test from 'node:test'
import { diagnoseCsvFiles, renderCsv } from './csv.js'

test('renderCsv escapes commas, quotes, and newlines', () => {
  const csv = renderCsv([
    {
      query: 'best seo tools',
      note: 'Needs "client ready", not vague',
      action: 'Export CSV\nSend to client',
    },
  ])

  assert.equal(
    csv,
    'query,note,action\nbest seo tools,"Needs ""client ready"", not vague","Export CSV\nSend to client"\n',
  )
})

test('renderCsv can render empty tables with explicit headers', () => {
  const csv = renderCsv([], ['query', 'url', 'action'])

  assert.equal(csv, 'query,url,action\n')
})

test('diagnoseCsvFiles includes schemas for empty detail tables', () => {
  const files = diagnoseCsvFiles({
    site: 'sc-domain:example.com',
    generatedAt: '',
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
      generatedAt: '',
      anomalies: [],
      rows: 0,
    },
    updateCorrelation: {
      site: 'sc-domain:example.com',
      generatedAt: '',
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
      verification: { requested: false, verified: 0, failed: 0 },
      items: [],
      templates: [],
      groups: [],
      summary: {
        opportunities: 0,
        groups: 0,
        totalImpressions: 0,
        brandFiltering: 'excluded',
        verdict: 'No position 11-20 opportunities matched these filters.',
      },
      caveats: [],
      recommendations: [],
    },
    quickWins: {
      site: 'sc-domain:example.com',
      generatedAt: '',
      verification: { requested: false, verified: 0, failed: 0 },
      templates: [],
      groups: [],
      items: [],
    },
  })

  const decay = files.find((file) => file.filename === 'decay.csv')
  assert.deepEqual(decay?.headers?.slice(0, 3), ['rank', 'query', 'url'])
  assert.equal(
    renderCsv(decay?.rows ?? [], decay?.headers),
    'rank,query,url,template,diagnosis,click_loss,drop_pct,previous_clicks,current_clicks,previous_position,current_position,action\n',
  )
})

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
