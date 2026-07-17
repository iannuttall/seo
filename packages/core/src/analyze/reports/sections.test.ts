import assert from 'node:assert/strict'
import test from 'node:test'
import type { DiagnosePropertyReport } from '../diagnose-property.js'
import { buildDiagnosisPriorities } from '../diagnosis-priorities.js'
import { diagnosisPartialReasons } from '../diagnosis-status.js'
import { compareSegmentRows } from '../segment-impact.js'
import { analyzeDecay } from '../site-diagnostics/decay-analysis.js'
import {
  analyzeCannibalRows,
  analyzeQuickWinsFromRows,
} from '../site-diagnostics.js'
import { analyzeStrikingDistanceRows } from '../striking-distance.js'
import {
  contentOpportunityBullets,
  diagnosisAvailabilityCaveats,
  headlineLine,
  movementLine,
  topSegmentLine,
  updateAttributionLine,
} from './sections.js'

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
        validation: { retainedRows: 0, invalidRows: 0 },
        calls: 0,
        maxRows: 100_000,
        possiblyTruncated: false,
      },
      propertyDemand: {
        dimensions: ['query'],
        aggregationType: 'byProperty',
        rowsFetched: 0,
        validation: { retainedRows: 0, invalidRows: 0 },
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

function emptyDiagnosis(): DiagnosePropertyReport {
  const striking = analyzeStrikingDistanceRows({
    site: 'sc-domain:example.com',
    rows: [],
  })
  return {
    site: 'sc-domain:example.com',
    generatedAt: '2026-06-03T00:00:00.000Z',
    dataStatus: 'complete',
    summary: {
      updateAttribution: 'no-update-overlap',
      updateAttributionStatus: 'available',
      classification: 'no-update-overlap',
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
      generatedAt: '2026-06-03T00:00:00.000Z',
      anomalies: [],
      rows: 0,
    },
    updateCorrelation: {
      site: 'sc-domain:example.com',
      generatedAt: '2026-06-03T00:00:00.000Z',
      anomalies: [],
      overlappingUpdates: [],
      classification: 'no-update-overlap',
      attribution: 'not-established',
      confidence: 'none',
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
  }
}

function segment(dimension: 'page' | 'query' | 'device' | 'country') {
  return compareSegmentRows({
    site: 'sc-domain:example.com',
    dimension,
    before: { startDate: '2026-04-01', endDate: '2026-04-30' },
    after: { startDate: '2026-05-01', endDate: '2026-05-30' },
    beforeRows: [],
    afterRows: [],
    generatedAt: '',
  })
}

function significantClickAnomaly(
  site: string,
): DiagnosePropertyReport['anomaly']['anomalies'][number] {
  return {
    site,
    metric: 'clicks',
    baselineStart: '2026-04-01',
    baselineEnd: '2026-04-30',
    comparisonStart: '2026-05-01',
    comparisonEnd: '2026-05-14',
    baselineMean: 100,
    comparisonMean: 60,
    baselineTotal: 3_000,
    comparisonTotal: 840,
    percentChange: -40,
    zScore: -3,
    significanceMethod: 'z-score',
    direction: 'drop',
    significant: true,
  }
}

test('contentOpportunityBullets hides zero-count non-findings', () => {
  const bullets = contentOpportunityBullets(emptyDiagnosis())

  assert.equal(bullets.length, 1)
  assert.match(bullets[0] ?? '', /No material content opportunity/)
  assert.doesNotMatch(bullets.join('\n'), /0 decaying/)
  assert.doesNotMatch(bullets.join('\n'), /0 cannibalisation/)
})

test('striking-distance summaries use singular nouns and verbs', () => {
  const report = emptyDiagnosis()
  const analysis = analyzeStrikingDistanceRows({
    site: report.site,
    rows: [
      {
        keys: ['technical seo', 'https://example.com/guide'],
        clicks: 2,
        impressions: 100,
        ctr: 0.02,
        position: 15,
      },
    ],
  })
  report.strikingDistance.items = analysis.items
  report.summary.strikingDistanceItems = analysis.items.length

  assert.match(
    contentOpportunityBullets(report).join('\n'),
    /1 query\/page candidate has an average GSC position/,
  )
  const priority = buildDiagnosisPriorities({
    anomaly: report.anomaly,
    update: report.updateCorrelation,
    page: report.segments.page,
    decay: report.decay,
    cannibal: report.cannibalization,
    striking: report.strikingDistance,
    quickWins: report.quickWins,
  })[0]
  assert.match(priority?.reason ?? '', /1 query\/page row has an average/)
})

test('headlineLine writes zero counts as plain English', () => {
  const headline = headlineLine(emptyDiagnosis())

  assert.equal(
    headline,
    'no significant anomaly signals; no observed retained query/page declines; no striking-distance opportunities; no quick-win candidates.',
  )
  assert.doesNotMatch(headline, /0 .*item/)
})

test('partial source evidence is visible in narrative caveats', () => {
  const report = emptyDiagnosis()
  report.dataStatus = 'partial'
  report.partialReasons = [
    {
      section: 'quick-win opportunities',
      reason: 'The retained Search Console response reached its row cap.',
    },
  ]

  assert.deepEqual(diagnosisAvailabilityCaveats(report), [
    'Partial quick-win opportunities: The retained Search Console response reached its row cap.',
  ])
})

test('skipped evidence is unavailable instead of a reassuring negative', () => {
  const report = emptyDiagnosis()
  report.dataStatus = 'partial'
  report.skippedSections = [
    { section: 'traffic anomaly', reason: 'Daily rows were unavailable.' },
    {
      section: 'page movement segments',
      reason: 'Comparison rows were unavailable.',
    },
    {
      section: 'update correlation',
      reason: 'Search Status was unavailable.',
    },
    { section: 'decay analysis', reason: 'Historical rows were unavailable.' },
    {
      section: 'cannibalisation analysis',
      reason: 'Query/page rows were unavailable.',
    },
    {
      section: 'striking-distance opportunities',
      reason: 'Query/page rows were unavailable.',
    },
    {
      section: 'quick-win opportunities',
      reason: 'Query/page rows were unavailable.',
    },
  ]
  report.summary.updateAttribution = 'unavailable'
  report.summary.updateAttributionStatus = 'unavailable'

  assert.match(headlineLine(report), /^Partial diagnosis;/)
  assert.match(headlineLine(report), /traffic anomaly analysis unavailable/)
  assert.doesNotMatch(headlineLine(report), /no significant anomaly/)
  assert.match(movementLine(report), /not available/)
  assert.match(topSegmentLine(report), /not available/)
  assert.equal(
    updateAttributionLine(report),
    'Update correlation was not available for this run.',
  )
  const opportunities = contentOpportunityBullets(report).join('\n')
  assert.match(opportunities, /Could not assess/)
  assert.doesNotMatch(opportunities, /No material content opportunity/)
})

test('repeated skip reasons are compact in narrative caveats', () => {
  const report = emptyDiagnosis()
  report.skippedSections = [
    { section: 'traffic anomaly', reason: 'No property was selected.' },
    { section: 'decay analysis', reason: 'No property was selected.' },
  ]

  assert.deepEqual(diagnosisAvailabilityCaveats(report), [
    'Skipped 2 sections: No property was selected.',
  ])
})

test('quick-win-only evidence is visible in the headline, content, and priorities', () => {
  const report = emptyDiagnosis()
  const analysis = analyzeQuickWinsFromRows({
    site: report.site,
    rows: [
      {
        keys: ['technical seo audit', 'https://example.com/audit'],
        clicks: 2,
        impressions: 1_000,
        ctr: 0.002,
        position: 5,
      },
    ],
  })
  assert.equal(analysis.items.length, 1)
  report.quickWins.items = analysis.items
  report.summary.quickWinItems = analysis.items.length

  assert.match(headlineLine(report), /1 quick-win candidate/)
  assert.match(
    contentOpportunityBullets(report).join('\n'),
    /"technical seo audit" on https:\/\/example\.com\/audit/,
  )
  const priorities = buildDiagnosisPriorities({
    anomaly: report.anomaly,
    update: report.updateCorrelation,
    page: report.segments.page,
    decay: report.decay,
    cannibal: report.cannibalization,
    striking: report.strikingDistance,
    quickWins: report.quickWins,
  })
  assert.equal(priorities[0]?.label, 'Review CTR-target opportunity')
  assert.equal(priorities[0]?.action, analysis.items[0]?.recommendation.action)

  const top = report.quickWins.items[0]
  assert.ok(top)
  top.recommendation.confidence = 'high'
  report.quickWins.source.possiblyTruncated = true
  assert.equal(
    buildDiagnosisPriorities({
      anomaly: report.anomaly,
      update: report.updateCorrelation,
      page: report.segments.page,
      decay: report.decay,
      cannibal: report.cannibalization,
      striking: report.strikingDistance,
      quickWins: report.quickWins,
    })[0]?.confidence,
    'low',
  )
})

test('empty segment evidence is not phrased as a conclusive no-movement result', () => {
  const report = emptyDiagnosis()

  assert.match(topSegmentLine(report), /no retained page rows/i)
  assert.ok(
    diagnosisPartialReasons(report).some(
      (reason) => reason.section === 'page movement segments',
    ),
  )
})

test('failed quick-win verification makes diagnosis evidence partial', () => {
  const report = emptyDiagnosis()
  report.quickWins.verification = {
    requested: true,
    limit: 2,
    attemptedRows: 2,
    attemptedUrls: 2,
    verified: 0,
    technical: 0,
    failed: 2,
  }

  const reasons = diagnosisPartialReasons(report)
  assert.ok(
    reasons.some(
      (reason) => reason.section === 'quick-win content verification',
    ),
  )
  assert.match(
    reasons.find(
      (reason) => reason.section === 'quick-win content verification',
    )?.reason ?? '',
    /2 of 2 attempted candidate verifications failed/,
  )
})

test('failed striking-distance verification makes diagnosis evidence partial', () => {
  const report = emptyDiagnosis()
  report.strikingDistance.verification = {
    requested: true,
    limit: 3,
    attempted: 3,
    verified: 1,
    technical: 0,
    failed: 2,
  }

  const reasons = diagnosisPartialReasons(report)
  assert.ok(
    reasons.some(
      (reason) => reason.section === 'striking-distance content verification',
    ),
  )
  assert.match(
    reasons.find(
      (reason) => reason.section === 'striking-distance content verification',
    )?.reason ?? '',
    /2 of 3 attempted candidate verifications failed/,
  )
})

test('partial segment evidence is surfaced and lowers movement confidence', () => {
  const report = emptyDiagnosis()
  report.segments.page = compareSegmentRows({
    site: report.site,
    dimension: 'page',
    before: { startDate: '2026-04-01', endDate: '2026-04-30' },
    after: { startDate: '2026-05-01', endDate: '2026-05-30' },
    beforeRows: [
      {
        keys: ['https://example.com/matched'],
        clicks: 100,
        impressions: 1_000,
        ctr: 0.1,
        position: 4,
      },
      {
        keys: ['https://example.com/before-only'],
        clicks: 20,
        impressions: 200,
        ctr: 0.1,
        position: 5,
      },
    ],
    afterRows: [
      {
        keys: ['https://example.com/matched'],
        clicks: 20,
        impressions: 500,
        ctr: 0.04,
        position: 8,
      },
    ],
  })

  assert.equal(
    diagnosisPartialReasons(report)[0]?.section,
    'page movement segments',
  )
  const priority = buildDiagnosisPriorities({
    anomaly: report.anomaly,
    update: report.updateCorrelation,
    page: report.segments.page,
    decay: report.decay,
    cannibal: report.cannibalization,
    striking: report.strikingDistance,
    quickWins: report.quickWins,
  }).find((item) => item.label === 'Investigate largest page movement')
  assert.equal(priority?.confidence, 'low')
})

test('partial decay evidence downgrades its priority confidence', () => {
  const report = emptyDiagnosis()
  report.decay.dataStatus = 'partial'
  report.decay.selection.eligibleRows = 1

  const priorities = buildDiagnosisPriorities({
    anomaly: report.anomaly,
    update: report.updateCorrelation,
    page: report.segments.page,
    decay: report.decay,
    cannibal: report.cannibalization,
    striking: report.strikingDistance,
    quickWins: report.quickWins,
  })

  assert.equal(priorities[0]?.label, 'Refresh decaying content')
  assert.equal(priorities[0]?.confidence, 'low')
})

test('update overlap without significant movement is context, not a priority', () => {
  const report = emptyDiagnosis()
  report.updateCorrelation.overlappingUpdates = [
    {
      id: 'core-update',
      name: 'Core update',
      type: 'core',
      product: 'Ranking',
      start: '2026-05-01T00:00:00.000Z',
      end: '2026-05-14T00:00:00.000Z',
      status: 'complete',
      sourceUrl: 'https://status.search.google.com/incidents/core-update',
    },
  ]
  report.summary.updateMatches = 1
  report.summary.updateAttribution =
    'update-overlap-without-significant-movement'
  report.summary.classification = 'update-overlap-without-significant-movement'
  report.updateCorrelation.anomalies = [significantClickAnomaly(report.site)]

  assert.match(
    updateAttributionLine(report),
    /overlapped the comparison window, but no significant movement/,
  )
  assert.equal(
    buildDiagnosisPriorities({
      anomaly: report.anomaly,
      update: report.updateCorrelation,
      page: report.segments.page,
      decay: report.decay,
      cannibal: report.cannibalization,
      striking: report.strikingDistance,
      quickWins: report.quickWins,
    }).some(
      (priority) => priority.label === 'Review movement during update overlap',
    ),
    false,
  )
})

test('update action requires both significant movement and an update overlap', () => {
  const report = emptyDiagnosis()
  const anomalies = [significantClickAnomaly(report.site)]
  report.anomaly.anomalies = anomalies
  report.updateCorrelation.anomalies = anomalies
  report.updateCorrelation.overlappingUpdates = [
    {
      id: 'core-update',
      name: 'Core update',
      type: 'core',
      product: 'Ranking',
      start: '2026-05-01T00:00:00.000Z',
      end: '2026-05-14T00:00:00.000Z',
      status: 'complete',
      sourceUrl: 'https://status.search.google.com/incidents/core-update',
    },
  ]
  const priorities = buildDiagnosisPriorities({
    anomaly: report.anomaly,
    update: report.updateCorrelation,
    page: report.segments.page,
    decay: report.decay,
    cannibal: report.cannibalization,
    striking: report.strikingDistance,
    quickWins: report.quickWins,
  })

  assert.equal(priorities.length, 1)
  assert.equal(priorities[0]?.label, 'Review movement during update overlap')
  assert.equal(priorities[0]?.confidence, 'low')
  assert.match(priorities[0]?.reason ?? '', /significant movement comparison/)
  assert.match(updateAttributionLine(report), /significant movement comparison/)
  assert.match(updateAttributionLine(report), /does not establish/)

  report.updateCorrelation.overlappingUpdates = []
  assert.equal(
    buildDiagnosisPriorities({
      anomaly: report.anomaly,
      update: report.updateCorrelation,
      page: report.segments.page,
      decay: report.decay,
      cannibal: report.cannibalization,
      striking: report.strikingDistance,
      quickWins: report.quickWins,
    }).length,
    0,
  )
})
