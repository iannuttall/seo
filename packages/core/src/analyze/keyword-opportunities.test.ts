import assert from 'node:assert/strict'
import test from 'node:test'
import { SeoError } from '../errors.js'
import type {
  KeywordMetric,
  ProviderEvidence,
  ProviderValue,
  SearchMarket,
} from '../providers/contracts.js'
import { observedValue, unavailableValue } from '../providers/contracts.js'
import type { GscRow } from '../types.js'
import type { KeywordMetricsReport } from './keyword-metrics.js'
import {
  type KeywordOpportunitiesDependencies,
  keywordOpportunitiesReport,
} from './keyword-opportunities.js'

const market: SearchMarket = {
  searchEngine: 'google',
  countryCode: 'GB',
  languageCode: 'en',
}

function row(input: {
  query: string
  url: string
  position: number
  impressions: number
  clicks: number
}): GscRow {
  return {
    keys: [input.query, input.url],
    clicks: input.clicks,
    impressions: input.impressions,
    ctr: input.impressions ? input.clicks / input.impressions : 0,
    position: input.position,
  }
}

function missing<T>(field: string): ProviderValue<T> {
  return unavailableValue('missing', `Provider omitted ${field}.`)
}

function metric(
  keyword: string,
  input: Partial<KeywordMetric> = {},
): KeywordMetric {
  return {
    keyword,
    monthlySearchVolume: observedValue(100),
    monthlySearches: missing('monthlySearches'),
    searchVolumeUpdatedAt: missing('searchVolumeUpdatedAt'),
    cpcUsd: observedValue(1.25),
    paidCompetition: observedValue(0.2),
    keywordDifficulty: observedValue(18),
    intent: observedValue('commercial'),
    resultCount: observedValue(100_000),
    ...input,
  }
}

function providerEvidence(
  data: KeywordMetric[],
  completeness: ProviderEvidence<
    KeywordMetric[]
  >['coverage']['completeness'] = 'complete',
): ProviderEvidence<KeywordMetric[]> {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'keyword-metrics',
    data,
    observedAt: '2026-07-21T12:01:00.000Z',
    market,
    coverage: {
      requestedRows: data.length,
      returnedRows: data.length,
      retainedRows: data.length,
      invalidRows: 0,
      providerTotalRows: null,
      completeness,
      nextCursor: null,
    },
    cache: {
      status: 'miss',
      storedAt: null,
      expiresAt: null,
    },
    cost: {
      currency: 'USD',
      estimatedMicros: 10_000,
      actualMicros: 12_000,
      taskIds: ['task-1'],
    },
    request: {
      operation: 'keyword-metrics',
      endpoint: 'keyword-overview',
      limit: 50,
      filters: {},
      sort: ['keyword:codepoint-ascending'],
    },
    warnings: [],
  }
}

function metricsReport(
  data: KeywordMetric[],
  dataStatus: KeywordMetricsReport['dataStatus'] = 'complete',
): KeywordMetricsReport {
  const evidence = providerEvidence(
    data,
    dataStatus === 'complete' ? 'complete' : 'partial',
  )
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-21T12:01:00.000Z',
    dataStatus,
    market,
    summary: {
      requestedKeywords: data.length,
      providerRows: data.length,
      keywordsWithObservedVolume: data.filter(
        (item) => item.monthlySearchVolume.state === 'observed',
      ).length,
      observedZeroVolume: data.filter(
        (item) =>
          item.monthlySearchVolume.state === 'observed' &&
          item.monthlySearchVolume.value === 0,
      ).length,
      missingOrInvalidVolume: data.filter(
        (item) => item.monthlySearchVolume.state !== 'observed',
      ).length,
      increasingTrends: 1,
      decreasingTrends: 0,
      stableTrends: 0,
      unavailableTrends: Math.max(0, data.length - 1),
      verdict: 'Provider metrics are available.',
    },
    evidence,
    analysis: data.map((item, index) => ({
      keyword: item.keyword,
      trend:
        index === 1
          ? {
              state: 'observed' as const,
              direction: 'increasing' as const,
              recentAverage: 200,
              previousAverage: 100,
              absoluteChange: 100,
              percentChange: observedValue(100),
              months: [
                { year: 2026, month: 1 },
                { year: 2026, month: 2 },
                { year: 2026, month: 3 },
                { year: 2026, month: 4 },
                { year: 2026, month: 5 },
                { year: 2026, month: 6 },
              ],
              methodology: 'Test trend.',
            }
          : {
              state: 'unavailable' as const,
              reason: 'No history in this fixture.',
            },
    })),
    findings: [],
    caveats: ['Provider estimates are context only.'],
    nextSteps: ['Inspect the current results.'],
  }
}

function dependencies(
  rows: GscRow[],
  overrides: Partial<KeywordOpportunitiesDependencies> = {},
): KeywordOpportunitiesDependencies {
  return {
    searchAnalytics: async () => ({
      rows,
      calls: 1,
      rowsFetched: rows.length,
    }),
    now: () => new Date('2026-07-21T12:00:00.000Z'),
    ...overrides,
  }
}

test('keyword opportunities reuses one GSC acquisition without paid work by default', async () => {
  const rows = [
    row({
      query: 'technical audit tool',
      url: 'https://example.com/tools/audit/',
      position: 6,
      impressions: 1_000,
      clicks: 5,
    }),
    row({
      query: 'site audit checklist',
      url: 'https://example.com/guides/audit/',
      position: 12,
      impressions: 600,
      clicks: 4,
    }),
  ]
  let searchCalls = 0
  let metricsCalls = 0
  let capturedRequest: unknown
  const report = await keywordOpportunitiesReport(
    { site: 'sc-domain:example.com', keywordLimit: 10 },
    dependencies(rows, {
      searchAnalytics: async (_site, request) => {
        searchCalls += 1
        capturedRequest = request
        return { rows, calls: 1, rowsFetched: rows.length }
      },
      keywordMetrics: async () => {
        metricsCalls += 1
        return metricsReport([])
      },
    }),
  )

  assert.equal(searchCalls, 1)
  assert.equal(metricsCalls, 0)
  assert.deepEqual(capturedRequest, {
    startDate: report.range.startDate,
    endDate: report.range.endDate,
    dimensions: ['query', 'page'],
    type: 'web',
    dataState: 'final',
    maxRows: 100_000,
  })
  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.external.status, 'not-requested')
  assert.equal(report.external.report, null)
  assert.equal(report.summary.quickWinCandidates, 1)
  assert.equal(report.summary.secondPageCandidates, 1)
  assert.equal(report.summary.strikingDistanceCandidates, 1)
  assert.equal(report.summary.availableCandidateKeywords, 2)
  assert.equal(report.combined.length, 2)
  assert.equal('eligibleItems' in report.firstParty.quickWins, false)
  assert.deepEqual(report.firstParty.secondPage.items[0]?.queryCoverage, {
    available: 1,
    returned: 1,
    omitted: 0,
  })
  assert.ok(Buffer.byteLength(JSON.stringify(report)) < 98_304)
})

test('external provider failures do not erase first-party opportunities', async () => {
  const rows = [
    row({
      query: 'technical audit tool',
      url: 'https://example.com/tools/audit/',
      position: 6,
      impressions: 1_000,
      clicks: 5,
    }),
  ]
  const report = await keywordOpportunitiesReport(
    {
      site: 'sc-domain:example.com',
      includeExternal: true,
      market,
    },
    dependencies(rows, {
      keywordMetrics: async () => {
        throw new SeoError(
          'PROVIDER_UNAVAILABLE',
          'No connected provider can supply keyword metrics.',
        )
      },
    }),
  )

  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.summary.returnedCandidateKeywords, 1)
  assert.equal(report.external.status, 'unavailable')
  assert.equal(report.external.error?.code, 'PROVIDER_UNAVAILABLE')
  assert.equal(report.combined[0]?.external, undefined)

  await assert.rejects(
    keywordOpportunitiesReport(
      {
        site: 'sc-domain:example.com',
        includeExternal: true,
        market,
      },
      dependencies(rows, {
        keywordMetrics: async () => {
          throw new Error('Programming error in test adapter.')
        },
      }),
    ),
    /Programming error/,
  )
})

test('missing external estimates stay distinct from observed zero', async () => {
  const rows = [
    row({
      query: 'audit tool zero',
      url: 'https://example.com/tools/zero/',
      position: 6,
      impressions: 900,
      clicks: 1,
    }),
    row({
      query: 'audit tool missing',
      url: 'https://example.com/tools/missing/',
      position: 7,
      impressions: 800,
      clicks: 1,
    }),
  ]
  const report = await keywordOpportunitiesReport(
    {
      site: 'sc-domain:example.com',
      includeExternal: true,
      market,
    },
    dependencies(rows, {
      keywordMetrics: async (input) =>
        metricsReport(
          input.keywords.map((keyword) =>
            metric(keyword, {
              monthlySearchVolume: keyword.includes('zero')
                ? observedValue(0)
                : missing('monthlySearchVolume'),
            }),
          ),
          'partial',
        ),
    }),
  )

  assert.equal(report.external.status, 'partial')
  const zero = report.combined.find((item) => item.keyword.includes('zero'))
  const missingMetric = report.combined.find((item) =>
    item.keyword.includes('missing'),
  )
  assert.equal(zero?.external?.monthlySearchVolume.state, 'observed')
  assert.equal(missingMetric?.external?.monthlySearchVolume.state, 'missing')
  assert.equal(
    report.findings.filter(
      (finding) =>
        finding.code === 'provider-zero-with-first-party-impressions',
    ).length,
    1,
  )
})

test('empty, filtered, and capped first-party states remain distinct', async () => {
  let metricsCalls = 0
  const empty = await keywordOpportunitiesReport(
    {
      site: 'sc-domain:example.com',
      includeExternal: true,
      market,
    },
    dependencies([], {
      keywordMetrics: async () => {
        metricsCalls += 1
        return metricsReport([])
      },
    }),
  )
  assert.equal(empty.dataStatus, 'empty')
  assert.equal(empty.external.status, 'skipped')
  assert.equal(metricsCalls, 0)

  const filteredRows = [
    row({
      query: 'top result',
      url: 'https://example.com/top/',
      position: 1,
      impressions: 100,
      clicks: 50,
    }),
  ]
  const filtered = await keywordOpportunitiesReport(
    { site: 'sc-domain:example.com' },
    dependencies(filteredRows),
  )
  assert.equal(filtered.dataStatus, 'filtered')

  const cappedRows = [
    row({
      query: 'technical audit tool',
      url: 'https://example.com/tools/audit/',
      position: 6,
      impressions: 1_000,
      clicks: 5,
    }),
  ]
  const capped = await keywordOpportunitiesReport(
    { site: 'sc-domain:example.com' },
    dependencies(cappedRows, {
      searchAnalytics: async () => ({
        rows: cappedRows,
        calls: 4,
        rowsFetched: 100_000,
      }),
    }),
  )
  assert.equal(capped.dataStatus, 'partial')
  assert.equal(capped.firstParty.possiblyTruncated, true)
})

test('large retained inputs keep one acquisition and bounded provider and output work', async () => {
  const rows = Array.from({ length: 10_000 }, (_, index) =>
    row({
      query: `audit tool ${String(index).padStart(5, '0')}`,
      url: `https://example.com/tools/${index}/`,
      position: 6 + (index % 4),
      impressions: 500 + (index % 100),
      clicks: index % 3,
    }),
  )
  let searchCalls = 0
  let requestedKeywords = 0
  const report = await keywordOpportunitiesReport(
    {
      site: 'sc-domain:example.com',
      includeExternal: true,
      market,
      limit: 25,
      keywordLimit: 50,
    },
    dependencies(rows, {
      searchAnalytics: async () => {
        searchCalls += 1
        return { rows, calls: 1, rowsFetched: rows.length }
      },
      keywordMetrics: async (input) => {
        requestedKeywords = input.keywords.length
        return metricsReport(input.keywords.map((keyword) => metric(keyword)))
      },
    }),
  )

  assert.equal(searchCalls, 1)
  assert.ok(requestedKeywords <= 50)
  assert.ok(report.firstParty.quickWins.items.length <= 25)
  assert.ok(report.firstParty.secondPage.items.length <= 25)
  assert.ok(report.firstParty.strikingDistance.items.length <= 25)
  assert.ok(report.firstParty.strikingDistance.groups.length <= 10)
  assert.ok(report.combined.length <= 50)
  assert.ok(report.candidateClusters.length <= 20)
  assert.ok(report.programmaticPatterns.length <= 5)
  assert.ok(report.findings.length <= 10)
  assert.ok(report.dataSourcePrompts.length <= 3)
  assert.ok(Buffer.byteLength(JSON.stringify(report)) < 98_304)
})
