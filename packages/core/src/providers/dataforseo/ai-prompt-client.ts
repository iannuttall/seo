import type {
  AiPromptObservationRequest,
  AiPromptSurface,
  ProviderRequestContext,
} from '../contracts.js'
import { ProviderError } from '../errors.js'
import { type ProviderFetch, providerRequestJson } from '../transport.js'
import {
  type DataForSeoAiPromptModelsResponse,
  type DataForSeoAiPromptResponse,
  dataForSeoAiPromptModelsResponseSchema,
  dataForSeoAiPromptResponseSchema,
} from './ai-prompt-schema.js'
import type { DataForSeoAccountSnapshot } from './client-types.js'
import type {
  DataForSeoPaidSnapshot,
  DataForSeoUnitPrice,
} from './paid-request.js'
import { dataForSeoTaskErrorCode } from './response.js'

export const DEFAULT_AI_PROMPT_TTL_MS = 7 * 24 * 60 * 60 * 1_000
export const AI_PROMPT_TIMEOUT_MS = 125_000
export const MAX_AI_PROMPT_CHARACTERS = 500
export const MAX_AI_PROMPT_OUTPUT_TOKENS = 4_096

export const DATAFORSEO_AI_PROMPT_SURFACES = {
  chatgpt: 'chat_gpt',
  claude: 'claude',
  gemini: 'gemini',
  perplexity: 'perplexity',
} as const satisfies Record<AiPromptSurface, string>

export function aiPromptModelsEndpoint(surface: AiPromptSurface): string {
  return `v3/ai_optimization/${DATAFORSEO_AI_PROMPT_SURFACES[surface]}/llm_responses/models`
}

export function aiPromptLiveEndpoint(surface: AiPromptSurface): string {
  return `v3/ai_optimization/${DATAFORSEO_AI_PROMPT_SURFACES[surface]}/llm_responses/live`
}

export type DataForSeoAiPromptRequest = {
  prompt: string
  surface: AiPromptSurface
  model: string
  countryCode: string
  webSearch: boolean
  maxOutputTokens: number
  refresh?: boolean
  context: ProviderRequestContext
}

export type DataForSeoAiPromptSnapshot =
  DataForSeoPaidSnapshot<DataForSeoAiPromptResponse>

export async function fetchAiPromptModels(input: {
  surface: AiPromptSurface
  authorization: string
  baseUrl: string
  fetch: ProviderFetch
  maxResponseBytes: number
  timeoutMs: number
}): Promise<DataForSeoAiPromptModelsResponse> {
  const response = await providerRequestJson({
    provider: 'dataforseo',
    operation: 'ai-prompt-models',
    url: new URL(aiPromptModelsEndpoint(input.surface), input.baseUrl),
    fetch: input.fetch,
    maxResponseBytes: input.maxResponseBytes,
    timeoutMs: input.timeoutMs,
    retry: 'safe',
    schema: dataForSeoAiPromptModelsResponseSchema,
    init: {
      method: 'GET',
      headers: { authorization: input.authorization },
    },
  })
  const failedTask = response.tasks.find((task) => task.status_code !== 20000)
  if (
    response.status_code !== 20000 ||
    response.tasks_error > 0 ||
    failedTask
  ) {
    const statusCode = failedTask?.status_code ?? response.status_code
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-prompt-models',
      code: dataForSeoTaskErrorCode(statusCode),
      message: `DataForSEO could not return the ${input.surface} model catalog (${statusCode}).`,
      retryable: statusCode === 40202,
    })
  }
  return response
}

function validate(input: DataForSeoAiPromptRequest): void {
  if (!input.prompt.trim() || input.prompt.length > MAX_AI_PROMPT_CHARACTERS) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-prompt-observation',
      code: 'configuration',
      message: `Each AI prompt must contain 1 to ${MAX_AI_PROMPT_CHARACTERS} characters.`,
    })
  }
  if (!input.model.trim() || input.model.length > 200) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-prompt-observation',
      code: 'configuration',
      message: 'Choose a model name returned by the provider model catalog.',
    })
  }
  if (!/^[A-Z]{2}$/u.test(input.countryCode)) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-prompt-observation',
      code: 'configuration',
      message: 'AI prompt observations need a two-letter country code.',
    })
  }
  if (
    !Number.isSafeInteger(input.maxOutputTokens) ||
    input.maxOutputTokens < 1 ||
    input.maxOutputTokens > MAX_AI_PROMPT_OUTPUT_TOKENS
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-prompt-observation',
      code: 'configuration',
      message: `AI prompt output tokens must be from 1 to ${MAX_AI_PROMPT_OUTPUT_TOKENS}.`,
    })
  }
  if (input.surface === 'perplexity' && !input.webSearch) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-prompt-observation',
      code: 'configuration',
      message:
        'Perplexity prompt observations require web search because its supported models use web search by default.',
    })
  }
}

export function aiPromptPaidRequest(
  input: DataForSeoAiPromptRequest,
  ttlMs: number,
): {
  operation: string
  capability: 'ai-prompt-observation'
  endpoint: string
  request: Record<string, unknown>
  schema: typeof dataForSeoAiPromptResponseSchema
  requestedRows: number
  price: (account: DataForSeoAccountSnapshot) => DataForSeoUnitPrice
  context: ProviderRequestContext
  ttlMs: number
  timeoutMs: number
  refresh?: boolean
  rowCount: (response: DataForSeoAiPromptResponse) => number
} {
  validate(input)
  const supportsCountry = input.surface !== 'gemini'
  const supportsWebSearchFlag = input.surface !== 'perplexity'
  return {
    operation: `ai-prompt-observation-${input.surface}`,
    capability: 'ai-prompt-observation',
    endpoint: aiPromptLiveEndpoint(input.surface),
    request: {
      user_prompt: input.prompt.trim().replace(/\s+/gu, ' '),
      model_name: input.model.trim(),
      max_output_tokens: input.maxOutputTokens,
      ...(supportsWebSearchFlag ? { web_search: input.webSearch } : {}),
      ...(supportsCountry && input.webSearch
        ? { web_search_country_iso_code: input.countryCode }
        : {}),
    },
    schema: dataForSeoAiPromptResponseSchema,
    requestedRows: 1,
    price: (account) => account.aiPromptObservationPrice,
    context: input.context,
    ttlMs,
    timeoutMs: AI_PROMPT_TIMEOUT_MS,
    refresh: input.refresh,
    rowCount: (response) =>
      response.tasks.reduce((sum, task) => sum + (task.result?.length ?? 0), 0),
  }
}

export function validateAiPromptModel(input: {
  request: AiPromptObservationRequest
  models: Array<{
    name: string
    reasoning: boolean
    webSearchSupported: boolean
  }>
}): void {
  const model = input.models.find(
    (item) => item.name === input.request.model.trim(),
  )
  if (!model) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-prompt-observation',
      code: 'configuration',
      message: `Model ${input.request.model} is not in the current ${input.request.surface} model catalog.`,
    })
  }
  if (input.request.webSearch && !model.webSearchSupported) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-prompt-observation',
      code: 'configuration',
      message: `Model ${model.name} does not support web search.`,
    })
  }
  const minimumTokens =
    input.request.surface === 'claude' && model.reasoning
      ? 1_025
      : model.reasoning
        ? 1_024
        : 1
  if (input.request.maxOutputTokens < minimumTokens) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-prompt-observation',
      code: 'configuration',
      message: `Model ${model.name} needs at least ${minimumTokens} output tokens.`,
    })
  }
}
