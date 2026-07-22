import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  AiMentionEvidence,
  AiMentionMetrics,
  AiMentionProvider,
  AiMentionRequest,
  AiMentionSample,
} from '../providers/contracts.js'
import { ProviderError } from '../providers/errors.js'
import { aiMentionResearchReport } from './ai-mention-research.js'

const market = {
  countryCode: 'US',
  languageCode: 'en',
  location: { code: 2840 },
  surface: 'google-ai-overview' as const,
}

function baseEvidence<T>(data: T, operation: string): AiMentionEvidence<T> {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'ai-mentions',
    data,
    observedAt: '2026-07-22T10:00:00.000Z',
    market,
    coverage: {
      requestedRows: 2,
      returnedRows: 2,
      retainedRows: 2,
      invalidRows: 0,
      providerTotalRows: 2,
      completeness: 'complete',
      nextCursor: null,
    },
    cache: { status: 'miss', storedAt: null, expiresAt: null },
    cost: {
      currency: 'USD',
      estimatedMicros: 102_000,
      actualMicros: 102_000,
      taskIds: [`${operation}-task`],
    },
    request: {
      operation,
      endpoint: `provider/${operation}`,
      limit: 2,
      filters: {},
      sort: [],
    },
    warnings: [],
  }
}

function provider(
  input: { samples?: AiMentionSample[]; sampleError?: ProviderError } = {},
): AiMentionProvider {
  return {
    provider: 'dataforseo',
    capabilitySupport: [
      { capability: 'ai-mentions', status: 'available', markets: 'all' },
    ],
    aiMentionMetrics: async (request: AiMentionRequest) =>
      baseEvidence<AiMentionMetrics>(
        {
          targets: [
            {
              target: request.target,
              mentions: { state: 'observed', value: 10 },
              aiSearchVolume: { state: 'observed', value: 100 },
              sourceDomains: [
                { domain: 'example.com', mentions: 2, aiSearchVolume: 20 },
              ],
            },
            ...request.competitors.map((target) => ({
              target,
              mentions: { state: 'observed' as const, value: 30 },
              aiSearchVolume: { state: 'observed' as const, value: 300 },
              sourceDomains: [],
            })),
          ],
          combined: {
            mentions: { state: 'observed', value: 40 },
            aiSearchVolume: { state: 'observed', value: 400 },
            sourceDomains: [],
          },
        },
        'ai-mention-metrics',
      ),
    aiMentionSamples: async () => {
      if (input.sampleError) throw input.sampleError
      return baseEvidence(
        input.samples ?? [
          {
            question: 'How does target pricing work?',
            answerExcerpt: 'Example answer',
            answerTruncated: false,
            model: 'example-model',
            aiSearchVolume: { state: 'observed', value: 50 },
            firstObservedAt: {
              state: 'observed',
              value: '2026-06-01T10:00:00.000Z',
            },
            lastObservedAt: {
              state: 'observed',
              value: '2026-07-20T10:00:00.000Z',
            },
            isWebSearchBased: { state: 'observed', value: true },
            sources: [
              {
                rank: 1,
                domain: 'example.com',
                url: 'https://example.com/pricing',
                title: 'Pricing',
                sourceName: 'Example',
              },
            ],
          },
          {
            question: 'Is target pricing good?',
            answerExcerpt: 'Another answer',
            answerTruncated: false,
            model: 'example-model',
            aiSearchVolume: { state: 'observed', value: 25 },
            firstObservedAt: {
              state: 'observed',
              value: '2026-06-02T10:00:00.000Z',
            },
            lastObservedAt: {
              state: 'observed',
              value: '2026-07-21T10:00:00.000Z',
            },
            isWebSearchBased: { state: 'observed', value: true },
            sources: [],
          },
        ],
        'ai-mention-samples',
      )
    },
  }
}

test('AI mention research combines comparison, citations and Search Console overlap', async () => {
  let metricsInput: AiMentionRequest | undefined
  const adapter = provider()
  const originalMetrics = adapter.aiMentionMetrics.bind(adapter)
  adapter.aiMentionMetrics = async (input) => {
    metricsInput = input
    return originalMetrics(input)
  }
  const report = await aiMentionResearchReport(
    {
      target: { label: 'Target', aliases: ['Target App'] },
      competitors: [{ label: 'Competitor' }],
      domain: 'https://www.example.com/path',
      site: 'sc-domain:example.com',
      market,
    },
    {
      now: () => new Date('2026-07-22T12:00:00.000Z'),
      candidates: [{ adapter, connected: true, priority: 10 }],
      searchAnalytics: async () => ({
        rows: [
          {
            keys: ['target pricing guide', 'https://example.com/pricing'],
            clicks: 2,
            impressions: 100,
            ctr: 0.02,
            position: 8,
          },
        ],
        rowsFetched: 1,
        calls: 1,
      }),
    },
  )

  assert.equal(metricsInput?.context?.reportId, 'ai-mention-research')
  assert.deepEqual(metricsInput?.target.aliases, ['Target', 'Target App'])
  assert.equal(report.summary.targetComparisonShare, 0.25)
  assert.equal(report.summary.samplesWithOwnedSource, 1)
  assert.equal(report.summary.firstPartyMatches, 2)
  assert.equal(report.samples[0]?.firstParty.status, 'matched')
  assert.deepEqual(report.samples[0]?.ownedSources, [
    'https://example.com/pricing',
  ])
  assert.equal(report.questionPatterns[0]?.term, 'pricing')
  assert.equal(report.questionPatterns[0]?.sampleCount, 2)
  assert.equal(report.questionPatterns[0]?.firstPartyQueryCount, 1)
  assert.ok(
    report.findings.some(
      (finding) => finding.code === 'lower-comparison-share',
    ),
  )
  assert.match(
    report.nextSteps.join(' '),
    /Record repeatable fixed prompt observations/,
  )
  assert.doesNotMatch(JSON.stringify(report), /prompt observation report/)
  assert.equal(report.cost.actualMicros, 204_000)
})

test('AI mention research keeps successful metrics when samples fail remotely', async () => {
  const report = await aiMentionResearchReport(
    {
      target: { label: 'Target' },
      market,
    },
    {
      candidates: [
        {
          adapter: provider({
            sampleError: new ProviderError({
              provider: 'dataforseo',
              operation: 'ai-mention-samples',
              code: 'remote-error',
              message: 'Sample request failed.',
            }),
          }),
          connected: true,
          priority: 10,
        },
      ],
    },
  )

  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.source.metrics.status, 'complete')
  assert.equal(report.source.samples.status, 'unavailable')
  assert.equal(report.cost.actualMicros, null)
})

test('AI mention research can skip the second paid request explicitly', async () => {
  let sampleCalls = 0
  const adapter = provider()
  adapter.aiMentionSamples = async () => {
    sampleCalls += 1
    throw new Error('unexpected')
  }
  const report = await aiMentionResearchReport(
    {
      target: { label: 'Target' },
      market,
      includeSamples: false,
    },
    {
      candidates: [{ adapter, connected: true, priority: 10 }],
    },
  )

  assert.equal(sampleCalls, 0)
  assert.equal(report.source.samples.status, 'not-requested')
  assert.equal(report.cost.actualMicros, 102_000)
})

test('AI mention research rejects oversized comparison input before provider work', async () => {
  let calls = 0
  const adapter = provider()
  adapter.aiMentionMetrics = async () => {
    calls += 1
    throw new Error('unexpected')
  }
  await assert.rejects(
    aiMentionResearchReport(
      {
        target: { label: 'Target' },
        competitors: Array.from({ length: 6 }, (_, index) => ({
          label: `Competitor ${index}`,
        })),
        market,
      },
      { candidates: [{ adapter, connected: true, priority: 10 }] },
    ),
    /at most 5 competitors/,
  )
  assert.equal(calls, 0)
})
