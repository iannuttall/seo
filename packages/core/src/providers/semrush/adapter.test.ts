import assert from 'node:assert/strict'
import test from 'node:test'
import { keywordMetricsReport } from '../../analyze/keyword-metrics.js'
import type { ProviderCandidate } from '../resolver.js'
import type { SemrushReportRequest, SemrushReportSnapshot } from './client.js'
import { SemrushDomainResearchProvider } from './domain-research.js'
import { SemrushKeywordDiscoveryProvider } from './keyword-discovery.js'
import { SemrushKeywordMetricsProvider } from './keyword-metrics.js'

const market = {
  searchEngine: 'google' as const,
  countryCode: 'GB',
  languageCode: 'en',
}

function snapshot(
  input: SemrushReportRequest,
  rows: string[][],
): SemrushReportSnapshot {
  return {
    table: { headers: [...input.columns], rows },
    observedAt: '2026-07-24T12:00:00.000Z',
    returnedRows: rows.length,
    cache: {
      status: 'miss',
      storedAt: '2026-07-24T12:00:00.000Z',
      expiresAt: '2026-07-31T12:00:00.000Z',
    },
    cost: {
      currency: 'USD',
      estimatedMicros: null,
      actualMicros: null,
      taskIds: [],
      native: {
        unit: 'api-unit',
        estimatedUnits: input.maximumResponseRows * input.unitsPerLine,
        actualUnits: rows.length * input.unitsPerLine,
        remainingBefore: 10_000,
      },
    },
    warnings: [],
  }
}

test('Semrush keyword metrics preserve zero, omissions, and deterministic order', async () => {
  const requests: SemrushReportRequest[] = []
  const provider = new SemrushKeywordMetricsProvider({
    client: {
      report: async (input) => {
        requests.push(input)
        return snapshot(input, [['zero keyword', '0', '0', '0', '0', '0', '0']])
      },
    },
  })
  const result = await provider.keywordMetrics({
    keywords: ['Missing Keyword', 'zero keyword', 'Zero  Keyword'],
    market,
  })

  assert.equal(requests[0]?.parameters.database, 'uk')
  assert.equal(requests[0]?.parameters.phrase, 'missing keyword;zero keyword')
  assert.deepEqual(
    result.data.map((row) => row.keyword),
    ['missing keyword', 'zero keyword'],
  )
  assert.equal(result.data[0]?.monthlySearchVolume.state, 'missing')
  assert.deepEqual(result.data[1]?.monthlySearchVolume, {
    state: 'observed',
    value: 0,
  })
  assert.equal(result.coverage.completeness, 'partial')
  assert.ok(
    result.warnings.some(
      (warning) => warning.code === 'semrush-v3-keyword-api-deprecated',
    ),
  )
})

test('Semrush runs through the provider-neutral keyword metrics report', async () => {
  const provider = new SemrushKeywordMetricsProvider({
    client: {
      report: async (input) =>
        snapshot(input, [
          ['alpha', '100', '1.5', '0.4', '5000', '1', '25'],
          ['beta', '0', '0', '0', '0', '0', '0'],
        ]),
    },
  })
  const candidates: ProviderCandidate[] = [
    { adapter: provider, connected: true, priority: 1 },
  ]
  const report = await keywordMetricsReport(
    {
      keywords: ['beta', 'alpha'],
      market,
      provider: 'semrush',
    },
    {
      candidates,
      now: () => new Date('2026-07-24T13:00:00.000Z'),
    },
  )

  assert.equal(report.generatedAt, '2026-07-24T13:00:00.000Z')
  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.evidence.provider, 'semrush')
  assert.deepEqual(report.summary, {
    requestedKeywords: 2,
    providerRows: 2,
    keywordsWithObservedVolume: 2,
    observedZeroVolume: 1,
    missingOrInvalidVolume: 0,
    increasingTrends: 0,
    decreasingTrends: 0,
    stableTrends: 0,
    unavailableTrends: 2,
    verdict:
      'Observed search-volume estimates are available for 2 of 2 keywords; 0 show an increasing recent trend.',
  })
  assert.deepEqual(
    report.evidence.data.map((row) => row.keyword),
    ['alpha', 'beta'],
  )
})

test('Semrush discovery keeps exact seed/source provenance and bounded calls', async () => {
  const requests: SemrushReportRequest[] = []
  const provider = new SemrushKeywordDiscoveryProvider({
    client: {
      report: async (input) => {
        requests.push(input)
        return snapshot(input, [
          [
            input.parameters.phrase === 'alpha' ? 'shared' : 'other',
            '10',
            '1',
            '0.5',
            '100',
            '20',
          ],
        ])
      },
    },
  })
  const result = await provider.discoverKeywords({
    seeds: ['beta', 'alpha'],
    sources: ['related', 'ideas'],
    market,
    limit: 8,
  })

  assert.equal(requests.length, 4)
  assert.ok(requests.every((request) => request.maximumResponseRows === 2))
  assert.deepEqual(
    result.data.map((row) => row.keyword),
    ['other', 'shared'],
  )
  assert.equal(result.data[0]?.sources.length, 2)
  assert.equal(result.data[1]?.sources.length, 2)
  assert.equal(result.request.filters.providerRequests, 4)
})

test('Semrush domain reports map only compatible provider-native fields', async () => {
  const provider = new SemrushDomainResearchProvider({
    client: {
      report: async (input) => {
        if (input.reportType === 'domain_rank') {
          return snapshot(input, [['example.com', '5', '100', '250']])
        }
        if (input.reportType === 'domain_organic') {
          return snapshot(input, [
            [
              'zero keyword',
              '1',
              '0',
              '0',
              '0',
              '0',
              '0',
              '0',
              'https://example.com/zero',
              '1721822400',
            ],
          ])
        }
        if (input.reportType === 'domain_organic_unique') {
          return snapshot(input, [
            ['https://example.com/page', '3', '40', '25'],
          ])
        }
        const keyword = String(input.parameters.phrase)
        return snapshot(
          input,
          keyword === 'first'
            ? [
                ['1', 'example.com', 'https://example.com/a'],
                ['2', 'other.com', 'https://other.com/a'],
              ]
            : [
                ['3', 'example.com', 'https://example.com/b'],
                ['1', 'third.com', 'https://third.com/b'],
              ],
        )
      },
    },
  })

  const overview = await provider.domainOverview({
    domain: 'example.com',
    market,
  })
  assert.deepEqual(overview.data.organic.rankedKeywords, {
    state: 'observed',
    value: 5,
  })
  assert.deepEqual(overview.data.organic.estimatedMonthlyTraffic, {
    state: 'observed',
    value: 100,
  })
  assert.equal(overview.data.organic.rankings.state, 'unavailable')

  const ranked = await provider.rankedKeywords({
    target: 'example.com',
    market,
    includeSubdomains: true,
    resultTypes: ['organic'],
    limit: 10,
  })
  assert.deepEqual(ranked.data.rows[0]?.monthlySearchVolume, {
    state: 'observed',
    value: 0,
  })
  assert.equal(
    ranked.data.rows[0]?.estimatedMonthlyTraffic.state,
    'unavailable',
  )

  const pages = await provider.rankingPages({
    domain: 'example.com',
    market,
    limit: 10,
  })
  assert.deepEqual(pages.data.rows[0]?.organic.estimatedMonthlyTraffic, {
    state: 'observed',
    value: 40,
  })
  assert.equal(
    pages.data.rows[0]?.organic.estimatedMonthlyTrafficCostUsd.state,
    'unavailable',
  )

  const competitors = await provider.serpCompetitors({
    keywords: ['second', 'first'],
    market,
    includeSubdomains: false,
    resultTypes: ['organic'],
    limit: 10,
  })
  assert.equal(competitors.data.rows[0]?.domain, 'example.com')
  assert.equal(competitors.data.rows[0]?.matchedKeywords, 2)
  assert.deepEqual(competitors.data.rows[0]?.averagePosition, {
    state: 'observed',
    value: 2,
  })
  assert.equal(competitors.data.rows[0]?.visibility.state, 'unavailable')
})

test('Semrush competitor acquisition is capped at 20 calls and 2000 rows', async () => {
  let calls = 0
  let acquiredRows = 0
  const provider = new SemrushDomainResearchProvider({
    client: {
      report: async (input) => {
        calls += 1
        assert.equal(input.maximumResponseRows, 100)
        const rows = Array.from({ length: 100 }, (_, index) => [
          String(index + 1),
          `domain-${index}.example`,
          `https://domain-${index}.example/page`,
        ])
        acquiredRows += rows.length
        return snapshot(input, rows)
      },
    },
  })
  const result = await provider.serpCompetitors({
    keywords: Array.from({ length: 20 }, (_, index) => `keyword ${index}`),
    market,
    includeSubdomains: false,
    resultTypes: ['organic'],
    limit: 100,
  })

  assert.equal(calls, 20)
  assert.equal(acquiredRows, 2_000)
  assert.equal(result.data.rows.length, 100)
  assert.equal(result.coverage.completeness, 'capped')
  assert.ok(JSON.stringify(result).length < 500_000)
})
