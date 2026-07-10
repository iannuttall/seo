import assert from 'node:assert/strict'
import test from 'node:test'
import type { DiagnosePropertyReport } from '../analyze/diagnose-property.js'
import { analyzeDecay } from '../analyze/site-diagnostics/decay-analysis.js'
import {
  analyzeCannibalRows,
  analyzeQuickWinsFromRows,
} from '../analyze/site-diagnostics.js'
import { analyzeStrikingDistanceRows } from '../analyze/striking-distance.js'
import { diagnoseCsvFiles, quickWinsCsvRows, renderCsv } from './csv.js'

function emptyQuickWins(): DiagnosePropertyReport['quickWins'] {
  const analysis = analyzeQuickWinsFromRows({
    site: 'sc-domain:example.com',
    rows: [],
  })
  return {
    site: 'sc-domain:example.com',
    generatedAt: '',
    range: { startDate: '2026-05-01', endDate: '2026-05-28' },
    rangeDays: 28,
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
    dataStatus: analysis.dataStatus,
    selection: analysis.selection,
    methodology: analysis.methodology,
    provenance: {
      ...analysis.provenance,
      verification: {
        optional: true,
        population: 'returned_rows_in_priority_order',
        fetchDeduplication: 'exact_url',
      },
    },
    benchmark: {
      method: analysis.methodology.benchmark.method,
      peerRows: 0,
      byPosition: analysis.benchmarkByPosition,
    },
    verification: {
      requested: false,
      attemptedRows: 0,
      attemptedUrls: 0,
      verified: 0,
      technical: 0,
      failed: 0,
    },
    summary: {
      ...analysis.summary,
      repeatedQueryGroups: 0,
      templatePatterns: 0,
      brandFiltering: 'excluded',
      verdict: 'No quick wins matched these filters.',
    },
    caveats: [],
    recommendations: [],
    templates: [],
    templateRecommendations: [],
    groups: [],
    items: [],
    ledgerSummary: 'No provider calls recorded.',
    warnings: [],
  }
}

function emptyCannibal(): DiagnosePropertyReport['cannibalization'] {
  const analysis = analyzeCannibalRows({
    site: 'sc-domain:example.com',
    rows: [],
  })
  return {
    schemaVersion: 1,
    site: 'sc-domain:example.com',
    generatedAt: '',
    range: { startDate: '2026-05-01', endDate: '2026-05-28' },
    rangeDays: 28,
    dataStatus: 'empty',
    source: {
      provider: 'google-search-console',
      searchType: 'web',
      dataState: 'final',
      pageExposure: {
        dimensions: ['query', 'page'],
        aggregationType: 'auto',
        rowsFetched: 0,
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
      },
      propertyDemand: {
        dimensions: ['query'],
        aggregationType: 'byProperty',
        rowsFetched: 0,
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
      },
      completeness: 'complete',
    },
    methodology: {
      id: 'gsc_url_overlap_v2',
      version: 2,
      minimumPageImpressions: 10,
      minimumPageImpressionShare: 0.1,
      maximumDominantPageShare: 0.8,
      matching: 'normalized_exact_query',
      finding: 'url-overlap-candidate',
      requiresIntentReview: true,
    },
    verification: {
      status: 'not-requested',
      technicalStateChecked: false,
      searchIntentChecked: false,
    },
    filters: analysis.filters,
    selection: analysis.selection,
    summary: {
      eligibleClusters: 0,
      returnedClusters: 0,
      suppressedQueries: 0,
      brandFiltering: 'excluded',
      verdict: 'No retained rows.',
    },
    items: [],
    suppressed: [],
    suppressionSummary: {},
    templates: [],
    caveats: [],
    recommendations: [],
    ledgerSummary: 'GSC: 0 calls, 0 rows.',
  }
}

function emptyDecay(): DiagnosePropertyReport['decay'] {
  const analysis = analyzeDecay({
    site: 'sc-domain:example.com',
    currentRows: [],
    previousRows: [],
  })
  return {
    schemaVersion: 1,
    site: 'sc-domain:example.com',
    generatedAt: '',
    comparison: 'previous-period',
    ranges: {
      current: { startDate: '2026-05-01', endDate: '2026-05-28' },
      previous: { startDate: '2026-04-03', endDate: '2026-04-30' },
    },
    rangeDays: 28,
    dataStatus: 'empty',
    source: {
      provider: 'google-search-console',
      dimensions: ['query', 'page'],
      aggregationType: 'auto',
      searchType: 'web',
      dataState: 'final',
      current: {
        rowsFetched: 0,
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
      },
      previous: {
        rowsFetched: 0,
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
      },
      completeness: 'retained-query-rows-only',
    },
    methodology: {
      id: 'gsc_retained_query_page_decay_v2',
      version: 2,
      gscHistoryMonths: 16,
      missingRowsTreatedAsZero: false,
      urlShiftsExcluded: true,
      causeLanguage: 'signals-not-attribution',
    },
    filters: {
      minDropPct: 20,
      minPreviousClicks: 2,
      minClickLoss: 1,
      limit: 25,
      brand: 'excluded',
    },
    selection: analysis.selection,
    summary: {
      eligibleRows: 0,
      returnedRows: 0,
      groups: 0,
      observedRetainedQueryClickLoss: 0,
      returnedObservedRetainedQueryClickLoss: 0,
      brandFiltering: 'excluded',
      verdict: 'No material decay matched these filters.',
    },
    caveats: [],
    recommendations: [],
    items: analysis.items,
    groups: analysis.groups,
    templates: analysis.templates,
    ledgerSummary: 'GSC: 0 calls, 0 rows.',
    warnings: [],
  }
}

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
  const striking = analyzeStrikingDistanceRows({
    site: 'sc-domain:example.com',
    rows: [],
  })
  const files = diagnoseCsvFiles({
    site: 'sc-domain:example.com',
    generatedAt: '',
    dataStatus: 'complete',
    summary: {
      updateAttribution: 'not-enough-evidence',
      updateAttributionStatus: 'available',
      classification: 'not-enough-evidence',
      significantAnomalies: 0,
      updateMatches: 0,
      largestPageMovements: 0,
      decayItems: 0,
      cannibalItems: 0,
      strikingDistanceItems: 0,
      quickWinItems: 0,
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
    decay: emptyDecay(),
    cannibalization: emptyCannibal(),
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
    quickWins: emptyQuickWins(),
  })

  const decay = files.find((file) => file.filename === 'decay.csv')
  assert.deepEqual(decay?.headers?.slice(0, 3), ['rank', 'query', 'url'])
  assert.equal(
    renderCsv(decay?.rows ?? [], decay?.headers),
    'rank,query,url,template,diagnosis,signals,evidence_scope,click_loss,drop_pct,previous_clicks,current_clicks,previous_position,current_position,action\n',
  )
  const quickWins = files.find((file) => file.filename === 'quick-wins.csv')
  assert.equal(quickWins?.headers?.includes('target_ctr'), true)
  assert.equal(
    quickWins?.headers?.includes('estimated_ctr_click_shortfall'),
    true,
  )
  assert.equal(quickWins?.headers?.includes('expected_ctr'), false)
  assert.equal(quickWins?.headers?.includes('estimated_click_lift'), false)
})

test('quick-win CSV preserves heuristic provenance without forecast fields', () => {
  const quickWins = emptyQuickWins()
  const analysis = analyzeQuickWinsFromRows({
    site: 'sc-domain:example.com',
    rows: [
      {
        keys: ['technical seo audit', 'https://example.com/audit'],
        clicks: 0,
        impressions: 1000,
        ctr: 0,
        position: 9,
      },
    ],
  })
  quickWins.items = analysis.items
  const [row] = quickWinsCsvRows(quickWins)

  assert.equal(row?.target_ctr, 0.015)
  assert.equal(row?.estimated_ctr_click_shortfall, 15)
  assert.equal(row?.heuristic, true)
  assert.equal(row?.traffic_forecast, false)
  assert.equal(Object.hasOwn(row ?? {}, 'expected_ctr'), false)
  assert.equal(Object.hasOwn(row ?? {}, 'estimated_click_lift'), false)
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
