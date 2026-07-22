import { randomUUID } from 'node:crypto'
import type {
  AiPromptCitation,
  AiPromptEvidence,
  AiPromptModel,
  AiPromptObservation,
  AiPromptObservationProvider,
  AiPromptObservationRequest,
  AiPromptSurface,
  ProviderWarning,
} from '../contracts.js'
import { aiPromptMarketSchema, aiPromptSurfaceSchema } from '../contracts.js'
import { ProviderError } from '../errors.js'
import {
  AI_PROMPT_TIMEOUT_MS,
  aiPromptLiveEndpoint,
  MAX_AI_PROMPT_CHARACTERS,
  MAX_AI_PROMPT_OUTPUT_TOKENS,
  validateAiPromptModel,
} from './ai-prompt-client.js'
import { DataForSeoClient } from './client.js'
import type { DataForSeoClientOptions } from './client-types.js'
import { safeUrl } from './domain-research-shared.js'

const MAX_ANSWER_CHARACTERS = 24_000
const MAX_CITATIONS = 25
const MAX_FAN_OUT_QUERIES = 20

type AiPromptClient = Pick<
  DataForSeoClient,
  'aiPromptModels' | 'aiPromptObservation'
>

export type DataForSeoAiPromptObservationProviderOptions =
  DataForSeoClientOptions & {
    client?: AiPromptClient
  }

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function modelsFromResponse(
  response: Awaited<ReturnType<AiPromptClient['aiPromptModels']>>,
): AiPromptModel[] {
  const models = new Map<string, AiPromptModel>()
  for (const row of response.tasks.flatMap((task) => task.result ?? [])) {
    models.set(row.model_name, {
      name: row.model_name,
      reasoning: row.reasoning ?? false,
      webSearchSupported: row.web_search_supported ?? false,
      queuedCollectionSupported: row.task_post_supported ?? false,
    })
  }
  return [...models.values()].sort((left, right) =>
    compareText(left.name, right.name),
  )
}

function checkedAt(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  const parsed = new Date(value.replace(' ', 'T').replace(' +00:00', 'Z'))
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}

function mappedObservation(
  input: AiPromptObservationRequest,
  snapshot: Awaited<ReturnType<AiPromptClient['aiPromptObservation']>>,
): AiPromptEvidence<AiPromptObservation> {
  const row = snapshot.response.tasks.flatMap((task) => task.result ?? [])[0]
  if (!row) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-prompt-observation',
      code: 'invalid-response',
      message: 'DataForSEO returned no AI prompt observation row.',
    })
  }
  const messageSections = (row.items ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.sections ?? [])
  const rawAnswer = messageSections
    .flatMap((section) => (section.text?.trim() ? [section.text.trim()] : []))
    .join('\n\n')
  const answerTruncated = rawAnswer.length > MAX_ANSWER_CHARACTERS
  const answer = answerTruncated
    ? rawAnswer.slice(0, MAX_ANSWER_CHARACTERS)
    : rawAnswer
  const citations = new Map<string, AiPromptCitation>()
  let invalidCitations = 0
  for (const annotation of messageSections.flatMap(
    (section) => section.annotations ?? [],
  )) {
    const url = safeUrl(annotation.url)
    if (!url) {
      invalidCitations += 1
      continue
    }
    if (!citations.has(url) && citations.size < MAX_CITATIONS) {
      citations.set(url, {
        title: annotation.title?.trim() || null,
        url,
        domain: new URL(url).hostname.toLowerCase().replace(/^www\./u, ''),
      })
    }
  }
  const rawFanOut = row.fan_out_queries ?? []
  const fanOutQueries = [...new Set(rawFanOut.map((item) => item.trim()))]
    .filter(Boolean)
    .sort(compareText)
    .slice(0, MAX_FAN_OUT_QUERIES)
  const warnings: ProviderWarning[] = [...snapshot.warnings]
  if (!rawAnswer) {
    warnings.push({
      code: 'answer-missing',
      message:
        'The provider returned an observation without visible answer text.',
    })
  }
  if (answerTruncated) {
    warnings.push({
      code: 'answer-truncated',
      message: `The visible answer exceeded ${MAX_ANSWER_CHARACTERS} characters and was truncated before local storage.`,
    })
  }
  if (invalidCitations > 0) {
    warnings.push({
      code: 'invalid-citations',
      message: `${invalidCitations} unsafe or malformed citation URL${invalidCitations === 1 ? ' was' : 's were'} discarded.`,
    })
  }
  if (rawFanOut.length > fanOutQueries.length) {
    warnings.push({
      code: 'fan-out-queries-bounded',
      message: `Fan-out queries were deduplicated and limited to ${MAX_FAN_OUT_QUERIES}.`,
    })
  }
  warnings.push({
    code: 'variable-cost-estimate',
    message:
      'The preflight estimate covers the provider base request fee. The exact response cost also includes model tokens and web search and is recorded as actual cost.',
  })
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: 'ai-prompt-observation',
    market: null,
    data: {
      requestedModel: input.model,
      effectiveModel: row.model_name,
      answer,
      answerTruncated,
      citations: [...citations.values()],
      fanOutQueries,
      inputTokens: row.input_tokens ?? null,
      outputTokens: row.output_tokens ?? null,
      reasoningTokens: row.reasoning_tokens ?? null,
      webSearchRequested: input.webSearch,
      webSearchObserved: row.web_search ?? null,
      modelCostMicros:
        row.money_spent === null || row.money_spent === undefined
          ? null
          : Math.round(row.money_spent * 1_000_000),
      checkedAt: checkedAt(row.datetime, snapshot.observedAt),
    },
    observedAt: snapshot.observedAt,
    coverage: {
      requestedRows: 1,
      returnedRows: snapshot.returnedRows,
      retainedRows: 1,
      invalidRows: 0,
      providerTotalRows: snapshot.returnedRows,
      completeness: answerTruncated ? 'partial' : 'complete',
      nextCursor: null,
    },
    cache: snapshot.cache,
    cost: snapshot.cost,
    request: {
      operation: 'ai-prompt-observation',
      endpoint: `/${aiPromptLiveEndpoint(input.surface)}`,
      limit: 1,
      filters: {
        surface: input.surface,
        requestedModel: input.model,
        countryCode: input.market.countryCode,
        languageCode: input.market.languageCode,
        webSearch: input.webSearch,
        maxOutputTokens: input.maxOutputTokens,
      },
      sort: [],
    },
    warnings,
  }
}

function validatedInput(
  input: AiPromptObservationRequest,
): AiPromptObservationRequest {
  const surface = aiPromptSurfaceSchema.safeParse(input.surface)
  const market = aiPromptMarketSchema.safeParse(input.market)
  if (
    !surface.success ||
    !market.success ||
    !input.prompt.trim() ||
    input.prompt.length > MAX_AI_PROMPT_CHARACTERS ||
    !input.model.trim() ||
    input.model.length > 200 ||
    !Number.isSafeInteger(input.maxOutputTokens) ||
    input.maxOutputTokens < 1 ||
    input.maxOutputTokens > MAX_AI_PROMPT_OUTPUT_TOKENS
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ai-prompt-observation',
      code: 'configuration',
      message: 'Use a valid bounded AI prompt observation request.',
    })
  }
  return {
    ...input,
    prompt: input.prompt.trim().replace(/\s+/gu, ' '),
    model: input.model.trim(),
    surface: surface.data,
    market: market.data,
  }
}

export class DataForSeoAiPromptObservationProvider
  implements AiPromptObservationProvider
{
  readonly provider = 'dataforseo' as const
  readonly capabilitySupport = [
    {
      capability: 'ai-prompt-observation' as const,
      status: 'available' as const,
      markets: 'all' as const,
    },
  ]

  private readonly client: AiPromptClient
  private readonly modelCatalog = new Map<
    AiPromptSurface,
    Promise<AiPromptModel[]>
  >()

  constructor(options: DataForSeoAiPromptObservationProviderOptions = {}) {
    this.client = options.client ?? new DataForSeoClient(options)
  }

  async aiPromptModels(surface: AiPromptSurface): Promise<AiPromptModel[]> {
    const parsed = aiPromptSurfaceSchema.safeParse(surface)
    if (!parsed.success) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'ai-prompt-models',
        code: 'configuration',
        message: 'Choose a supported AI prompt surface.',
      })
    }
    const current = this.modelCatalog.get(surface)
    if (current) return current
    const request = this.client
      .aiPromptModels(surface)
      .then((response) => modelsFromResponse(response))
      .then((models) => {
        if (models.length === 0) {
          throw new ProviderError({
            provider: 'dataforseo',
            operation: 'ai-prompt-models',
            code: 'invalid-response',
            message: `DataForSEO returned an empty ${surface} model catalog.`,
          })
        }
        return models
      })
    this.modelCatalog.set(surface, request)
    try {
      return await request
    } catch (error) {
      this.modelCatalog.delete(surface)
      throw error
    }
  }

  async observeAiPrompt(
    rawInput: AiPromptObservationRequest,
  ): Promise<AiPromptEvidence<AiPromptObservation>> {
    const input = validatedInput(rawInput)
    const models = await this.aiPromptModels(input.surface)
    validateAiPromptModel({ request: input, models })
    const context = input.context ?? {
      reportId: 'ai-prompt-observations',
      reportRunId: randomUUID(),
    }
    const snapshot = await this.client.aiPromptObservation({
      prompt: input.prompt,
      surface: input.surface,
      model: input.model,
      countryCode: input.market.countryCode,
      webSearch: input.webSearch,
      maxOutputTokens: input.maxOutputTokens,
      refresh: input.refresh,
      context,
    })
    return mappedObservation(input, snapshot)
  }
}

export { AI_PROMPT_TIMEOUT_MS }
