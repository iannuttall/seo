import assert from 'node:assert/strict'
import test from 'node:test'
import { SeoError } from '../../errors.js'
import type { SerpResultsReport } from '../serp-results.js'
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
      organicResults: 1,
      uniqueDomains: 1,
      observedFeatures: 2,
      correctedQuery: false,
      verdict: 'One result retained.',
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
        ],
      },
      coverage: {
        requestedRows: 10,
        returnedRows: 2,
        retainedRows: 1,
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
    domains: [{ domain: 'example.com', resultCount: 1, ranks: [2] }],
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
  assert.equal(report.serpEvidence.selection.omittedQueries, 1)
  assert.equal(report.serpEvidence.cost.actualMicros, 4_000)
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
