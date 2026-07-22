import assert from 'node:assert/strict'
import test from 'node:test'
import { AI_PROMPT_OBSERVATION_SCHEMA_SQL } from '../../ai-prompt-observations/schema.js'
import type {
  AiPromptEvidence,
  AiPromptObservation,
  AiPromptObservationProvider,
  AiPromptObservationRequest,
  AiPromptSurface,
} from '../../providers/contracts.js'
import { ProviderError } from '../../providers/errors.js'
import type { ProviderCandidate } from '../../providers/resolver.js'
import Database from '../../storage/sqlite.js'
import { aiPromptObservationsReport } from './report.js'
import type { AiPromptModelInput } from './validation.js'

function database(): Database.Database {
  const db = new Database(':memory:')
  db.exec(AI_PROMPT_OBSERVATION_SCHEMA_SQL)
  return db
}

function evidence(
  request: AiPromptObservationRequest,
  input: {
    answer: string
    checkedAt: string
    effectiveModel?: string
    citations?: AiPromptObservation['citations']
    fanOutQueries?: string[]
    cache?: 'hit' | 'miss' | 'bypass'
    answerTruncated?: boolean
    completeness?: AiPromptEvidence<AiPromptObservation>['coverage']['completeness']
  },
): AiPromptEvidence<AiPromptObservation> {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'ai-prompt-observation',
    market: null,
    data: {
      requestedModel: request.model,
      effectiveModel: input.effectiveModel ?? `${request.model}-v1`,
      answer: input.answer,
      answerTruncated: input.answerTruncated ?? false,
      citations: input.citations ?? [],
      fanOutQueries: input.fanOutQueries ?? [],
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 0,
      webSearchRequested: request.webSearch,
      webSearchObserved: request.webSearch,
      modelCostMicros: 1_200,
      checkedAt: input.checkedAt,
    },
    observedAt: input.checkedAt,
    coverage: {
      requestedRows: 1,
      returnedRows: 1,
      retainedRows: 1,
      invalidRows: 0,
      providerTotalRows: 1,
      completeness: input.completeness ?? 'complete',
      nextCursor: null,
    },
    cache: {
      status: input.cache ?? 'miss',
      storedAt: null,
      expiresAt: null,
    },
    cost: {
      currency: 'USD',
      estimatedMicros: 600,
      actualMicros: 1_800,
      taskIds: [`task-${request.surface}-${input.checkedAt}`],
    },
    request: {
      operation: 'ai-prompt-observation',
      endpoint: 'fixture',
      limit: 1,
      filters: {},
      sort: [],
    },
    warnings: [],
  }
}

function candidate(provider: AiPromptObservationProvider): ProviderCandidate {
  return { adapter: provider, connected: true, priority: 1 }
}

function provider(input: {
  observe: (
    request: AiPromptObservationRequest,
  ) => Promise<AiPromptEvidence<AiPromptObservation>>
  models?: Partial<Record<AiPromptSurface, string[]>>
}): AiPromptObservationProvider {
  return {
    provider: 'dataforseo',
    capabilitySupport: [
      {
        capability: 'ai-prompt-observation',
        status: 'available',
        markets: 'all',
      },
    ],
    aiPromptModels: async (surface) =>
      (input.models?.[surface] ?? [`${surface}-model`]).map((name) => ({
        name,
        reasoning: false,
        webSearchSupported: true,
        queuedCollectionSupported: true,
      })),
    observeAiPrompt: input.observe,
  }
}

const baseInput = {
  prompts: [
    {
      id: 'commercial-choice',
      group: 'commercial',
      prompt: 'Which widget is best for a small team?',
    },
  ],
  models: [
    { surface: 'chatgpt' as const, model: 'chatgpt-model' },
    { surface: 'claude' as const, model: 'claude-model' },
  ],
  target: {
    label: 'Target & Co',
    aliases: ['Target & Co'],
    domains: ['target.example'],
  },
  competitors: [{ label: 'Rival++', aliases: ['Rival++'] }],
  market: { countryCode: 'US', languageCode: 'en' },
  webSearch: true,
  maxOutputTokens: 2_048,
}

test('fixed prompt observations combine targets, citations, fan-out themes, and Search Console context', async () => {
  const adapter = provider({
    observe: async (request) =>
      evidence(request, {
        answer:
          request.surface === 'chatgpt'
            ? 'Target & Co is one option.'
            : 'Rival++ is another option.',
        checkedAt: '2026-07-22T12:00:00.000Z',
        citations:
          request.surface === 'chatgpt'
            ? [
                {
                  title: 'Owned guide',
                  url: 'https://target.example/guide',
                  domain: 'target.example',
                },
              ]
            : [],
        fanOutQueries: [
          'best widgets for small teams',
          'widget pricing for teams',
        ],
      }),
  })
  const report = await aiPromptObservationsReport(
    { ...baseInput, site: 'sc-domain:target.example' },
    {
      database: database(),
      candidates: [candidate(adapter)],
      now: () => new Date('2026-07-22T12:05:00.000Z'),
      searchAnalytics: async () => ({
        rows: [
          {
            keys: ['best widgets for teams', 'https://target.example/widgets'],
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

  assert.equal(report.dataStatus, 'complete')
  assert.equal(report.summary.completed, 2)
  assert.equal(report.summary.targetObserved, 1)
  assert.equal(report.summary.targetCited, 1)
  assert.equal(report.summary.competitorOnly, 1)
  assert.equal(report.cost.actualMicros, 3_600)
  assert.equal(report.cost.estimatedMicros, 1_200)
  assert.equal(report.source.firstParty.status, 'complete')
  assert.ok(
    report.fanOutThemes.some(
      (theme) =>
        theme.observationCount === 2 && theme.firstParty.status === 'matched',
    ),
  )
  assert.ok(
    report.findings.some(
      (finding) => finding.code === 'competitor-only-observed',
    ),
  )
  assert.ok(
    report.findings.some(
      (finding) => finding.code === 'owned-citation-observed',
    ),
  )
})

test('model catalog preflight rejects the whole basket before paid work', async () => {
  let paidCalls = 0
  const adapter = provider({
    models: { chatgpt: ['different-model'] },
    observe: async (request) => {
      paidCalls += 1
      return evidence(request, {
        answer: 'unexpected',
        checkedAt: '2026-07-22T12:00:00.000Z',
      })
    },
  })
  await assert.rejects(
    aiPromptObservationsReport(
      { ...baseInput, models: [baseInput.models[0] as AiPromptModelInput] },
      { database: database(), candidates: [candidate(adapter)] },
    ),
    /not in the current chatgpt model catalog/i,
  )
  assert.equal(paidCalls, 0)
})

test('fixed history reports only comparable target changes', async () => {
  const db = database()
  let checkedAt = '2026-07-20T12:00:00.000Z'
  let answer = 'No supplied target is named.'
  const adapter = provider({
    observe: async (request) => evidence(request, { answer, checkedAt }),
  })
  const input = {
    ...baseInput,
    models: [baseInput.models[0] as AiPromptModelInput],
  }
  const dependencies = {
    database: db,
    candidates: [candidate(adapter)],
  }
  const first = await aiPromptObservationsReport(input, dependencies)
  assert.equal(first.observations[0]?.state, 'complete')
  if (first.observations[0]?.state === 'complete') {
    assert.equal(first.observations[0].comparison.status, 'no-prior')
  }

  checkedAt = '2026-07-22T12:00:00.000Z'
  answer = 'Target & Co is now named.'
  const second = await aiPromptObservationsReport(input, dependencies)
  assert.equal(second.summary.comparable, 1)
  if (second.observations[0]?.state === 'complete') {
    assert.equal(second.observations[0].comparison.status, 'comparable')
    assert.equal(
      second.observations[0].comparison.targetChanges[0]?.change,
      'appeared',
    )
  }
  assert.ok(
    second.findings.some((finding) => finding.code === 'target-appeared'),
  )
})

test('model changes, cache reuse, and incomplete evidence stay non-comparable', async () => {
  const db = database()
  let checkedAt = '2026-07-19T12:00:00.000Z'
  let effectiveModel = 'chatgpt-model-v1'
  let cache: 'hit' | 'miss' = 'miss'
  let completeness: 'complete' | 'partial' = 'complete'
  let answerTruncated = false
  const adapter = provider({
    observe: async (request) =>
      evidence(request, {
        answer: 'Target & Co is named.',
        checkedAt,
        effectiveModel,
        cache,
        completeness,
        answerTruncated,
      }),
  })
  const input = {
    ...baseInput,
    models: [baseInput.models[0] as AiPromptModelInput],
  }
  const dependencies = { database: db, candidates: [candidate(adapter)] }
  await aiPromptObservationsReport(input, dependencies)

  checkedAt = '2026-07-20T12:00:00.000Z'
  effectiveModel = 'chatgpt-model-v2'
  const changedModel = await aiPromptObservationsReport(input, dependencies)
  assert.equal(changedModel.summary.comparable, 0)
  if (changedModel.observations[0]?.state === 'complete') {
    assert.equal(
      changedModel.observations[0].comparison.status,
      'model-changed',
    )
  }

  checkedAt = '2026-07-21T12:00:00.000Z'
  cache = 'hit'
  const cached = await aiPromptObservationsReport(input, dependencies)
  assert.equal(cached.summary.cached, 1)
  if (cached.observations[0]?.state === 'complete') {
    assert.equal(cached.observations[0].comparison.status, 'cached-observation')
  }

  checkedAt = '2026-07-22T12:00:00.000Z'
  cache = 'miss'
  completeness = 'partial'
  answerTruncated = true
  const incomplete = await aiPromptObservationsReport(input, dependencies)
  assert.equal(incomplete.dataStatus, 'partial')
  assert.equal(incomplete.summary.comparable, 0)
  if (incomplete.observations[0]?.state === 'complete') {
    assert.equal(
      incomplete.observations[0].comparison.status,
      'incomplete-evidence',
    )
  }
})

test('partial provider failures preserve successful evidence and unknown total cost', async () => {
  const adapter = provider({
    observe: async (request) => {
      if (request.surface === 'claude') {
        throw new ProviderError({
          provider: 'dataforseo',
          operation: 'ai-prompt-observation',
          code: 'remote-error',
          message: 'The fixture model was unavailable.',
        })
      }
      return evidence(request, {
        answer: 'Target & Co is named.',
        checkedAt: '2026-07-22T12:00:00.000Z',
      })
    },
  })
  const report = await aiPromptObservationsReport(baseInput, {
    database: database(),
    candidates: [candidate(adapter)],
  })
  assert.equal(report.dataStatus, 'partial')
  assert.equal(report.summary.completed, 1)
  assert.equal(report.summary.unavailable, 1)
  assert.equal(report.cost.actualMicros, null)
  assert.equal(report.cost.actualCostState, 'partial-or-unknown')
})
