import { createHash } from 'node:crypto'
import { SeoError } from '../errors.js'
import type {
  AiPromptCitation,
  AiPromptEvidence,
  AiPromptObservation,
  AiPromptSurface,
  ProviderId,
  ProviderWarning,
} from '../providers/contracts.js'
import { getDb } from '../storage/database.js'
import type Database from '../storage/sqlite.js'

export const AI_PROMPT_OBSERVATION_LIMITS = {
  retainedPerComparison: 90,
  retainedTotal: 10_000,
  logicalBytes: 128 * 1024 * 1024,
} as const

export type StoredAiPromptObservation = {
  id: string
  comparisonKey: string
  promptId: string
  promptGroup: string | null
  prompt: string
  surface: AiPromptSurface
  requestedModel: string
  effectiveModel: string
  countryCode: string
  languageCode: string
  webSearchRequested: boolean
  webSearchObserved: boolean | null
  maxOutputTokens: number
  answer: string
  answerTruncated: boolean
  citations: AiPromptCitation[]
  fanOutQueries: string[]
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  modelCostMicros: number | null
  estimatedCostMicros: number | null
  actualCostMicros: number | null
  checkedAt: string
  provider: ProviderId
  providerTaskIds: string[]
  completeness: string
  warnings: ProviderWarning[]
  createdAt: string
}

type ObservationRow = {
  id: string
  comparison_key: string
  prompt_id: string
  prompt_group: string | null
  prompt: string
  surface: AiPromptSurface
  requested_model: string
  effective_model: string
  country_code: string
  language_code: string
  web_search_requested: number
  web_search_observed: number | null
  max_output_tokens: number
  answer: string
  answer_truncated: number
  citations_json: string
  fan_out_queries_json: string
  input_tokens: number | null
  output_tokens: number | null
  reasoning_tokens: number | null
  model_cost_micros: number | null
  estimated_cost_micros: number | null
  actual_cost_micros: number | null
  checked_at: string
  provider: ProviderId
  provider_task_ids_json: string
  completeness: string
  warnings_json: string
  created_at: number
}

type StoreOptions = {
  database?: Database.Database
  now?: () => Date
  maxLogicalBytes?: number
  retainedPerComparison?: number
  retainedTotal?: number
}

function database(options: StoreOptions): Database.Database {
  return options.database ?? getDb()
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function aiPromptComparisonKey(input: {
  provider: ProviderId
  prompt: string
  surface: AiPromptSurface
  requestedModel: string
  countryCode: string
  languageCode: string
  webSearchRequested: boolean
  maxOutputTokens: number
}): string {
  return stableHash({
    provider: input.provider,
    prompt: input.prompt.normalize('NFC').trim().replace(/\s+/gu, ' '),
    surface: input.surface,
    requestedModel: input.requestedModel.trim(),
    countryCode: input.countryCode.toUpperCase(),
    languageCode: input.languageCode.toLowerCase(),
    webSearchRequested: input.webSearchRequested,
    maxOutputTokens: input.maxOutputTokens,
  })
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function fromRow(row: ObservationRow): StoredAiPromptObservation {
  return {
    id: row.id,
    comparisonKey: row.comparison_key,
    promptId: row.prompt_id,
    promptGroup: row.prompt_group,
    prompt: row.prompt,
    surface: row.surface,
    requestedModel: row.requested_model,
    effectiveModel: row.effective_model,
    countryCode: row.country_code,
    languageCode: row.language_code,
    webSearchRequested: row.web_search_requested === 1,
    webSearchObserved:
      row.web_search_observed === null ? null : row.web_search_observed === 1,
    maxOutputTokens: row.max_output_tokens,
    answer: row.answer,
    answerTruncated: row.answer_truncated === 1,
    citations: parseJson(row.citations_json, []),
    fanOutQueries: parseJson(row.fan_out_queries_json, []),
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    modelCostMicros: row.model_cost_micros,
    estimatedCostMicros: row.estimated_cost_micros,
    actualCostMicros: row.actual_cost_micros,
    checkedAt: row.checked_at,
    provider: row.provider,
    providerTaskIds: parseJson(row.provider_task_ids_json, []),
    completeness: row.completeness,
    warnings: parseJson(row.warnings_json, []),
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export function aiPromptObservationLogicalBytes(
  db: Database.Database = getDb(),
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(
        length(id) + length(comparison_key) + length(prompt_id) +
        COALESCE(length(prompt_group), 0) + length(prompt) + length(surface) +
        length(requested_model) + length(effective_model) +
        length(country_code) + length(language_code) + length(answer) +
        length(citations_json) + length(fan_out_queries_json) +
        length(provider) + length(provider_task_ids_json) +
        length(completeness) + length(warnings_json) + 256
      ), 0) AS bytes FROM ai_prompt_observations`,
    )
    .get() as { bytes: number }
  return row.bytes
}

function prune(
  db: Database.Database,
  currentId: string,
  comparisonKey: string,
  options: StoreOptions,
): void {
  const perComparison =
    options.retainedPerComparison ??
    AI_PROMPT_OBSERVATION_LIMITS.retainedPerComparison
  const total =
    options.retainedTotal ?? AI_PROMPT_OBSERVATION_LIMITS.retainedTotal
  db.prepare(
    `DELETE FROM ai_prompt_observations WHERE id IN (
      SELECT id FROM ai_prompt_observations WHERE comparison_key = ?
      ORDER BY checked_at DESC, id DESC LIMIT -1 OFFSET ?
    )`,
  ).run(comparisonKey, perComparison)
  db.prepare(
    `DELETE FROM ai_prompt_observations WHERE id IN (
      SELECT id FROM ai_prompt_observations
      ORDER BY checked_at DESC, id DESC LIMIT -1 OFFSET ?
    )`,
  ).run(total)
  const maxBytes =
    options.maxLogicalBytes ?? AI_PROMPT_OBSERVATION_LIMITS.logicalBytes
  while (aiPromptObservationLogicalBytes(db) > maxBytes) {
    const oldest = db
      .prepare(
        `SELECT id FROM ai_prompt_observations WHERE id <> ?
         ORDER BY checked_at, id LIMIT 1`,
      )
      .get(currentId) as { id: string } | undefined
    if (!oldest) break
    db.prepare('DELETE FROM ai_prompt_observations WHERE id = ?').run(oldest.id)
  }
  if (aiPromptObservationLogicalBytes(db) > maxBytes) {
    throw new SeoError(
      'INVALID_INPUT',
      'This AI prompt observation exceeds the local history storage limit.',
    )
  }
}

export function saveAiPromptObservation(
  input: {
    promptId: string
    promptGroup?: string
    prompt: string
    surface: AiPromptSurface
    countryCode: string
    languageCode: string
    maxOutputTokens: number
    evidence: AiPromptEvidence<AiPromptObservation>
  },
  options: StoreOptions = {},
): StoredAiPromptObservation {
  const db = database(options)
  const comparisonKey = aiPromptComparisonKey({
    provider: input.evidence.provider,
    prompt: input.prompt,
    surface: input.surface,
    requestedModel: input.evidence.data.requestedModel,
    countryCode: input.countryCode,
    languageCode: input.languageCode,
    webSearchRequested: input.evidence.data.webSearchRequested,
    maxOutputTokens: input.maxOutputTokens,
  })
  const taskIds = [...input.evidence.cost.taskIds].sort()
  const providerIdentity =
    taskIds.length > 0
      ? { taskIds }
      : {
          checkedAt: input.evidence.data.checkedAt,
          answer: input.evidence.data.answer,
        }
  const id = stableHash({ comparisonKey, providerIdentity })
  const now = (options.now ?? (() => new Date()))().getTime()
  const save = db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO ai_prompt_observations (
        id, comparison_key, prompt_id, prompt_group, prompt, surface,
        requested_model, effective_model, country_code, language_code,
        web_search_requested, web_search_observed, max_output_tokens, answer,
        answer_truncated, citations_json, fan_out_queries_json, input_tokens,
        output_tokens, reasoning_tokens, model_cost_micros,
        estimated_cost_micros, actual_cost_micros, checked_at, provider,
        provider_task_ids_json, completeness, warnings_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      comparisonKey,
      input.promptId,
      input.promptGroup ?? null,
      input.prompt,
      input.surface,
      input.evidence.data.requestedModel,
      input.evidence.data.effectiveModel,
      input.countryCode,
      input.languageCode,
      input.evidence.data.webSearchRequested ? 1 : 0,
      input.evidence.data.webSearchObserved === null
        ? null
        : input.evidence.data.webSearchObserved
          ? 1
          : 0,
      input.maxOutputTokens,
      input.evidence.data.answer,
      input.evidence.data.answerTruncated ? 1 : 0,
      JSON.stringify(input.evidence.data.citations),
      JSON.stringify(input.evidence.data.fanOutQueries),
      input.evidence.data.inputTokens,
      input.evidence.data.outputTokens,
      input.evidence.data.reasoningTokens,
      input.evidence.data.modelCostMicros,
      input.evidence.cost.estimatedMicros,
      input.evidence.cost.actualMicros,
      input.evidence.data.checkedAt,
      input.evidence.provider,
      JSON.stringify(input.evidence.cost.taskIds),
      input.evidence.coverage.completeness,
      JSON.stringify(input.evidence.warnings),
      now,
    )
    prune(db, id, comparisonKey, options)
  })
  save.immediate()
  const row = db
    .prepare('SELECT * FROM ai_prompt_observations WHERE id = ?')
    .get(id) as ObservationRow | undefined
  if (!row) {
    throw new SeoError(
      'INTERNAL_ERROR',
      'The saved AI prompt observation could not be loaded.',
    )
  }
  return fromRow(row)
}

export function priorAiPromptObservation(
  current: Pick<
    StoredAiPromptObservation,
    'id' | 'comparisonKey' | 'checkedAt'
  >,
  options: StoreOptions = {},
): StoredAiPromptObservation | null {
  const row = database(options)
    .prepare(
      `SELECT * FROM ai_prompt_observations
       WHERE comparison_key = ? AND id <> ? AND checked_at < ?
       ORDER BY checked_at DESC, id DESC LIMIT 1`,
    )
    .get(current.comparisonKey, current.id, current.checkedAt) as
    | ObservationRow
    | undefined
  return row ? fromRow(row) : null
}
