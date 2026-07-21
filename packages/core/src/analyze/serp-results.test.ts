import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  ProviderEvidence,
  SerpSnapshot,
  SerpSnapshotProvider,
  SerpSnapshotRequest,
} from '../providers/contracts.js'
import { serpResultsReport } from './serp-results.js'

function evidence(
  completeness: ProviderEvidence<SerpSnapshot>['coverage']['completeness'] = 'complete',
): ProviderEvidence<SerpSnapshot> {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'serp-snapshot',
    data: {
      keyword: 'local seo',
      effectiveKeyword: 'local search optimization',
      searchEngineDomain: 'google.co.uk',
      checkedAt: '2026-07-21T12:00:00.000Z',
      checkUrl: 'https://google.co.uk/search?q=local+seo',
      resultCount: 1000,
      pagesCount: 1,
      features: ['organic', 'people_also_ask'],
      organicResults: [
        {
          rankGroup: 1,
          rankAbsolute: 1,
          page: 1,
          domain: 'first.example',
          url: 'https://first.example/one',
          title: 'First',
          description: null,
          isFeaturedSnippet: false,
        },
        {
          rankGroup: 2,
          rankAbsolute: 3,
          page: 1,
          domain: 'first.example',
          url: 'https://first.example/two',
          title: 'Second',
          description: null,
          isFeaturedSnippet: false,
        },
        {
          rankGroup: 3,
          rankAbsolute: 4,
          page: 1,
          domain: 'other.example',
          url: 'https://other.example/page',
          title: 'Other',
          description: null,
          isFeaturedSnippet: false,
        },
      ],
    },
    observedAt: '2026-07-21T12:00:01.000Z',
    market: {
      countryCode: 'GB',
      languageCode: 'en',
      searchEngine: 'google',
      device: 'mobile',
    },
    coverage: {
      requestedRows: 10,
      returnedRows: 4,
      retainedRows: 3,
      invalidRows: 0,
      providerTotalRows: 1000,
      completeness,
      nextCursor: null,
    },
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 2_000,
      actualMicros: 2_000,
      taskIds: ['task-id'],
    },
    request: {
      operation: 'serp-snapshot',
      endpoint: 'provider-endpoint',
      limit: 10,
      filters: { device: 'mobile' },
      sort: ['rankAbsolute:ascending'],
    },
    warnings: [],
  }
}

test('SERP results summarize exact ranks without inventing strength', async () => {
  let captured: SerpSnapshotRequest | undefined
  const report = await serpResultsReport(
    {
      keyword: ' Local SEO ',
      market: {
        countryCode: 'gb',
        languageCode: 'EN',
        searchEngine: 'google',
        device: 'mobile',
      },
      depth: 10,
      projectId: 'project-1',
    },
    {
      now: () => new Date('2026-07-21T13:00:00.000Z'),
      candidates: [
        {
          connected: true,
          priority: 10,
          adapter: {
            provider: 'dataforseo',
            capabilitySupport: [
              {
                capability: 'serp-snapshot',
                status: 'available',
                markets: 'all',
              },
            ],
            serpSnapshot: async (input: SerpSnapshotRequest) => {
              captured = input
              return evidence()
            },
          } as SerpSnapshotProvider,
        },
      ],
    },
  )

  assert.equal(captured?.keyword, 'Local SEO')
  assert.equal(captured?.context?.projectId, 'project-1')
  assert.equal(captured?.context?.reportId, 'serp-results')
  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.summary.organicResults, 3)
  assert.equal(report.summary.uniqueDomains, 2)
  assert.equal(report.summary.correctedQuery, true)
  assert.deepEqual(report.domains[0], {
    domain: 'first.example',
    resultCount: 2,
    ranks: [1, 3],
  })
  assert.deepEqual(
    report.findings.map((finding) => finding.code),
    ['query-correction', 'repeated-domain'],
  )
})

test('SERP results keep capped snapshots partial', async () => {
  const report = await serpResultsReport(
    {
      keyword: 'query',
      market: {
        countryCode: 'US',
        languageCode: 'en',
        searchEngine: 'google',
      },
    },
    {
      candidates: [
        {
          connected: true,
          priority: 10,
          adapter: {
            provider: 'dataforseo',
            capabilitySupport: [
              {
                capability: 'serp-snapshot',
                status: 'available',
                markets: 'all',
              },
            ],
            serpSnapshot: async () => evidence('capped'),
          } as SerpSnapshotProvider,
        },
      ],
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.evidence.coverage.completeness, 'capped')
})

test('SERP results reject unsafe depth before provider work', async () => {
  let calls = 0
  await assert.rejects(
    serpResultsReport(
      {
        keyword: 'query',
        market: {
          countryCode: 'US',
          languageCode: 'en',
          searchEngine: 'google',
        },
        depth: 101,
      },
      {
        candidates: [
          {
            connected: true,
            priority: 10,
            adapter: {
              provider: 'dataforseo',
              capabilitySupport: [
                {
                  capability: 'serp-snapshot',
                  status: 'available',
                  markets: 'all',
                },
              ],
              serpSnapshot: async () => {
                calls += 1
                return evidence()
              },
            } as SerpSnapshotProvider,
          },
        ],
      },
    ),
    /depth must be from 1 to 100/,
  )
  assert.equal(calls, 0)
})
