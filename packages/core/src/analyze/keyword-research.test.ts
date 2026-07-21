import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  KeywordDiscoveryProvider,
  KeywordDiscoveryRequest,
  KeywordIdea,
  ProviderEvidence,
} from '../providers/contracts.js'
import { observedValue, unavailableValue } from '../providers/contracts.js'
import { keywordResearchReport } from './keyword-research.js'

function idea(
  keyword: string,
  volume: number | null,
  sources: KeywordIdea['sources'],
): KeywordIdea {
  return {
    keyword,
    monthlySearchVolume:
      volume === null
        ? unavailableValue('missing', 'Volume was omitted.')
        : observedValue(volume),
    monthlySearches: unavailableValue('missing', 'History was omitted.'),
    searchVolumeUpdatedAt: unavailableValue('missing', 'Date was omitted.'),
    cpcUsd: unavailableValue('missing', 'CPC was omitted.'),
    paidCompetition: unavailableValue('missing', 'Competition was omitted.'),
    keywordDifficulty: unavailableValue('missing', 'Difficulty was omitted.'),
    intent: unavailableValue('missing', 'Intent was omitted.'),
    resultCount: unavailableValue('missing', 'Result count was omitted.'),
    sources,
  }
}

function evidence(
  data: KeywordIdea[],
  completeness: ProviderEvidence<
    KeywordIdea[]
  >['coverage']['completeness'] = 'complete',
): ProviderEvidence<KeywordIdea[]> {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'keyword-discovery',
    data,
    observedAt: '2026-07-21T12:00:00.000Z',
    market: {
      countryCode: 'GB',
      languageCode: 'en',
      searchEngine: 'google',
    },
    coverage: {
      requestedRows: 20,
      returnedRows: data.length,
      retainedRows: data.length,
      invalidRows: 0,
      providerTotalRows: data.length,
      completeness,
      nextCursor: null,
    },
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 12_000,
      actualMicros: 12_000,
      taskIds: ['task-id'],
    },
    request: {
      operation: 'keyword-discovery',
      endpoint: 'provider-endpoint',
      limit: 20,
      filters: {},
      sort: ['monthlySearchVolume:descending'],
    },
    warnings: [],
  }
}

test('keyword research keeps source overlap and zero evidence explicit', async () => {
  let captured: KeywordDiscoveryRequest | undefined
  const report = await keywordResearchReport(
    {
      seeds: ['Local SEO', 'SEO tools'],
      sources: ['suggestions', 'ideas'],
      market: {
        countryCode: 'gb',
        languageCode: 'EN',
        searchEngine: 'google',
      },
      limit: 20,
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
                capability: 'keyword-discovery',
                status: 'available',
                markets: [{ searchEngines: ['google'], location: 'any' }],
              },
            ],
            discoverKeywords: async (input: KeywordDiscoveryRequest) => {
              captured = input
              return evidence([
                idea('local seo audit', 100, [
                  { seed: 'local seo', source: 'ideas' },
                  { seed: 'local seo', source: 'suggestions' },
                ]),
                idea('local seo checklist', 0, [
                  { seed: 'local seo', source: 'suggestions' },
                ]),
                idea('seo tool comparison', null, [
                  { seed: 'seo tools', source: 'ideas' },
                ]),
              ])
            },
          } as KeywordDiscoveryProvider,
        },
      ],
    },
  )

  assert.deepEqual(captured?.sources, ['ideas', 'suggestions'])
  assert.equal(captured?.context?.projectId, 'project-1')
  assert.equal(captured?.context?.reportId, 'keyword-research')
  assert.equal(report.generatedAt, '2026-07-21T13:00:00.000Z')
  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.summary.observedZeroVolume, 1)
  assert.equal(report.summary.missingOrInvalidVolume, 1)
  assert.equal(report.summary.keywordsFoundBySeveralSources, 1)
  assert.equal(report.findings[0]?.code, 'multi-source-keyword')
  assert.equal(report.findings[0]?.evidenceRef, 'evidence.data[0].sources')
})

test('keyword research preserves capped provider evidence as partial', async () => {
  const report = await keywordResearchReport(
    {
      seeds: ['seed'],
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
                capability: 'keyword-discovery',
                status: 'available',
                markets: 'all',
              },
            ],
            discoverKeywords: async () =>
              evidence(
                [idea('idea', 10, [{ seed: 'seed', source: 'suggestions' }])],
                'capped',
              ),
          } as KeywordDiscoveryProvider,
        },
      ],
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.evidence.coverage.completeness, 'capped')
})

test('keyword research rejects unsafe bounds before provider work', async () => {
  let calls = 0
  const dependencies = {
    candidates: [
      {
        connected: true,
        priority: 10,
        adapter: {
          provider: 'dataforseo' as const,
          capabilitySupport: [
            {
              capability: 'keyword-discovery' as const,
              status: 'available' as const,
              markets: 'all' as const,
            },
          ],
          discoverKeywords: async () => {
            calls += 1
            return evidence([])
          },
        } as KeywordDiscoveryProvider,
      },
    ],
  }

  await assert.rejects(
    keywordResearchReport(
      {
        seeds: ['one', 'two', 'three', 'four', 'five', 'six'],
        market: {
          countryCode: 'US',
          languageCode: 'en',
          searchEngine: 'google',
        },
      },
      dependencies,
    ),
    /requires 1 to 5 seeds/,
  )
  await assert.rejects(
    keywordResearchReport(
      {
        seeds: ['one', 'two', 'three'],
        sources: ['related', 'suggestions'],
        market: {
          countryCode: 'US',
          languageCode: 'en',
          searchEngine: 'google',
        },
        limit: 5,
      },
      dependencies,
    ),
    /limit of at least 6/,
  )
  assert.equal(calls, 0)
})
