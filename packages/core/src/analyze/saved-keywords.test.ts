import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  KeywordSetDetail,
  SavedKeywordMetric,
} from '../keyword-sets/index.js'
import {
  type KeywordMonthlySearch,
  observedValue,
  unavailableValue,
} from '../providers/contracts.js'
import { savedKeywordSetReport } from './saved-keywords.js'

const NOW = new Date('2026-07-21T12:00:00.000Z')

function metric(
  keyword: string,
  volume: number,
  observedAt: string,
): SavedKeywordMetric {
  return {
    schemaVersion: 1 as const,
    provider: 'dataforseo' as const,
    observedAt,
    metric: {
      keyword,
      monthlySearchVolume: observedValue(volume),
      monthlySearches: unavailableValue<KeywordMonthlySearch[]>(
        'unavailable',
        'Not returned by the fixture.',
      ),
      searchVolumeUpdatedAt: observedValue('2026-07-01'),
      cpcUsd: unavailableValue<number>(
        'unavailable',
        'Not returned by the fixture.',
      ),
      paidCompetition: unavailableValue<number>(
        'unavailable',
        'Not returned by the fixture.',
      ),
      keywordDifficulty: unavailableValue<number>(
        'unavailable',
        'Not returned by the fixture.',
      ),
      intent: unavailableValue<string>(
        'unavailable',
        'Not returned by the fixture.',
      ),
      resultCount: unavailableValue<number>(
        'unavailable',
        'Not returned by the fixture.',
      ),
    },
  }
}

function metricWithoutVolume(
  keyword: string,
  observedAt: string,
): SavedKeywordMetric {
  const saved = metric(keyword, 1, observedAt)
  return {
    ...saved,
    metric: {
      ...saved.metric,
      monthlySearchVolume: unavailableValue<number>(
        'missing',
        'The provider omitted this keyword.',
      ),
    },
  }
}

function detail(overrides: Partial<KeywordSetDetail> = {}): KeywordSetDetail {
  return {
    schemaVersion: 1,
    set: {
      schemaVersion: 1,
      id: 'set-one',
      projectId: 'example-project',
      name: 'Service research',
      market: {
        searchEngine: 'google',
        countryCode: 'GB',
        languageCode: 'en',
        location: { name: 'United Kingdom' },
      },
      provider: 'dataforseo',
      sourceReport: 'keyword-research',
      keywordCount: 4,
      tagCount: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      lastRefreshedAt: '2026-07-01T00:00:00.000Z',
    },
    items: [
      {
        keyword: 'Zulu service',
        normalizedKeyword: 'zulu service',
        tags: ['service', 'priority'],
        page: { kind: 'target', url: 'https://example.test/zulu' },
        latestMetric: metric('Zulu service', 0, '2026-04-01T00:00:00.000Z'),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        keyword: 'Alpha service',
        normalizedKeyword: 'alpha service',
        tags: ['service'],
        page: { kind: 'proposed', url: 'https://example.test/alpha' },
        latestMetric: metric('Alpha service', 200, '2026-07-15T00:00:00.000Z'),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
      {
        keyword: 'Middle service',
        normalizedKeyword: 'middle service',
        tags: ['priority'],
        page: null,
        latestMetric: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        keyword: 'Missing volume service',
        normalizedKeyword: 'missing volume service',
        tags: [],
        page: null,
        latestMetric: metricWithoutVolume(
          'Missing volume service',
          '2026-07-15T00:00:00.000Z',
        ),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
    ],
    pagination: {
      offset: 0,
      limit: 100,
      returned: 4,
      total: 4,
      nextOffset: null,
    },
    filter: { tag: null },
    ...overrides,
  }
}

test('reports saved evidence without confusing missing and observed zero values', () => {
  const report = savedKeywordSetReport(
    { projectId: 'example-project', idOrName: 'set-one', staleDays: 45 },
    { getKeywordSet: () => detail(), now: () => NOW },
  )

  assert.equal(report.dataStatus, 'complete')
  assert.deepEqual(report.summary, {
    name: 'Service research',
    totalKeywords: 4,
    matchedKeywords: 4,
    returnedKeywords: 4,
    metricSnapshots: 3,
    observedVolumes: 2,
    observedZeroVolumes: 1,
    unavailableVolumeSnapshots: 1,
    staleMetricSnapshots: 1,
    mappedKeywords: 2,
    targetPages: 1,
    proposedPages: 1,
    distinctTags: 2,
    verdict:
      '4 saved keywords were returned; search volume is observed for 2, unavailable in 1 saved snapshot, and 2 have page mappings.',
  })
  assert.deepEqual(report.analysis.tagGroups, [
    { tag: 'priority', keywordCount: 2 },
    { tag: 'service', keywordCount: 2 },
  ])
  assert.deepEqual(report.analysis.pageMappings, [
    {
      url: 'https://example.test/alpha',
      kind: 'proposed',
      keywordCount: 1,
    },
    {
      url: 'https://example.test/zulu',
      kind: 'target',
      keywordCount: 1,
    },
  ])
  assert.deepEqual(
    report.findings.map((finding) => finding.code),
    [
      'missing-metrics',
      'unavailable-volume-evidence',
      'stale-metrics',
      'unmapped-keywords',
    ],
  )
  assert.match(
    report.caveats[1] ?? '',
    /missing evidence differs from an observed zero/i,
  )
})

test('keeps filtered or paginated views partial', () => {
  const full = detail()
  const filtered = detail({
    items: full.items.slice(0, 1),
    pagination: {
      offset: 0,
      limit: 1,
      returned: 1,
      total: 2,
      nextOffset: 1,
    },
    filter: { tag: 'service' },
  })
  const report = savedKeywordSetReport(
    {
      projectId: 'example-project',
      idOrName: 'set-one',
      tag: 'service',
      limit: 1,
    },
    { getKeywordSet: () => filtered, now: () => NOW },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.summary.totalKeywords, 4)
  assert.equal(report.summary.matchedKeywords, 2)
  assert.equal(report.summary.returnedKeywords, 1)
  assert.ok(
    report.caveats.some((caveat) =>
      /cannot support a complete-set all-clear/i.test(caveat),
    ),
  )
})

test('rejects unbounded freshness windows before reading storage', () => {
  let reads = 0
  assert.throws(
    () =>
      savedKeywordSetReport(
        {
          projectId: 'example-project',
          idOrName: 'set-one',
          staleDays: 366,
        },
        {
          getKeywordSet: () => {
            reads += 1
            return detail()
          },
        },
      ),
    /from 1 to 365 days/i,
  )
  assert.equal(reads, 0)
})
