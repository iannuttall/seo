import assert from 'node:assert/strict'
import test from 'node:test'
import { SeoError } from '../../errors.js'
import type { SerpResultsReport } from '../serp-results.js'
import { localAnalyticsEvidence } from './analytics.js'
import { localSearchReport } from './report.js'

function serpReport(keyword: string): SerpResultsReport {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-22T12:00:00.000Z',
    dataStatus: 'complete',
    market: {
      countryCode: 'GB',
      languageCode: 'en',
      searchEngine: 'google',
      location: { name: 'London,England,United Kingdom' },
      device: 'mobile',
    },
    summary: {
      keyword,
      effectiveKeyword: keyword,
      requestedDepth: 10,
      organicResults: 2,
      localPackResults: 1,
      uniqueDomains: 2,
      observedFeatures: 2,
      correctedQuery: false,
      verdict: 'Fixture results retained.',
    },
    evidence: {
      schemaVersion: 1,
      provider: 'dataforseo',
      capability: 'serp-snapshot',
      market: {
        countryCode: 'GB',
        languageCode: 'en',
        searchEngine: 'google',
        location: { name: 'London,England,United Kingdom' },
        device: 'mobile',
      },
      observedAt: '2026-07-22T12:00:00.000Z',
      data: {
        keyword,
        effectiveKeyword: keyword,
        searchEngineDomain: 'google.co.uk',
        checkedAt: '2026-07-22T12:00:00.000Z',
        checkUrl: null,
        resultCount: null,
        pagesCount: 1,
        features: ['local_pack', 'organic'],
        organicResults: [
          {
            rankGroup: 1,
            rankAbsolute: 2,
            page: 1,
            domain: 'example.com',
            url: 'https://example.com/page',
            title: 'Example',
            description: null,
            isFeaturedSnippet: false,
          },
          {
            rankGroup: 2,
            rankAbsolute: 3,
            page: 1,
            domain: 'directory.test',
            url: 'https://directory.test/page',
            title: 'Directory',
            description: null,
            isFeaturedSnippet: false,
          },
        ],
        localPack: {
          present: true,
          returnedRows: 1,
          retainedRows: 1,
          invalidRows: 0,
          results: [
            {
              rankGroup: 1,
              rankAbsolute: 1,
              page: 1,
              title: 'Example plumber',
              domain: 'example-plumber.test',
              url: 'https://example-plumber.test/',
              cid: 'example-cid',
              phone: null,
              description: null,
              isPaid: false,
              rating: {
                type: 'Max5',
                value: 5,
                votesCount: 20,
                maximum: 5,
              },
            },
          ],
        },
      },
      coverage: {
        requestedRows: 10,
        returnedRows: 3,
        retainedRows: 2,
        invalidRows: 0,
        providerTotalRows: null,
        completeness: 'complete',
        nextCursor: null,
      },
      cache: { status: 'miss', storedAt: null, expiresAt: null },
      cost: {
        currency: 'USD',
        estimatedMicros: 2_000,
        actualMicros: 2_000,
        taskIds: [`task-${keyword}`],
      },
      request: {
        operation: 'serp-snapshot',
        endpoint: 'test',
        limit: 10,
        filters: {},
        sort: [],
      },
      warnings: [],
    },
    domains: [
      { domain: 'example.com', resultCount: 1, ranks: [2] },
      { domain: 'directory.test', resultCount: 1, ranks: [3] },
    ],
    findings: [],
    caveats: [],
    nextSteps: [],
  }
}

test('combines first-party local demand with bounded opt-in SERPs', async () => {
  const gscRequests: Array<Record<string, unknown>> = []
  const serpQueries: string[] = []
  const report = await localSearchReport(
    {
      site: 'sc-domain:example.com',
      locationTerms: ['London', 'Manchester'],
      includeSerps: true,
      market: {
        countryCode: 'GB',
        languageCode: 'en',
        searchEngine: 'google',
        location: { name: 'London,England,United Kingdom' },
        device: 'mobile',
      },
      serpLimit: 2,
    },
    {
      now: () => new Date('2026-07-22T12:00:00.000Z'),
      searchAnalytics: async (_site, request) => {
        gscRequests.push(request as unknown as Record<string, unknown>)
        return {
          rows: [
            {
              keys: ['plumber london', 'https://example.com/london'],
              clicks: 5,
              impressions: 100,
              ctr: 0.05,
              position: 7,
            },
            {
              keys: ['plumber manchester', 'https://example.com/manchester'],
              clicks: 2,
              impressions: 50,
              ctr: 0.04,
              position: 12,
            },
            {
              keys: ['plumber near me', 'https://example.com/plumber'],
              clicks: 1,
              impressions: 25,
              ctr: 0.04,
              position: 18,
            },
          ],
          rowsFetched: 3,
          calls: 1,
        }
      },
      serpResults: async (input) => {
        serpQueries.push(input.keyword)
        assert.equal(input.context?.reportId, 'local-search-demand')
        return serpReport(input.keyword)
      },
    },
  )

  assert.deepEqual(gscRequests[0]?.dimensions, ['query', 'page'])
  assert.equal(gscRequests[0]?.maxRows, 50_000)
  assert.deepEqual(serpQueries, ['plumber london', 'plumber manchester'])
  assert.equal(report.summary.localQueries, 3)
  assert.equal(report.summary.serpSnapshots, 2)
  assert.equal(report.summary.localPackSnapshots, 2)
  assert.equal(report.summary.localPackListings, 1)
  assert.equal(report.summary.organicCompetitors, 1)
  assert.equal(
    report.serpInsights.organicCompetitors.items[0]?.domain,
    'directory.test',
  )
  assert.equal(
    report.serpInsights.organicCompetitors.items[0]?.matchedQueries,
    2,
  )
  assert.equal(
    report.serpInsights.localPackListings.items[0]?.cid,
    'example-cid',
  )
  assert.equal(report.serpEvidence.selection.omittedQueries, 1)
  assert.equal(report.serpEvidence.cost.actualMicros, 4_000)
})

test('joins optional Analytics geography by local landing page without changing query evidence', async () => {
  let analyticsPropertyId: string | undefined
  const report = await localSearchReport(
    {
      site: 'sc-domain:example.com',
      locationTerms: ['london', 'manchester'],
      googleAnalyticsPropertyId: 'properties/123',
      analyticsLimit: 100,
    },
    {
      now: () => new Date('2026-07-22T12:00:00.000Z'),
      searchAnalytics: async () => ({
        rows: [
          {
            keys: ['plumber london', 'https://example.com/plumbers/london'],
            clicks: 5,
            impressions: 100,
            ctr: 0.05,
            position: 7,
          },
          {
            keys: [
              'plumber manchester',
              'https://example.com/plumbers/manchester',
            ],
            clicks: 2,
            impressions: 50,
            ctr: 0.04,
            position: 12,
          },
        ],
        rowsFetched: 2,
        calls: 1,
      }),
      analyticsEvidence: async (input) => {
        analyticsPropertyId = input.propertyId
        return localAnalyticsEvidence(input, {
          runReport: async () => ({
            dimensionHeaders: [
              { name: 'landingPagePlusQueryString' },
              { name: 'country' },
              { name: 'region' },
              { name: 'city' },
            ],
            metricHeaders: [{ name: 'sessions' }],
            rows: [
              {
                dimensionValues: [
                  { value: '/plumbers/london' },
                  { value: 'United Kingdom' },
                  { value: 'England' },
                  { value: 'London' },
                ],
                metricValues: [{ value: '20' }],
              },
              {
                dimensionValues: [
                  { value: '/unrelated' },
                  { value: 'United States' },
                  { value: 'California' },
                  { value: 'Los Angeles' },
                ],
                metricValues: [{ value: '500' }],
              },
            ],
            rowCount: 2,
          }),
        })
      },
    },
  )

  assert.equal(analyticsPropertyId, '123')
  assert.equal(report.analyticsEvidence.status, 'complete')
  assert.equal(report.analyticsEvidence.source.matchedPages, 1)
  assert.equal(report.analyticsEvidence.locations[0]?.city, 'London')
  assert.equal(report.analyticsEvidence.locations[0]?.sessions, 20)
  assert.equal(report.summary.analyticsLocations, 1)
  assert.equal(report.summary.analyticsMatchedPages, 1)
  assert.equal(
    report.opportunities[0]?.intent.method,
    'explicit-local-intent-v1',
  )
})

test('does not make paid requests by default', async () => {
  const report = await localSearchReport(
    { site: 'sc-domain:example.com', locationTerms: ['london'] },
    {
      now: () => new Date('2026-07-22T12:00:00.000Z'),
      searchAnalytics: async () => ({ rows: [], rowsFetched: 0, calls: 1 }),
      serpResults: async () => {
        throw new Error('should not run')
      },
    },
  )
  assert.equal(report.dataStatus, 'empty')
  assert.equal(report.serpEvidence.status, 'not-requested')
  assert.equal(report.serpEvidence.cost.actualMicros, 0)
})

test('keeps first-party evidence when optional SERPs are unavailable', async () => {
  const report = await localSearchReport(
    {
      site: 'sc-domain:example.com',
      locationTerms: ['london'],
      includeSerps: true,
      market: {
        countryCode: 'GB',
        languageCode: 'en',
        searchEngine: 'google',
        location: { name: 'London,England,United Kingdom' },
      },
    },
    {
      now: () => new Date('2026-07-22T12:00:00.000Z'),
      searchAnalytics: async () => ({
        rows: [
          {
            keys: ['plumber london', 'https://example.com/london'],
            clicks: 5,
            impressions: 100,
            ctr: 0.05,
            position: 7,
          },
        ],
        rowsFetched: 1,
        calls: 1,
      }),
      serpResults: async () => {
        throw new SeoError('PROVIDER_UNAVAILABLE', 'Provider is disconnected.')
      },
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.summary.localQueries, 1)
  assert.equal(report.serpEvidence.status, 'unavailable')
  assert.equal(report.serpEvidence.cost.actualMicros, null)
  assert.deepEqual(report.warnings, ['Provider is disconnected.'])
})

test('keeps first-party evidence when optional Analytics geography is unavailable', async () => {
  const report = await localSearchReport(
    {
      site: 'sc-domain:example.com',
      locationTerms: ['london'],
      googleAnalyticsPropertyId: '123',
    },
    {
      now: () => new Date('2026-07-22T12:00:00.000Z'),
      searchAnalytics: async () => ({
        rows: [
          {
            keys: ['plumber london', 'https://example.com/london'],
            clicks: 5,
            impressions: 100,
            ctr: 0.05,
            position: 7,
          },
        ],
        rowsFetched: 1,
        calls: 1,
      }),
      analyticsEvidence: (input) =>
        localAnalyticsEvidence(input, {
          runReport: async () => {
            throw new Error('Analytics connection failed.')
          },
        }),
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.summary.localQueries, 1)
  assert.equal(report.analyticsEvidence.status, 'unavailable')
  assert.match(report.warnings.join(' '), /Analytics connection failed/)
})

test('requires an explicit canonical location for local SERPs', async () => {
  await assert.rejects(
    localSearchReport({
      site: 'sc-domain:example.com',
      includeSerps: true,
      market: {
        countryCode: 'GB',
        languageCode: 'en',
        searchEngine: 'google',
      },
    }),
    (error: unknown) =>
      error instanceof SeoError &&
      error.code === 'INVALID_INPUT' &&
      /canonical location/.test(error.message),
  )
})

test('rejects SERP-only options when paid evidence is not enabled', async () => {
  await assert.rejects(
    localSearchReport({
      site: 'sc-domain:example.com',
      serpLimit: 2,
    }),
    (error: unknown) =>
      error instanceof SeoError &&
      error.code === 'INVALID_INPUT' &&
      /includeSerps/.test(error.message),
  )
})

test('rejects Analytics limits and malformed property ids before acquisition', async () => {
  let calls = 0
  const dependencies = {
    searchAnalytics: async () => {
      calls++
      return { rows: [], rowsFetched: 0, calls: 1 }
    },
  }
  await assert.rejects(
    localSearchReport(
      { site: 'sc-domain:example.com', analyticsLimit: 10 },
      dependencies,
    ),
    /googleAnalyticsPropertyId/,
  )
  await assert.rejects(
    localSearchReport(
      {
        site: 'sc-domain:example.com',
        googleAnalyticsPropertyId: 'not-a-property',
      },
      dependencies,
    ),
    /numeric Google Analytics property id/,
  )
  assert.equal(calls, 0)
})

test('keeps a capped source partial when every retained row is filtered', async () => {
  const report = await localSearchReport(
    {
      site: 'sc-domain:example.com',
      maxRows: 1,
    },
    {
      now: () => new Date('2026-07-22T12:00:00.000Z'),
      searchAnalytics: async () => ({
        rows: [
          {
            keys: ['generic query', 'https://example.com/page'],
            clicks: 1,
            impressions: 10,
            ctr: 0.1,
            position: 5,
          },
        ],
        rowsFetched: 1,
        calls: 1,
      }),
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.source.possiblyTruncated, true)
  assert.equal(report.summary.localQueries, 0)
})
