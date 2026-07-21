import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ProviderCapability,
  ProviderEvidence,
  SearchMarket,
} from '../providers/contracts.js'
import { observedValue, unavailableValue } from '../providers/contracts.js'
import type {
  DomainOverview,
  DomainOverviewRequest,
  DomainResearchProvider,
  RankedKeyword,
  RankedKeywordPage,
  RankedKeywordsRequest,
  RankingPagePage,
  RankingPagesRequest,
  SerpCompetitorSet,
  SerpCompetitorsRequest,
} from '../providers/domain-contracts.js'
import type { ProviderCandidate } from '../providers/resolver.js'
import type { GscRow } from '../types.js'
import {
  competitorKeywordGapReport,
  domainOverviewReport,
  rankedKeywordsReport,
  rankingPagesReport,
  serpCompetitorsReport,
} from './domain-research.js'

const market: SearchMarket = {
  searchEngine: 'google',
  countryCode: 'GB',
  languageCode: 'en',
}

const missing = (field: string) =>
  unavailableValue<number>('missing', `Provider omitted ${field}.`)

function metric(keyword: string, url: string, rank = 5): RankedKeyword {
  return {
    keyword,
    url,
    rankGroup: rank,
    rankAbsolute: rank,
    resultType: 'organic',
    monthlySearchVolume: observedValue(100),
    monthlySearches: unavailableValue('missing', 'No history.'),
    searchVolumeUpdatedAt: unavailableValue('missing', 'No date.'),
    cpcUsd: observedValue(1),
    paidCompetition: observedValue(0.2),
    keywordDifficulty: observedValue(15),
    intent: observedValue('commercial'),
    resultCount: missing('resultCount'),
    estimatedMonthlyTraffic: observedValue(10),
  }
}

function footprint(count: number, traffic = 100): DomainOverview['organic'] {
  return {
    estimatedMonthlyTraffic: observedValue(traffic),
    rankedKeywords: observedValue(count),
    estimatedMonthlyTrafficCostUsd: observedValue(200),
    rankings: observedValue({
      first: 1,
      top3: 2,
      top10: 3,
      top20: 4,
      top50: 5,
      top100: count,
    }),
    newRankings: observedValue(1),
    improvedRankings: observedValue(2),
    declinedRankings: observedValue(0),
    lostRankings: observedValue(0),
  }
}

function evidence<T>(
  capability: ProviderCapability,
  data: T,
  completeness: ProviderEvidence<T>['coverage']['completeness'] = 'complete',
): ProviderEvidence<T> {
  const rows = Array.isArray((data as { rows?: unknown[] }).rows)
    ? ((data as { rows: unknown[] }).rows.length ?? 0)
    : 1
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability,
    data,
    observedAt: '2026-07-20T10:00:00.000Z',
    market,
    coverage: {
      requestedRows: rows,
      returnedRows: rows,
      retainedRows: rows,
      invalidRows: 0,
      providerTotalRows: rows,
      completeness,
      nextCursor: null,
    },
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 12_000,
      actualMicros: 12_000,
      taskIds: ['safe-fixture-task'],
    },
    request: {
      operation: capability,
      endpoint: `fixture/${capability}`,
      limit: rows,
      filters: {},
      sort: [],
    },
    warnings: [],
  }
}

function candidate(
  overrides: Partial<DomainResearchProvider> = {},
): ProviderCandidate {
  const adapter: DomainResearchProvider = {
    provider: 'dataforseo',
    capabilitySupport: [
      'domain-overview',
      'ranked-keywords',
      'relevant-pages',
      'serp-competitors',
    ].map((capability) => ({
      capability: capability as ProviderCapability,
      status: 'available' as const,
      markets: [{ searchEngines: ['google'], location: 'country-only' }],
    })),
    domainOverview: async (input: DomainOverviewRequest) =>
      evidence('domain-overview', {
        domain: input.domain,
        organic: footprint(10),
      }),
    rankedKeywords: async (input: RankedKeywordsRequest) =>
      evidence('ranked-keywords', {
        target: input.target,
        rows: [],
        totalRows: 0,
      }),
    rankingPages: async (input: RankingPagesRequest) =>
      evidence('relevant-pages', {
        domain: input.domain,
        rows: [],
        totalRows: 0,
      }),
    serpCompetitors: async (input: SerpCompetitorsRequest) =>
      evidence('serp-competitors', {
        keywords: input.keywords,
        rows: [],
        totalRows: 0,
      }),
    ...overrides,
  }
  return { adapter, connected: true, priority: 1 }
}

function gscRow(
  query: string,
  url: string,
  impressions = 100,
  clicks = 5,
): GscRow {
  return {
    keys: [query, url],
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: 7,
  }
}

const now = () => new Date('2026-07-21T12:00:00.000Z')

test('domain overview keeps independent estimates beside first-party totals', async () => {
  const report = await domainOverviewReport(
    {
      domain: 'example.com',
      site: 'sc-domain:example.com',
      market,
    },
    {
      candidates: [candidate()],
      now,
      searchAnalytics: async () => ({
        rows: [gscRow('', '', 500, 25)],
        calls: 1,
        rowsFetched: 1,
      }),
    },
  )

  assert.equal(report.summary.estimatedMonthlyTraffic, 100)
  assert.equal(report.summary.searchConsoleClicks, 25)
  assert.ok(report.findings.some((item) => item.code.includes('context')))
  assert.equal(Object.hasOwn(report.summary, 'estimatedToObservedRatio'), false)
})

test('ranked keywords labels GSC absence and preserves a provider-zero conflict', async () => {
  const rows = [
    metric('observed term', 'https://example.com/observed'),
    metric('provider only', 'https://example.com/provider'),
  ]
  const observedRow = rows.at(0)
  assert.ok(observedRow)
  rows[0] = {
    ...observedRow,
    monthlySearchVolume: observedValue(0),
  }
  const report = await rankedKeywordsReport(
    {
      target: 'example.com',
      site: 'sc-domain:example.com',
      market,
    },
    {
      candidates: [
        candidate({
          rankedKeywords: async () =>
            evidence('ranked-keywords', {
              target: 'example.com',
              rows,
              totalRows: 2,
            }),
        }),
      ],
      now,
      searchAnalytics: async () => ({
        rows: [gscRow('Observed Term', 'https://example.com/observed')],
        calls: 1,
        rowsFetched: 1,
      }),
    },
  )

  assert.deepEqual(
    report.firstParty.matches.map((item) => item.status),
    ['observed', 'not-in-retained-rows'],
  )
  assert.deepEqual(
    report.findings.map((item) => item.code),
    ['provider-zero-with-first-party-evidence', 'provider-only-keyword'],
  )
})

test('ranked keywords keeps capped first-party zero rows partial', async () => {
  const report = await rankedKeywordsReport(
    {
      target: 'example.com',
      site: 'sc-domain:example.com',
      market,
    },
    {
      candidates: [candidate()],
      now,
      searchAnalytics: async () => ({
        rows: [],
        calls: 20,
        rowsFetched: 100_000,
      }),
    },
  )

  assert.equal(report.evidence.data.rows.length, 0)
  assert.equal(report.firstParty.status, 'partial')
  assert.equal(report.dataStatus, 'partial')
})

test('ranking pages combines matching GSC pages with structural pSEO evidence', async () => {
  const pages: RankingPagePage = {
    domain: 'example.com',
    rows: ['london', 'manchester', 'bristol'].map((place) => ({
      url: `https://example.com/locations/${place}`,
      organic: footprint(4),
    })),
    totalRows: 3,
  }
  const firstPage = pages.rows.at(0)
  assert.ok(firstPage)
  const report = await rankingPagesReport(
    { domain: 'example.com', site: 'sc-domain:example.com', market },
    {
      candidates: [
        candidate({
          rankingPages: async () => evidence('relevant-pages', pages),
        }),
      ],
      now,
      searchAnalytics: async () => ({
        rows: [
          {
            ...gscRow('', firstPage.url),
            keys: [firstPage.url],
          },
        ],
        calls: 1,
        rowsFetched: 1,
      }),
    },
  )

  assert.equal(report.repeatedPatterns[0]?.signature, '/locations/:value')
  assert.equal(report.summary.searchConsoleMatchedPages, 1)
  assert.ok(
    report.findings.some(
      (item) => item.code === 'repeated-ranking-page-pattern',
    ),
  )
})

test('ranking pages keeps capped first-party zero rows partial', async () => {
  const report = await rankingPagesReport(
    { domain: 'example.com', site: 'sc-domain:example.com', market },
    {
      candidates: [candidate()],
      now,
      searchAnalytics: async () => ({
        rows: [],
        calls: 5,
        rowsFetched: 25_000,
      }),
    },
  )

  assert.equal(report.evidence.data.rows.length, 0)
  assert.equal(report.firstParty.status, 'partial')
  assert.equal(report.dataStatus, 'partial')
})

test('SERP competitors never invent a site classification', async () => {
  const data: SerpCompetitorSet = {
    keywords: ['blue widget', 'red widget'],
    rows: [
      {
        domain: 'example.com',
        matchedKeywords: 2,
        averagePosition: observedValue(2),
        medianPosition: observedValue(2),
        visibility: observedValue(0.8),
        estimatedMonthlyTraffic: observedValue(20),
        relevantResults: observedValue(2),
        keywordPositions: [],
      },
      {
        domain: 'unknown.test',
        matchedKeywords: 2,
        averagePosition: observedValue(4),
        medianPosition: observedValue(4),
        visibility: observedValue(0.4),
        estimatedMonthlyTraffic: observedValue(10),
        relevantResults: observedValue(2),
        keywordPositions: [],
      },
    ],
    totalRows: 2,
  }
  const report = await serpCompetitorsReport(
    {
      keywords: data.keywords,
      targetDomain: 'example.com',
      market,
    },
    {
      candidates: [
        candidate({
          serpCompetitors: async () => evidence('serp-competitors', data),
        }),
      ],
      now,
    },
  )

  assert.equal(report.competitors[1]?.siteType, 'unknown')
  assert.equal(report.competitors[1]?.classificationSource, 'unclassified')
  assert.equal(report.competitors[0]?.siteType, 'unknown')
})

test('SERP competitors preserve a filtered zero instead of reporting empty', async () => {
  const report = await serpCompetitorsReport(
    { keywords: ['blue widget', 'red widget'], market },
    {
      candidates: [
        candidate({
          serpCompetitors: async (input) =>
            evidence(
              'serp-competitors',
              { keywords: input.keywords, rows: [], totalRows: 0 },
              'filtered',
            ),
        }),
      ],
      now,
    },
  )

  assert.equal(report.summary.providerRows, 0)
  assert.equal(report.dataStatus, 'filtered')
})

test('SERP competitors require and preserve explicit declared site types', async () => {
  const data: SerpCompetitorSet = {
    keywords: ['blue widget', 'red widget'],
    rows: [
      {
        domain: 'directory.test',
        matchedKeywords: 2,
        averagePosition: observedValue(2),
        medianPosition: observedValue(2),
        visibility: observedValue(0.8),
        estimatedMonthlyTraffic: observedValue(20),
        relevantResults: observedValue(2),
        keywordPositions: [],
      },
    ],
    totalRows: 1,
  }
  const dependencies = {
    candidates: [
      candidate({
        serpCompetitors: async () => evidence('serp-competitors', data),
      }),
    ],
    now,
  }
  const report = await serpCompetitorsReport(
    {
      keywords: data.keywords,
      declaredCompetitors: [
        { domain: 'directory.test', siteType: 'directory' },
      ],
      market,
    },
    dependencies,
  )

  assert.equal(report.competitors[0]?.relationship, 'declared-competitor')
  assert.equal(report.competitors[0]?.siteType, 'directory')
  await assert.rejects(
    () =>
      serpCompetitorsReport(
        {
          keywords: data.keywords,
          declaredCompetitors: [
            { domain: 'directory.test', siteType: undefined },
          ] as never,
          market,
        },
        dependencies,
      ),
    /explicit supported site type/u,
  )
})

test('competitor gap rejects unknown site types at the core boundary', async () => {
  await assert.rejects(
    () =>
      competitorKeywordGapReport(
        {
          site: 'sc-domain:example.com',
          competitors: [{ domain: 'one.test', siteType: 'unknown' }] as never,
          market,
        },
        { candidates: [candidate()], now },
      ),
    /explicit non-unknown site type/u,
  )
})

test('competitor gap removes existing coverage and proposes bounded pSEO research', async () => {
  const ownRows = [
    metric('covered widget term', 'https://example.com/existing'),
  ]
  const competitorRows: Record<string, RankedKeyword[]> = {
    'one.test': [
      metric(
        'widget prices manchester',
        'https://one.test/locations/manchester',
        3,
      ),
      metric('covered widget term', 'https://one.test/locations/london', 4),
    ],
    'two.test': [
      metric(
        'widget prices manchester',
        'https://two.test/places/manchester',
        6,
      ),
      metric('unrelated phrase', 'https://two.test/other', 2),
    ],
  }
  const report = await competitorKeywordGapReport(
    {
      site: 'sc-domain:example.com',
      competitors: [
        { domain: 'one.test', siteType: 'business' },
        { domain: 'two.test', siteType: 'business' },
      ],
      market,
    },
    {
      candidates: [
        candidate({
          rankedKeywords: async (input) => {
            const rows =
              input.target === 'example.com'
                ? ownRows
                : (competitorRows[input.target] ?? [])
            return evidence<RankedKeywordPage>('ranked-keywords', {
              target: input.target,
              rows,
              totalRows: rows.length,
            })
          },
        }),
      ],
      now,
      searchAnalytics: async () => ({
        rows: [
          gscRow('widget prices uk', 'https://example.com/prices/uk'),
          gscRow('widget prices london', 'https://example.com/prices/london'),
          gscRow('widget prices bristol', 'https://example.com/prices/bristol'),
          gscRow('covered widget term', 'https://example.com/existing'),
        ],
        calls: 1,
        rowsFetched: 4,
      }),
    },
  )

  const candidateRow = report.candidates.find(
    (item) => item.keyword === 'widget prices manchester',
  )
  assert.equal(candidateRow?.classification, 'relevant-gap-candidate')
  assert.equal(candidateRow?.pseo.proposal, 'existing-template-review')
  assert.equal(report.summary.alreadyObservedFirstParty, 1)
  assert.equal(report.summary.unverifiedCompetitorTerms, 1)
  assert.equal(report.dataSourceBriefs.length, 1)
  assert.equal(report.selection.tokenRowsPerTermLimit, 100)
  assert.equal(report.processing.firstPartyRows, 4)
  assert.ok(report.processing.retainedTokenPostings <= 400)
})

test('competitor gap is deterministic and marks capped first-party evidence partial', async () => {
  const make = (order: string[]) =>
    competitorKeywordGapReport(
      {
        site: 'sc-domain:example.com',
        competitors: order.map((domain) => ({
          domain,
          siteType: 'business' as const,
        })),
        market,
      },
      {
        candidates: [
          candidate({
            rankedKeywords: async (input) =>
              evidence('ranked-keywords', {
                target: input.target,
                rows:
                  input.target === 'example.com'
                    ? []
                    : [
                        metric(
                          'widget prices leeds',
                          `https://${input.target}/places/leeds`,
                        ),
                      ],
                totalRows: input.target === 'example.com' ? 0 : 1,
              }),
          }),
        ],
        now,
        searchAnalytics: async () => ({
          rows: [gscRow('widget prices uk', 'https://example.com/prices/uk')],
          calls: 20,
          rowsFetched: 100_000,
        }),
      },
    )
  const first = await make(['one.test', 'two.test'])
  const second = await make(['two.test', 'one.test'])

  assert.equal(first.dataStatus, 'partial')
  assert.deepEqual(
    first.candidates.map(({ competitors, ...item }) => ({
      ...item,
      competitors: competitors.map((entry) => ({ ...entry, evidenceRef: '' })),
      evidenceRefs: [],
    })),
    second.candidates.map(({ competitors, ...item }) => ({
      ...item,
      competitors: competitors.map((entry) => ({ ...entry, evidenceRef: '' })),
      evidenceRefs: [],
    })),
  )
})

test('competitor gap keeps an intentional provider subset filtered, not partial', async () => {
  const report = await competitorKeywordGapReport(
    {
      site: 'sc-domain:example.com',
      competitors: [{ domain: 'one.test', siteType: 'business' }],
      market,
    },
    {
      candidates: [
        candidate({
          rankedKeywords: async (input) =>
            evidence(
              'ranked-keywords',
              {
                target: input.target,
                rows:
                  input.target === 'example.com'
                    ? []
                    : [
                        metric(
                          'widget prices leeds',
                          'https://one.test/places/leeds',
                        ),
                      ],
                totalRows: input.target === 'example.com' ? 0 : 1,
              },
              'filtered',
            ),
        }),
      ],
      now,
      searchAnalytics: async () => ({
        rows: [gscRow('widget prices uk', 'https://example.com/prices/uk')],
        calls: 1,
        rowsFetched: 1,
      }),
    },
  )

  assert.equal(report.dataStatus, 'filtered')
  assert.equal(report.source.ownDomain.status, 'filtered')
  assert.equal(report.source.competitors[0]?.status, 'filtered')
})

test('competitor gap does not turn a filtered empty subset into a definitive empty result', async () => {
  const report = await competitorKeywordGapReport(
    {
      site: 'sc-domain:example.com',
      competitors: [{ domain: 'one.test', siteType: 'business' }],
      market,
    },
    {
      candidates: [
        candidate({
          rankedKeywords: async (input) =>
            evidence(
              'ranked-keywords',
              { target: input.target, rows: [], totalRows: 0 },
              'filtered',
            ),
        }),
      ],
      now,
      searchAnalytics: async () => ({ rows: [], calls: 1, rowsFetched: 0 }),
    },
  )

  assert.equal(report.summary.uniqueCompetitorKeywords, 0)
  assert.equal(report.dataStatus, 'filtered')
})

test('competitor gap does not turn capped zero rows into a definitive empty result', async () => {
  const report = await competitorKeywordGapReport(
    {
      site: 'sc-domain:example.com',
      competitors: [{ domain: 'one.test', siteType: 'business' }],
      market,
    },
    {
      candidates: [candidate()],
      now,
      searchAnalytics: async () => ({
        rows: [],
        calls: 20,
        rowsFetched: 100_000,
      }),
    },
  )

  assert.equal(report.summary.uniqueCompetitorKeywords, 0)
  assert.equal(report.dataStatus, 'partial')
})
