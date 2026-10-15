import assert from 'node:assert/strict'
import test from 'node:test'
import { keywordMetricsReport } from '../../analyze/keyword-metrics.js'
import type { ProviderCandidate } from '../resolver.js'
import type { SemrushReportRequest, SemrushReportSnapshot } from './client.js'
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
