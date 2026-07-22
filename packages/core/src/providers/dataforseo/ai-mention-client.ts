import type { AiMentionRequest, ProviderRequestContext } from '../contracts.js'
import { ProviderError } from '../errors.js'
import {
  type DataForSeoAiMentionMetricsResponse,
  type DataForSeoAiMentionSearchResponse,
  dataForSeoAiMentionMetricsResponseSchema,
  dataForSeoAiMentionSearchResponseSchema,
} from './ai-mention-schema.js'
import type { DataForSeoAccountSnapshot } from './client-types.js'
import type {
  DataForSeoPaidResponse,
  DataForSeoPaidSnapshot,
  DataForSeoUnitPrice,
} from './paid-request.js'

export const DEFAULT_AI_MENTION_TTL_MS = 7 * 24 * 60 * 60 * 1_000
export const AI_MENTION_TIMEOUT_MS = 125_000
export const MAX_AI_MENTION_TARGETS = 6
export const MAX_AI_MENTION_ALIASES = 5
export const MAX_AI_MENTION_SAMPLES = 25

export const AI_MENTION_ENDPOINTS = {
  targetMetrics: 'v3/ai_optimization/llm_mentions/target_metrics/live',
  multiTargetMetrics:
    'v3/ai_optimization/llm_mentions/multi_target_metrics/live',
  searchMentions: 'v3/ai_optimization/llm_mentions/search_mentions/live',
} as const

export type DataForSeoAiMentionMetricsRequest = {
  target: AiMentionRequest['target']
  competitors: AiMentionRequest['competitors']
  platform: 'google' | 'chat_gpt'
  languageCode: string
  locationCode?: number
  locationName?: string
  refresh?: boolean
  context: ProviderRequestContext
}

export type DataForSeoAiMentionSearchRequest = {
  target: AiMentionRequest['target']
  platform: 'google' | 'chat_gpt'
  languageCode: string
  locationCode?: number
  locationName?: string
  limit: number
  refresh?: boolean
  context: ProviderRequestContext
}

export type DataForSeoAiMentionMetricsSnapshot =
  DataForSeoPaidSnapshot<DataForSeoAiMentionMetricsResponse>
export type DataForSeoAiMentionSearchSnapshot =
  DataForSeoPaidSnapshot<DataForSeoAiMentionSearchResponse>

type AiMentionPaidRequest<T extends DataForSeoPaidResponse> = {
  operation: string
  capability: 'ai-mentions'
  endpoint: string
  request: unknown
  schema:
    | typeof dataForSeoAiMentionMetricsResponseSchema
    | typeof dataForSeoAiMentionSearchResponseSchema
  requestedRows: number
  price: (account: DataForSeoAccountSnapshot) => DataForSeoUnitPrice
  context: ProviderRequestContext
  ttlMs: number
  timeoutMs: number
  refresh?: boolean
  rowCount: (response: T) => number
}

function validateLocation(input: {
  operation: string
  languageCode: string
  locationCode?: number
  locationName?: string
}): { location_code?: number; location_name?: string } {
  if (!/^[a-z]{2}$/.test(input.languageCode)) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: input.operation,
      code: 'configuration',
      message: 'AI mention research needs a two-letter language code.',
    })
  }
  const locationName = input.locationName?.trim()
  if ((input.locationCode !== undefined) === Boolean(locationName)) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: input.operation,
      code: 'configuration',
      message:
        'AI mention research needs exactly one location code or canonical location name.',
    })
  }
  if (
    input.locationCode !== undefined &&
    (!Number.isSafeInteger(input.locationCode) || input.locationCode <= 0)
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: input.operation,
      code: 'configuration',
      message: 'AI mention location code must be a positive integer.',
    })
  }
  return input.locationCode !== undefined
    ? { location_code: input.locationCode }
    : { location_name: locationName }
}

function targetEntities(target: AiMentionRequest['target']) {
  return target.aliases.map((keyword) => ({
    keyword,
    match_type: 'word_match',
    search_scope: ['answer'],
    search_filter: 'include',
  }))
}

function validateTarget(target: AiMentionRequest['target'], operation: string) {
  if (
    !target.key.trim() ||
    target.key.length > 250 ||
    !target.label.trim() ||
    target.label.length > 250 ||
    target.aliases.length < 1 ||
    target.aliases.length > MAX_AI_MENTION_ALIASES ||
    target.aliases.some((alias) => !alias.trim() || alias.length > 250)
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation,
      code: 'configuration',
      message: `Each AI mention target needs a key, label, and 1 to ${MAX_AI_MENTION_ALIASES} aliases of at most 250 characters.`,
    })
  }
}

function metricsRows(response: DataForSeoAiMentionMetricsResponse): number {
  return response.tasks.reduce(
    (total, task) =>
      total +
      (task.result ?? []).reduce(
        (resultTotal, result) =>
          resultTotal +
          (result.items?.length ?? (result.aggregated_metrics ? 1 : 0)),
        0,
      ),
    0,
  )
}

function searchRows(response: DataForSeoAiMentionSearchResponse): number {
  return response.tasks.reduce(
    (total, task) =>
      total +
      (task.result ?? []).reduce(
        (resultTotal, result) => resultTotal + (result.items?.length ?? 0),
        0,
      ),
    0,
  )
}

export function aiMentionMetricsPaidRequest(
  input: DataForSeoAiMentionMetricsRequest,
  ttlMs: number,
): AiMentionPaidRequest<DataForSeoAiMentionMetricsResponse> {
  const targets = [input.target, ...input.competitors]
  if (targets.length < 1 || targets.length > MAX_AI_MENTION_TARGETS) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-mention-metrics',
      code: 'configuration',
      message: `AI mention metrics supports 1 to ${MAX_AI_MENTION_TARGETS} targets.`,
    })
  }
  for (const target of targets) validateTarget(target, 'ai-mention-metrics')
  const keys = new Set(targets.map((target) => target.key))
  if (keys.size !== targets.length) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-mention-metrics',
      code: 'configuration',
      message: 'AI mention target keys must be unique.',
    })
  }
  const location = validateLocation({
    ...input,
    operation: 'ai-mention-metrics',
  })
  const multi = targets.length > 1
  return {
    operation: 'ai-mention-metrics',
    capability: 'ai-mentions',
    endpoint: multi
      ? AI_MENTION_ENDPOINTS.multiTargetMetrics
      : AI_MENTION_ENDPOINTS.targetMetrics,
    request: {
      language_code: input.languageCode,
      ...location,
      platform: input.platform,
      ...(multi
        ? {
            targets: targets.map((target) => ({
              key: target.key,
              target: targetEntities(target),
            })),
            order_by: ['total.mentions,desc'],
            limit: targets.length,
          }
        : { target: targetEntities(input.target) }),
      internal_list_limit: 10,
    },
    schema: dataForSeoAiMentionMetricsResponseSchema,
    requestedRows: targets.length,
    price: (account) =>
      multi
        ? account.aiMentionPrices.multiTargetMetrics
        : account.aiMentionPrices.targetMetrics,
    context: input.context,
    ttlMs,
    timeoutMs: AI_MENTION_TIMEOUT_MS,
    refresh: input.refresh,
    rowCount: metricsRows,
  }
}

export function aiMentionSearchPaidRequest(
  input: DataForSeoAiMentionSearchRequest,
  ttlMs: number,
): AiMentionPaidRequest<DataForSeoAiMentionSearchResponse> {
  validateTarget(input.target, 'ai-mention-samples')
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > MAX_AI_MENTION_SAMPLES
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-mention-samples',
      code: 'configuration',
      message: `AI mention sample limit must be from 1 to ${MAX_AI_MENTION_SAMPLES}.`,
    })
  }
  const location = validateLocation({
    ...input,
    operation: 'ai-mention-samples',
  })
  return {
    operation: 'ai-mention-samples',
    capability: 'ai-mentions',
    endpoint: AI_MENTION_ENDPOINTS.searchMentions,
    request: {
      language_code: input.languageCode,
      ...location,
      platform: input.platform,
      target: targetEntities(input.target),
      order_by: ['ai_search_volume,desc'],
      offset: 0,
      limit: input.limit,
    },
    schema: dataForSeoAiMentionSearchResponseSchema,
    requestedRows: input.limit,
    price: (account) => account.aiMentionPrices.searchMentions,
    context: input.context,
    ttlMs,
    timeoutMs: AI_MENTION_TIMEOUT_MS,
    refresh: input.refresh,
    rowCount: searchRows,
  }
}
