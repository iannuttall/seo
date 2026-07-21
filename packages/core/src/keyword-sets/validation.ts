import { z } from 'zod'
import { SeoError } from '../errors.js'
import { providerIdSchema } from '../providers/contracts.js'
import { KEYWORD_SET_FIELD_LIMITS, KEYWORD_SET_LIMITS } from './limits.js'
import type {
  KeywordSetMutationItem,
  KeywordSetPageMapping,
  SavedKeywordMetric,
} from './types.js'

const unavailableValueSchema = z.strictObject({
  state: z.enum(['missing', 'unavailable', 'invalid']),
  value: z.null(),
  reason: z.string().min(1).max(500),
})

const providerValueNumberSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('observed'), value: z.number().finite() }),
  unavailableValueSchema,
])

const providerValueStringSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('observed'), value: z.string().max(500) }),
  unavailableValueSchema,
])

const monthlySearchSchema = z.strictObject({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  searchVolume: z.number().finite().nonnegative(),
})

const providerValueMonthlySearchesSchema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('observed'),
    value: z.array(monthlySearchSchema).max(24),
  }),
  unavailableValueSchema,
])

const keywordMetricSchema = z.strictObject({
  keyword: z.string().min(1).max(KEYWORD_SET_FIELD_LIMITS.keyword),
  monthlySearchVolume: providerValueNumberSchema,
  monthlySearches: providerValueMonthlySearchesSchema,
  searchVolumeUpdatedAt: providerValueStringSchema,
  cpcUsd: providerValueNumberSchema,
  paidCompetition: providerValueNumberSchema,
  keywordDifficulty: providerValueNumberSchema,
  intent: providerValueStringSchema,
  resultCount: providerValueNumberSchema,
})

export const savedMetricSchema = z.strictObject({
  schemaVersion: z.literal(1),
  provider: providerIdSchema,
  observedAt: z.iso.datetime(),
  metric: keywordMetricSchema,
})

export type ValidatedMutationItem = {
  keyword: string
  tags: string[]
  page: KeywordSetPageMapping | null | undefined
  metric: SavedKeywordMetric | null | undefined
  metricJson: string | null
}

export function invalid(message: string): never {
  throw new SeoError('INVALID_INPUT', message)
}

export function boundedText(value: string, label: string, max: number): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > max) {
    invalid(`${label} must contain 1 to ${max} characters.`)
  }
  return normalized
}

export function normalizeSavedKeyword(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, ' ').toLowerCase()
  if (
    !normalized ||
    normalized.length > KEYWORD_SET_FIELD_LIMITS.keyword ||
    normalized.split(' ').length > KEYWORD_SET_FIELD_LIMITS.keywordWords
  ) {
    invalid(
      `Keywords must contain 1 to ${KEYWORD_SET_FIELD_LIMITS.keyword} characters and at most ${KEYWORD_SET_FIELD_LIMITS.keywordWords} words.`,
    )
  }
  return normalized
}

function displayKeyword(value: string): string {
  normalizeSavedKeyword(value)
  return value.trim().replace(/\s+/gu, ' ')
}

function normalizedTags(values: string[] = []): string[] {
  if (values.length > KEYWORD_SET_LIMITS.tagsPerKeyword) {
    invalid(
      `A keyword can have at most ${KEYWORD_SET_LIMITS.tagsPerKeyword} tags.`,
    )
  }
  const tags = [
    ...new Set(
      values.map((value) =>
        boundedText(value, 'Tag', KEYWORD_SET_FIELD_LIMITS.tag).toLowerCase(),
      ),
    ),
  ].sort()
  if (tags.length > KEYWORD_SET_LIMITS.tagsPerKeyword) {
    invalid(
      `A keyword can have at most ${KEYWORD_SET_LIMITS.tagsPerKeyword} tags.`,
    )
  }
  return tags
}

function pageMapping(
  value: KeywordSetPageMapping | null | undefined,
): KeywordSetPageMapping | null | undefined {
  if (value === null || value === undefined) return value
  if (value.kind !== 'target' && value.kind !== 'proposed') {
    invalid('Page mapping kind must be target or proposed.')
  }
  const raw = boundedText(value.url, 'Page URL', KEYWORD_SET_FIELD_LIMITS.url)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    invalid('Page mapping must use an absolute HTTP or HTTPS URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    invalid('Page mapping must use an absolute HTTP or HTTPS URL.')
  }
  return { kind: value.kind, url: url.toString() }
}

function savedMetric(
  value: SavedKeywordMetric | null | undefined,
  normalizedKeyword: string,
): { value: SavedKeywordMetric | null | undefined; json: string | null } {
  if (value === null || value === undefined) {
    return { value, json: null }
  }
  const parsed = savedMetricSchema.safeParse(value)
  if (!parsed.success)
    invalid('Use a valid normalized keyword metric snapshot.')
  if (normalizeSavedKeyword(parsed.data.metric.keyword) !== normalizedKeyword) {
    invalid('A saved metric must describe the same keyword as the set item.')
  }
  const json = JSON.stringify(parsed.data)
  if (Buffer.byteLength(json) > KEYWORD_SET_FIELD_LIMITS.metricJsonBytes) {
    invalid(
      `A saved keyword metric cannot exceed ${KEYWORD_SET_FIELD_LIMITS.metricJsonBytes} bytes.`,
    )
  }
  return { value: parsed.data as SavedKeywordMetric, json }
}

export function validateMutationItems(
  items: KeywordSetMutationItem[],
): Map<string, ValidatedMutationItem> {
  if (items.length < 1 || items.length > KEYWORD_SET_LIMITS.mutationKeywords) {
    invalid(
      `Add 1 to ${KEYWORD_SET_LIMITS.mutationKeywords} keywords per operation.`,
    )
  }
  const normalized = new Map<string, ValidatedMutationItem>()
  for (const item of items) {
    const key = normalizeSavedKeyword(item.keyword)
    const existing = normalized.get(key)
    const tags = normalizedTags([
      ...(existing?.tags ?? []),
      ...(item.tags ?? []),
    ])
    const page = pageMapping(
      item.page !== undefined ? item.page : existing?.page,
    )
    const metric = savedMetric(
      item.latestMetric !== undefined ? item.latestMetric : existing?.metric,
      key,
    )
    normalized.set(key, {
      keyword: existing?.keyword ?? displayKeyword(item.keyword),
      tags,
      page,
      metric: metric.value,
      metricJson: metric.json,
    })
  }
  return normalized
}

export function parseStoredJson<T>(
  value: string,
  schema: z.ZodType<T>,
  label: string,
): T {
  let decoded: unknown
  try {
    decoded = JSON.parse(value)
  } catch {
    throw new SeoError('INTERNAL_ERROR', `${label} contains invalid JSON.`)
  }
  const parsed = schema.safeParse(decoded)
  if (!parsed.success) {
    throw new SeoError('INTERNAL_ERROR', `${label} has an invalid shape.`)
  }
  return parsed.data
}
