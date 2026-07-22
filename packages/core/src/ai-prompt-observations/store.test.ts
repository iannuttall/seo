import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  AiPromptEvidence,
  AiPromptObservation,
} from '../providers/contracts.js'
import Database from '../storage/sqlite.js'
import { AI_PROMPT_OBSERVATION_SCHEMA_SQL } from './schema.js'
import {
  aiPromptObservationLogicalBytes,
  priorAiPromptObservation,
  saveAiPromptObservation,
} from './store.js'

function database(): Database.Database {
  const db = new Database(':memory:')
  db.exec(AI_PROMPT_OBSERVATION_SCHEMA_SQL)
  return db
}

function evidence(input: {
  checkedAt: string
  answer?: string
  effectiveModel?: string
  cache?: 'hit' | 'miss' | 'bypass'
  taskIds?: string[]
}): AiPromptEvidence<AiPromptObservation> {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'ai-prompt-observation',
    market: null,
    data: {
      requestedModel: 'model-family',
      effectiveModel: input.effectiveModel ?? 'model-family-v1',
      answer: input.answer ?? 'A bounded answer.',
      answerTruncated: false,
      citations: [
        {
          title: 'Source',
          url: 'https://example.test/source',
          domain: 'example.test',
        },
      ],
      fanOutQueries: ['related question'],
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 0,
      webSearchRequested: true,
      webSearchObserved: true,
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
      completeness: 'complete',
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
      taskIds: input.taskIds ?? [`task-${input.checkedAt}`],
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

function save(
  db: Database.Database,
  checkedAt: string,
  options: {
    effectiveModel?: string
    answer?: string
    now?: string
    retainedPerComparison?: number
    retainedTotal?: number
    maxLogicalBytes?: number
    taskIds?: string[]
  } = {},
) {
  return saveAiPromptObservation(
    {
      promptId: 'prompt-1',
      promptGroup: 'commercial',
      prompt: 'Which option is best?',
      surface: 'chatgpt',
      countryCode: 'US',
      languageCode: 'en',
      maxOutputTokens: 2_048,
      evidence: evidence({
        checkedAt,
        answer: options.answer,
        effectiveModel: options.effectiveModel,
        taskIds: options.taskIds,
      }),
    },
    {
      database: db,
      now: () => new Date(options.now ?? checkedAt),
      retainedPerComparison: options.retainedPerComparison,
      retainedTotal: options.retainedTotal,
      maxLogicalBytes: options.maxLogicalBytes,
    },
  )
}

test('AI prompt history saves typed evidence and finds only an earlier comparable observation', () => {
  const db = database()
  const first = save(db, '2026-07-20T10:00:00.000Z')
  const second = save(db, '2026-07-22T10:00:00.000Z', {
    effectiveModel: 'model-family-v2',
  })

  assert.equal(second.promptGroup, 'commercial')
  assert.equal(second.citations[0]?.domain, 'example.test')
  assert.equal(second.actualCostMicros, 1_800)
  assert.equal(priorAiPromptObservation(second, { database: db })?.id, first.id)
  assert.equal(priorAiPromptObservation(first, { database: db }), null)
})

test('AI prompt history deduplicates the same provider observation', () => {
  const db = database()
  const first = save(db, '2026-07-22T10:00:00.000Z')
  const repeated = save(db, '2026-07-22T10:00:00.000Z', {
    now: '2026-07-22T11:00:00.000Z',
  })
  const count = db
    .prepare('SELECT COUNT(*) AS count FROM ai_prompt_observations')
    .get() as { count: number }
  assert.equal(repeated.id, first.id)
  assert.equal(count.count, 1)
})

test('AI prompt history deduplicates one provider task across timestamp normalization', () => {
  const db = database()
  const first = save(db, '2026-07-22T10:00:00.002Z', {
    taskIds: ['provider-task-1'],
  })
  const cached = save(db, '2026-07-22T10:00:00.000Z', {
    taskIds: ['provider-task-1'],
    now: '2026-07-22T11:00:00.000Z',
  })
  const count = db
    .prepare('SELECT COUNT(*) AS count FROM ai_prompt_observations')
    .get() as { count: number }

  assert.equal(cached.id, first.id)
  assert.equal(count.count, 1)
})

test('AI prompt history enforces per-comparison, global, and logical storage bounds', () => {
  const db = database()
  for (let index = 0; index < 6; index += 1) {
    save(db, `2026-07-2${index}T10:00:00.000Z`, {
      answer: 'x'.repeat(1_000),
      retainedPerComparison: 3,
      retainedTotal: 4,
      maxLogicalBytes: 4_000,
    })
  }
  const rows = db
    .prepare(
      'SELECT checked_at FROM ai_prompt_observations ORDER BY checked_at DESC',
    )
    .all() as Array<{ checked_at: string }>
  assert.ok(rows.length <= 3)
  assert.equal(rows[0]?.checked_at, '2026-07-25T10:00:00.000Z')
  assert.ok(aiPromptObservationLogicalBytes(db) <= 4_000)
})
