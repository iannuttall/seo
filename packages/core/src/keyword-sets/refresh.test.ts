import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  KeywordMetric,
  KeywordMetricsCostEstimate,
  KeywordMetricsRequest,
  ProviderEvidence,
} from '../providers/contracts.js'
import { observedValue, unavailableValue } from '../providers/contracts.js'
import type { ProviderCandidate } from '../providers/resolver.js'
import Database from '../storage/sqlite.js'
import { addKeywordsToSet } from './mutations.js'
import { refreshKeywordSet } from './refresh.js'
import { KEYWORD_SET_SCHEMA_SQL } from './schema.js'
import { createKeywordSet, getKeywordSet } from './store.js'

const MARKET = {
  searchEngine: 'google' as const,
  countryCode: 'GB',
  languageCode: 'en',
  location: { name: 'United Kingdom' },
}

function database(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(KEYWORD_SET_SCHEMA_SQL)
  return db
}

function metric(keyword: string): KeywordMetric {
  const unavailable = () =>
    unavailableValue<number>('unavailable', 'Not returned by the fixture.')
  return {
    keyword,
    monthlySearchVolume: observedValue(100),
    monthlySearches: unavailableValue(
      'unavailable',
      'Not returned by the fixture.',
    ),
    searchVolumeUpdatedAt: unavailableValue(
      'unavailable',
      'Not returned by the fixture.',
    ),
    cpcUsd: unavailable(),
    paidCompetition: unavailable(),
    keywordDifficulty: unavailable(),
    intent: unavailableValue('unavailable', 'Not returned by the fixture.'),
    resultCount: unavailable(),
  }
}

function candidate(
  options: {
    failBatch?: number
    retainedRows?: number
    countryOnly?: boolean
  } = {},
) {
  let paidCalls = 0
  let estimateCalls = 0
  const adapter = {
    provider: 'dataforseo' as const,
    capabilitySupport: [
      {
        capability: 'keyword-metrics' as const,
        status: 'available' as const,
        markets: options.countryOnly
          ? ([
              {
                searchEngines: ['google'] as const,
                location: 'country-only' as const,
              },
            ] as const)
          : ('all' as const),
      },
    ],
    async estimateKeywordMetricsCost(input: {
      requestedRows: number
    }): Promise<KeywordMetricsCostEstimate> {
      estimateCalls += 1
      return {
        schemaVersion: 1,
        provider: 'dataforseo',
        capability: 'keyword-metrics',
        currency: 'USD',
        requestedRows: input.requestedRows,
        requestCount: Math.ceil(input.requestedRows / 50),
        estimatedMicros: input.requestedRows * 200,
        observedAt: '2026-07-21T09:00:00.000Z',
        completeness: 'complete',
        basis: 'Fixture pricing.',
      }
    },
    async keywordMetrics(
      input: KeywordMetricsRequest,
    ): Promise<ProviderEvidence<KeywordMetric[]>> {
      paidCalls += 1
      if (paidCalls === options.failBatch)
        throw new Error('Fixture batch failed.')
      const data = input.keywords
        .slice(0, options.retainedRows ?? input.keywords.length)
        .map(metric)
      return {
        schemaVersion: 1,
        provider: 'dataforseo',
        capability: 'keyword-metrics',
        data,
        observedAt: '2026-07-21T10:00:00.000Z',
        market: input.market,
        coverage: {
          requestedRows: input.keywords.length,
          returnedRows: data.length,
          retainedRows: data.length,
          invalidRows: 0,
          providerTotalRows: input.keywords.length,
          completeness:
            data.length === input.keywords.length ? 'complete' : 'partial',
          nextCursor: null,
        },
        cache: { status: 'bypass', storedAt: null, expiresAt: null },
        cost: {
          currency: 'USD',
          estimatedMicros: 100,
          actualMicros: 100,
          taskIds: [`task-${paidCalls}`],
        },
        request: {
          operation: 'keyword-metrics',
          endpoint: 'fixture',
          limit: input.keywords.length,
          filters: {},
          sort: [],
        },
        warnings: [],
      }
    },
  }
  return {
    provider: {
      adapter,
      connected: true,
      priority: 1,
    } satisfies ProviderCandidate,
    calls: () => ({ paidCalls, estimateCalls }),
  }
}

function savedSet(db: Database.Database, count: number): void {
  createKeywordSet(
    {
      projectId: 'example-project',
      name: 'Priority',
      market: MARKET,
      provider: 'dataforseo',
    },
    { database: db, id: () => 'set-one' },
  )
  addKeywordsToSet(
    {
      projectId: 'example-project',
      idOrName: 'set-one',
      items: Array.from({ length: count }, (_, index) => ({
        keyword: `keyword ${String(index).padStart(3, '0')}`,
      })),
    },
    { database: db },
  )
}

test('refresh preview estimates cost without starting paid work', async () => {
  const db = database()
  savedSet(db, 60)
  const fixture = candidate()
  const report = await refreshKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one' },
    {
      candidates: [fixture.provider],
      store: { database: db },
      now: () => new Date('2026-07-21T11:00:00.000Z'),
    },
  )
  assert.equal(report.mode, 'preview')
  assert.equal(report.cost.requestCount, 2)
  assert.equal(report.cost.estimatedMicros, 12_000)
  assert.deepEqual(fixture.calls(), { paidCalls: 0, estimateCalls: 1 })
  assert.equal(
    getKeywordSet(
      { projectId: 'example-project', idOrName: 'set-one' },
      { database: db },
    ).set.lastRefreshedAt,
    null,
  )
})

test('refresh rejects an unsupported saved market before pricing or paid work', async () => {
  const db = database()
  savedSet(db, 10)
  const fixture = candidate({ countryOnly: true })

  await assert.rejects(
    refreshKeywordSet(
      { projectId: 'example-project', idOrName: 'set-one' },
      { candidates: [fixture.provider], store: { database: db } },
    ),
    /country-level saved set.*without --location/i,
  )
  assert.deepEqual(fixture.calls(), { paidCalls: 0, estimateCalls: 0 })
})

test('executed refresh batches work and records a complete refresh', async () => {
  const db = database()
  savedSet(db, 60)
  const fixture = candidate()
  const report = await refreshKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one', execute: true },
    {
      candidates: [fixture.provider],
      store: { database: db },
      now: () => new Date('2026-07-21T11:00:00.000Z'),
    },
  )
  assert.equal(report.dataStatus, 'complete')
  assert.deepEqual(report.execution, {
    attemptedBatches: 2,
    completeBatches: 2,
    partialBatches: 0,
    failedBatches: 0,
    savedSnapshots: 60,
    actualMicros: 200,
    warnings: [],
    errors: [],
  })
  assert.deepEqual(fixture.calls(), { paidCalls: 2, estimateCalls: 1 })
  const detail = getKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one', limit: 100 },
    { database: db },
  )
  assert.equal(detail.set.lastRefreshedAt, '2026-07-21T11:00:00.000Z')
  assert.equal(detail.items.filter((item) => item.latestMetric).length, 60)
})

test('refresh offset reaches later bounded segments without marking the full set refreshed', async () => {
  const db = database()
  savedSet(db, 60)
  const fixture = candidate()
  const report = await refreshKeywordSet(
    {
      projectId: 'example-project',
      idOrName: 'set-one',
      limit: 10,
      offset: 50,
      execute: true,
    },
    {
      candidates: [fixture.provider],
      store: { database: db },
      now: () => new Date('2026-07-21T11:00:00.000Z'),
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.deepEqual(report.selection, {
    offset: 50,
    limit: 10,
    selectedKeywords: 10,
    nextOffset: null,
    completeness: 'capped',
  })
  assert.equal(report.execution?.savedSnapshots, 10)
  const detail = getKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one', limit: 100 },
    { database: db },
  )
  assert.equal(detail.set.lastRefreshedAt, null)
  assert.deepEqual(
    detail.items
      .map((item, index) => ({ index, hasMetric: Boolean(item.latestMetric) }))
      .filter((item) => item.hasMetric)
      .map((item) => item.index),
    [50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
  )
})

test('a failed batch retains completed evidence without marking a full refresh', async () => {
  const db = database()
  savedSet(db, 60)
  const fixture = candidate({ failBatch: 2 })
  const report = await refreshKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one', execute: true },
    {
      candidates: [fixture.provider],
      store: { database: db },
      now: () => new Date('2026-07-21T11:00:00.000Z'),
    },
  )
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.execution?.savedSnapshots, 50)
  assert.equal(report.execution?.completeBatches, 1)
  assert.equal(report.execution?.partialBatches, 0)
  assert.equal(report.execution?.failedBatches, 1)
  const detail = getKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one', limit: 100 },
    { database: db },
  )
  assert.equal(detail.set.lastRefreshedAt, null)
  assert.equal(detail.items.filter((item) => item.latestMetric).length, 50)
})

test('an incomplete provider batch is retained but never marks a full refresh', async () => {
  const db = database()
  savedSet(db, 10)
  const fixture = candidate({ retainedRows: 9 })
  const report = await refreshKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one', execute: true },
    {
      candidates: [fixture.provider],
      store: { database: db },
      now: () => new Date('2026-07-21T11:00:00.000Z'),
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.execution?.savedSnapshots, 9)
  assert.equal(report.execution?.completeBatches, 0)
  assert.equal(report.execution?.partialBatches, 1)
  assert.equal(report.execution?.failedBatches, 0)
  assert.match(
    report.execution?.warnings[0]?.message ?? '',
    /9 typed snapshots for 10/i,
  )
  const detail = getKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one' },
    { database: db },
  )
  assert.equal(detail.set.lastRefreshedAt, null)
  assert.equal(detail.items.filter((item) => item.latestMetric).length, 9)
})

test('a partial provider batch does not prevent later batches from running', async () => {
  const db = database()
  savedSet(db, 60)
  let paidCalls = 0
  const fixture = candidate()
  const adapter = fixture.provider.adapter
  const originalKeywordMetrics = adapter.keywordMetrics.bind(adapter)
  adapter.keywordMetrics = async (input) => {
    paidCalls += 1
    const evidence = await originalKeywordMetrics(input)
    return paidCalls === 1
      ? {
          ...evidence,
          coverage: { ...evidence.coverage, completeness: 'partial' as const },
        }
      : evidence
  }

  const report = await refreshKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one', execute: true },
    {
      candidates: [fixture.provider],
      store: { database: db },
      now: () => new Date('2026-07-21T11:00:00.000Z'),
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.deepEqual(report.execution, {
    attemptedBatches: 2,
    completeBatches: 1,
    partialBatches: 1,
    failedBatches: 0,
    savedSnapshots: 60,
    actualMicros: 200,
    warnings: [
      {
        batch: 1,
        message: 'Batch returned partial provider coverage for 50 keywords.',
      },
    ],
    errors: [],
  })
  assert.equal(fixture.calls().paidCalls, 2)
  const detail = getKeywordSet(
    { projectId: 'example-project', idOrName: 'set-one', limit: 100 },
    { database: db },
  )
  assert.equal(detail.set.lastRefreshedAt, null)
  assert.equal(detail.items.filter((item) => item.latestMetric).length, 60)
})
