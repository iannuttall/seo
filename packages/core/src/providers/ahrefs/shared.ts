import { randomUUID } from 'node:crypto'
import type {
  MarketIndependentProviderEvidence,
  ProviderCacheEvidence,
  ProviderCostEvidence,
  ProviderCoverage,
  ProviderEvidence,
  ProviderRequestContext,
  ProviderValue,
  ProviderWarning,
  SearchMarket,
} from '../contracts.js'
import { observedValue, unavailableValue } from '../contracts.js'
import type {
  OrganicFootprint,
  RankingDistribution,
} from '../domain-contracts.js'
import type { DomainRatingTargetMode } from '../domain-rating-contracts.js'
import { ProviderError } from '../errors.js'
import type { LinkTargetScope, ProviderLinkMetric } from '../link-contracts.js'
import type { AhrefsApiSnapshot } from './client.js'

export const AHREFS_API_BASE_URL = 'https://api.ahrefs.com/v3/'
export const AHREFS_MARKETS = [
  {
    searchEngines: ['google'] as const,
    devices: [] as const,
    location: 'country-only' as const,
  },
]
export const MAX_AHREFS_ROWS = 1_000
const FREE_TEST_VALUES = new Set([
  'ahrefs',
  'ahrefs.com',
  'firehose',
  'firehose.com',
  'yep',
  'yep.com',
])

export function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function apiDate(now: () => Date): string {
  return now().toISOString().slice(0, 10)
}

export function freeTestValue(value: string): boolean {
  return FREE_TEST_VALUES.has(value.toLowerCase())
}

export function normalizedKeyword(value: string, operation: string): string {
  const keyword = value.trim().replace(/\s+/gu, ' ').toLowerCase()
  if (
    !keyword ||
    keyword.length > 80 ||
    keyword.split(/\s+/u).length > 10 ||
    keyword.includes(',')
  ) {
    throw new ProviderError({
      provider: 'ahrefs',
      operation,
      code: 'configuration',
      message:
        'Ahrefs keywords must contain 1 to 80 characters, at most 10 words, and no commas.',
    })
  }
  return keyword
}

export function marketCountry(market: SearchMarket, operation: string): string {
  if (market.searchEngine !== 'google' || market.location || market.device) {
    throw new ProviderError({
      provider: 'ahrefs',
      operation,
      code: 'configuration',
      message:
        'Ahrefs research uses Google country-level data without a device or local location.',
    })
  }
  return market.countryCode.toLowerCase()
}

export function marketWarnings(market: SearchMarket): ProviderWarning[] {
  return [
    {
      code: 'ahrefs-country-level-market',
      field: 'market',
      message: `Ahrefs used Google country-level data for ${market.countryCode}; the requested ${market.languageCode} language was retained as context but was not a separate API filter.`,
    },
  ]
}

export function organicOnly(
  resultTypes: string[] | undefined,
  operation: string,
): void {
  const types = [...new Set(resultTypes ?? ['organic'])]
  if (types.length !== 1 || types[0] !== 'organic') {
    throw new ProviderError({
      provider: 'ahrefs',
      operation,
      code: 'configuration',
      message: 'Ahrefs domain research currently supports organic rows only.',
    })
  }
}

function invalidTarget(operation: string): ProviderError {
  return new ProviderError({
    provider: 'ahrefs',
    operation,
    code: 'configuration',
    message:
      'Use a valid domain, or choose URL mode and pass an absolute HTTP or HTTPS URL.',
  })
}

export function domain(value: string, operation: string): string {
  const raw = value.trim()
  if (!raw || raw.length > 2_048) throw invalidTarget(operation)
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^www\./u, '')
      .replace(/\.$/u, '')
    if (
      !hostname ||
      hostname.length > 253 ||
      hostname.includes('..') ||
      !hostname.includes('.') ||
      !/^[a-z0-9.-]+$/u.test(hostname)
    ) {
      throw new Error()
    }
    return hostname
  } catch {
    throw invalidTarget(operation)
  }
}

export function target(input: {
  value: string
  mode: DomainRatingTargetMode | LinkTargetScope
  operation: string
}): { target: string; mode: DomainRatingTargetMode } {
  if (input.mode === 'domain') {
    return { target: domain(input.value, input.operation), mode: 'domain' }
  }
  try {
    const url = new URL(input.value.trim())
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      input.value.length > 2_048
    ) {
      throw new Error()
    }
    url.hash = ''
    return { target: url.toString(), mode: 'url' }
  } catch {
    throw invalidTarget(input.operation)
  }
}

export function linkTarget(
  value: string,
  scope: LinkTargetScope = 'domain',
): { target: string; scope: LinkTargetScope; mode: string } {
  const normalized = target({
    value,
    mode: scope === 'page' ? 'url' : 'domain',
    operation: 'link-evidence',
  })
  return {
    target: normalized.target,
    scope,
    mode: scope === 'page' ? 'exact' : 'subdomains',
  }
}

export function rowLimit(
  limit: number,
  offset: number | undefined,
  operation: string,
): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_AHREFS_ROWS) {
    throw new ProviderError({
      provider: 'ahrefs',
      operation,
      code: 'configuration',
      message: `Ahrefs row limits must be from 1 to ${MAX_AHREFS_ROWS}.`,
    })
  }
  if (offset !== undefined && offset !== 0) {
    throw new ProviderError({
      provider: 'ahrefs',
      operation,
      code: 'configuration',
      message:
        'Ahrefs API v3 does not support row offsets. Use a narrower bounded request.',
    })
  }
}

export function observedNumber(value: ProviderValue<number>): number {
  return value.state === 'observed' ? value.value : -1
}

export function organicFootprint(input: {
  traffic?: number | null
  keywords?: number | null
  costCents?: number | null
}): OrganicFootprint {
  return {
    estimatedMonthlyTraffic: numberValue(
      input.traffic,
      'estimated organic monthly traffic',
    ),
    rankedKeywords: numberValue(input.keywords, 'ranked organic keywords'),
    estimatedMonthlyTrafficCostUsd: centsValue(
      input.costCents,
      'estimated organic traffic cost',
    ),
    rankings: unavailable<RankingDistribution>(
      'a complete organic ranking distribution',
    ),
    newRankings: unavailable<number>('new rankings'),
    improvedRankings: unavailable<number>('improved rankings'),
    declinedRankings: unavailable<number>('declined rankings'),
    lostRankings: unavailable<number>('lost rankings'),
  }
}

export function dedupeBy<T>(rows: T[], key: (row: T) => string): T[] {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const value = key(row)
    grouped.set(value, [...(grouped.get(value) ?? []), row])
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => compareCodepoints(left, right))
    .map(
      ([, matches]) =>
        [...matches].sort((left, right) =>
          compareCodepoints(JSON.stringify(left), JSON.stringify(right)),
        )[0] as T,
    )
}

type SnapshotEvidence = Pick<AhrefsApiSnapshot<unknown>, 'cache' | 'cost'>

export function combinedCache(
  snapshots: SnapshotEvidence[],
): ProviderCacheEvidence {
  if (snapshots.every((snapshot) => snapshot.cache.status === 'hit')) {
    const stored = snapshots
      .map((snapshot) => snapshot.cache.storedAt)
      .filter((value): value is string => Boolean(value))
      .sort(compareCodepoints)
    const expires = snapshots
      .map((snapshot) => snapshot.cache.expiresAt)
      .filter((value): value is string => Boolean(value))
      .sort(compareCodepoints)
    return {
      status: 'hit',
      storedAt: stored[0] ?? null,
      expiresAt: expires[0] ?? null,
    }
  }
  return {
    status: snapshots.every((snapshot) => snapshot.cache.status === 'bypass')
      ? 'bypass'
      : 'miss',
    storedAt: null,
    expiresAt: null,
  }
}

function sumNullable(values: Array<number | null>): number | null {
  return values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + (value ?? 0), 0)
    : null
}

export function combinedCost(
  snapshots: SnapshotEvidence[],
): ProviderCostEvidence {
  const natives = snapshots.map((snapshot) => snapshot.cost.native)
  const remaining = natives
    .map((native) => native?.remainingBefore ?? null)
    .filter((value): value is number => value !== null)
  return {
    currency: 'USD',
    estimatedMicros: null,
    actualMicros: null,
    taskIds: [],
    native: {
      unit: 'api-unit',
      estimatedUnits: sumNullable(
        natives.map((native) => native?.estimatedUnits ?? null),
      ),
      actualUnits: sumNullable(
        natives.map((native) => native?.actualUnits ?? null),
      ),
      remainingBefore: remaining.length ? Math.max(...remaining) : null,
    },
  }
}

export function requestContext(
  reportId: string,
  context: ProviderRequestContext | undefined,
): ProviderRequestContext {
  return context ?? { reportId, reportRunId: randomUUID() }
}

export function unavailable<T>(field: string): ProviderValue<T> {
  return unavailableValue(
    'unavailable',
    `The selected Ahrefs API fields do not return ${field}.`,
  )
}

export function missing<T>(field: string): ProviderValue<T> {
  return unavailableValue('missing', `Ahrefs omitted ${field}.`)
}

export function numberValue(
  value: number | null | undefined,
  field: string,
): ProviderValue<number> {
  return value === null || value === undefined
    ? missing(field)
    : observedValue(value)
}

export function centsValue(
  value: number | null | undefined,
  field: string,
): ProviderValue<number> {
  const number = numberValue(value, field)
  return number.state === 'observed'
    ? observedValue(number.value / 100)
    : number
}

export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.username = ''
    url.password = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export function normalizedDate(
  value: string | null | undefined,
): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

export function metric(
  id: string,
  label: string,
  value: number | null | undefined,
): ProviderLinkMetric[] {
  return value === null || value === undefined
    ? []
    : [
        {
          provider: 'ahrefs',
          id,
          label,
          value,
          scale: { minimum: 0, maximum: 100 },
        },
      ]
}

export function coverage(input: {
  requestedRows: number
  returnedRows: number
  retainedRows: number
  invalidRows: number
  filtered?: boolean
}): ProviderCoverage {
  const capped = input.returnedRows >= input.requestedRows
  return {
    requestedRows: input.requestedRows,
    returnedRows: input.returnedRows,
    retainedRows: input.retainedRows,
    invalidRows: input.invalidRows,
    providerTotalRows: null,
    completeness:
      input.invalidRows > 0
        ? 'partial'
        : capped
          ? 'capped'
          : input.filtered
            ? 'filtered'
            : 'complete',
    nextCursor: null,
  }
}

export function evidence<T>(input: {
  capability: ProviderEvidence<T>['capability']
  data: T
  market: SearchMarket
  snapshot: AhrefsApiSnapshot<unknown>
  coverage: ProviderCoverage
  endpoint: string
  limit: number
  filters: Record<string, string | number | boolean>
  sort: string[]
  warnings?: ProviderWarning[]
}): ProviderEvidence<T> {
  return {
    schemaVersion: 1,
    provider: 'ahrefs',
    capability: input.capability,
    data: input.data,
    observedAt: input.snapshot.observedAt,
    market: input.market,
    coverage: input.coverage,
    cache: input.snapshot.cache,
    cost: input.snapshot.cost,
    request: {
      operation: input.capability,
      endpoint: new URL(input.endpoint, AHREFS_API_BASE_URL).toString(),
      limit: input.limit,
      filters: input.filters,
      sort: input.sort,
    },
    warnings: [
      ...input.snapshot.warnings,
      ...marketWarnings(input.market),
      ...(input.warnings ?? []),
    ],
  }
}

export function marketIndependentEvidence<T>(input: {
  capability: MarketIndependentProviderEvidence<T>['capability']
  data: T
  snapshot: AhrefsApiSnapshot<unknown>
  coverage: ProviderCoverage
  endpoint: string
  limit: number
  filters: Record<string, string | number | boolean>
  sort: string[]
  warnings?: ProviderWarning[]
}): MarketIndependentProviderEvidence<T> {
  return {
    schemaVersion: 1,
    provider: 'ahrefs',
    capability: input.capability,
    data: input.data,
    observedAt: input.snapshot.observedAt,
    market: null,
    coverage: input.coverage,
    cache: input.snapshot.cache,
    cost: input.snapshot.cost,
    request: {
      operation: input.capability,
      endpoint: new URL(input.endpoint, AHREFS_API_BASE_URL).toString(),
      limit: input.limit,
      filters: input.filters,
      sort: input.sort,
    },
    warnings: [...input.snapshot.warnings, ...(input.warnings ?? [])],
  }
}
