import { createHash } from 'node:crypto'
import { SeoError } from '../../errors.js'
import type {
  AiPromptMarket,
  AiPromptSurface,
  ProviderId,
} from '../../providers/contracts.js'
import {
  aiPromptMarketSchema,
  aiPromptSurfaceSchema,
  providerIdSchema,
} from '../../providers/contracts.js'
import { normalizeDomain } from '../domain-research/shared.js'

export const MAX_AI_OBSERVATION_PROMPTS = 5
export const MAX_AI_OBSERVATION_MODELS = 4
export const MAX_AI_OBSERVATION_REQUESTS = 20
export const MAX_AI_OBSERVATION_COMPETITORS = 5
export const MAX_AI_OBSERVATION_ALIASES = 5
export const MAX_AI_OBSERVATION_DOMAINS = 5

export type AiPromptInput = {
  id?: string
  group?: string
  prompt: string
}

export type AiPromptModelInput = {
  surface: AiPromptSurface
  model: string
}

export type AiPromptTargetInput = {
  label: string
  aliases?: string[]
  domains?: string[]
}

export type ValidatedAiPromptTarget = {
  key: string
  role: 'target' | 'competitor'
  label: string
  aliases: string[]
  domains: string[]
}

export type ValidatedAiPromptInput = {
  prompts: Array<{ id: string; group: string | null; prompt: string }>
  models: AiPromptModelInput[]
  targets: ValidatedAiPromptTarget[]
  market: AiPromptMarket
  provider: ProviderId | undefined
  webSearch: boolean
  maxOutputTokens: number
  days: number
  requestCount: number
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compact(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ')
}

function stablePromptId(prompt: string): string {
  return `prompt-${createHash('sha256').update(prompt).digest('hex').slice(0, 12)}`
}

function validatedPrompt(input: AiPromptInput) {
  const prompt = compact(input.prompt)
  const id = input.id ? compact(input.id) : stablePromptId(prompt)
  const group = input.group ? compact(input.group) : null
  if (
    !prompt ||
    prompt.length > 500 ||
    !id ||
    id.length > 100 ||
    (group !== null && group.length > 100)
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Each prompt needs a unique id of at most 100 characters, an optional group of at most 100 characters, and 1 to 500 prompt characters.',
    )
  }
  return { id, group, prompt }
}

function validatedTarget(
  input: AiPromptTargetInput,
  key: string,
  role: ValidatedAiPromptTarget['role'],
): ValidatedAiPromptTarget {
  const label = compact(input.label)
  const aliases = [label, ...(input.aliases ?? [])].map(compact).filter(Boolean)
  const uniqueAliases = [
    ...new Map(
      aliases.map((alias) => [alias.toLocaleLowerCase('en-US'), alias]),
    ).values(),
  ].sort(compareText)
  const domains = [
    ...new Set((input.domains ?? []).map((domain) => normalizeDomain(domain))),
  ].sort(compareText)
  if (
    !label ||
    label.length > 250 ||
    uniqueAliases.length < 1 ||
    uniqueAliases.length > MAX_AI_OBSERVATION_ALIASES ||
    uniqueAliases.some((alias) => alias.length > 250) ||
    domains.length > MAX_AI_OBSERVATION_DOMAINS
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `Each target needs a label, at most ${MAX_AI_OBSERVATION_ALIASES} aliases, and at most ${MAX_AI_OBSERVATION_DOMAINS} domains.`,
    )
  }
  return { key, role, label, aliases: uniqueAliases, domains }
}

export function validateAiPromptObservationInput(input: {
  prompts: AiPromptInput[]
  models: AiPromptModelInput[]
  target: AiPromptTargetInput
  competitors?: AiPromptTargetInput[]
  market: AiPromptMarket
  provider?: ProviderId
  webSearch?: boolean
  maxOutputTokens?: number
  days?: number
}): ValidatedAiPromptInput {
  if (
    input.prompts.length < 1 ||
    input.prompts.length > MAX_AI_OBSERVATION_PROMPTS
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `AI prompt observations supports 1 to ${MAX_AI_OBSERVATION_PROMPTS} prompts per run.`,
    )
  }
  if (
    input.models.length < 1 ||
    input.models.length > MAX_AI_OBSERVATION_MODELS
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      `AI prompt observations supports 1 to ${MAX_AI_OBSERVATION_MODELS} model selections per run.`,
    )
  }
  const prompts = input.prompts.map(validatedPrompt)
  if (new Set(prompts.map((prompt) => prompt.id)).size !== prompts.length) {
    throw new SeoError('INVALID_INPUT', 'Use each prompt id once.')
  }
  const models = input.models.map((item) => {
    const surface = aiPromptSurfaceSchema.safeParse(item.surface)
    const model = compact(item.model)
    if (!surface.success || !model || model.length > 200) {
      throw new SeoError(
        'INVALID_INPUT',
        'Each model selection needs a supported surface and a current provider model name.',
      )
    }
    return { surface: surface.data, model }
  })
  const modelKeys = models.map((item) => `${item.surface}:${item.model}`)
  if (new Set(modelKeys).size !== modelKeys.length) {
    throw new SeoError('INVALID_INPUT', 'Use each surface and model pair once.')
  }
  const competitors = input.competitors ?? []
  if (competitors.length > MAX_AI_OBSERVATION_COMPETITORS) {
    throw new SeoError(
      'INVALID_INPUT',
      `AI prompt observations supports at most ${MAX_AI_OBSERVATION_COMPETITORS} competitors.`,
    )
  }
  const targets = [
    validatedTarget(input.target, 'target', 'target'),
    ...competitors.map((item, index) =>
      validatedTarget(item, `competitor-${index + 1}`, 'competitor'),
    ),
  ]
  const targetLabels = targets.map((item) =>
    item.label.toLocaleLowerCase('en-US'),
  )
  if (new Set(targetLabels).size !== targetLabels.length) {
    throw new SeoError('INVALID_INPUT', 'Use each target label once.')
  }
  const market = aiPromptMarketSchema.safeParse(input.market)
  if (!market.success) {
    throw new SeoError('INVALID_INPUT', 'Use a valid AI prompt market.')
  }
  const provider = input.provider
    ? providerIdSchema.safeParse(input.provider)
    : undefined
  if (provider && !provider.success) {
    throw new SeoError('INVALID_INPUT', 'Use a supported research provider.')
  }
  const maxOutputTokens = input.maxOutputTokens ?? 2_048
  if (
    !Number.isSafeInteger(maxOutputTokens) ||
    maxOutputTokens < 1 ||
    maxOutputTokens > 4_096
  ) {
    throw new SeoError(
      'INVALID_INPUT',
      'Maximum output tokens must be a whole number from 1 to 4096.',
    )
  }
  const days = input.days ?? 28
  if (!Number.isSafeInteger(days) || days < 1 || days > 548) {
    throw new SeoError(
      'INVALID_INPUT',
      'Search Console days must be a whole number from 1 to 548.',
    )
  }
  const webSearch = input.webSearch ?? true
  if (!webSearch && models.some((item) => item.surface === 'perplexity')) {
    throw new SeoError(
      'INVALID_INPUT',
      'Perplexity observations require web search because its supported models use web search by default.',
    )
  }
  const requestCount = prompts.length * models.length
  if (requestCount > MAX_AI_OBSERVATION_REQUESTS) {
    throw new SeoError(
      'INVALID_INPUT',
      `These prompt and model combinations would start ${requestCount} paid requests. The per-run limit is ${MAX_AI_OBSERVATION_REQUESTS}.`,
    )
  }
  return {
    prompts,
    models,
    targets,
    market: market.data,
    provider: provider?.data,
    webSearch,
    maxOutputTokens,
    days,
    requestCount,
  }
}
