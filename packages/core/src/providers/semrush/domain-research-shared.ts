import type {
  ProviderCacheEvidence,
  ProviderCostEvidence,
  ProviderCoverage,
  ProviderEvidence,
  ProviderValue,
  ProviderWarning,
  SearchMarket,
} from '../contracts.js'
import { unavailableValue } from '../contracts.js'
import type {
  OrganicFootprint,
  RankingDistribution,
} from '../domain-contracts.js'
import { ProviderError } from '../errors.js'
import type { SemrushReportSnapshot } from './client.js'
import { compareCodepoints, semrushNumber } from './mapping.js'
import { semrushMarketWarnings } from './market.js'

export const MAX_DOMAIN_ROWS = 1_000
export const MAX_DOMAIN_OFFSET = 100_000

export function domain(value: string, operation = 'domain-research'): string {
  const raw = value.trim().toLowerCase()
  let url: URL
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    throw invalidDomain(operation)
  }
  const hostname = url.hostname.replace(/^www\./u, '').replace(/\.$/u, '')
  if (
    !hostname ||
    hostname.length > 253 ||
    hostname.includes('..') ||
    !hostname.includes('.') ||
    !/^[a-z0-9.-]+$/u.test(hostname)
  ) {
    throw invalidDomain(operation)
  }
  return hostname
}

function invalidDomain(operation: string): ProviderError {
  return new ProviderError({
    provider: 'semrush',
    operation,
    code: 'configuration',
    message: 'Use a valid domain.',
  })
}

export function safeUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.username = ''
    url.password = ''
    return url.toString()
  } catch {
    return null
  }
}

export function rowLimit(
  limit: number,
  offset: number,
  operation: string,
): void {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_DOMAIN_ROWS ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > MAX_DOMAIN_OFFSET ||
    limit + offset > 1_000_000
  ) {
    throw new ProviderError({
      provider: 'semrush',
      operation,
      code: 'configuration',
      message: `Semrush domain research requires a limit from 1 to ${MAX_DOMAIN_ROWS} and an offset from 0 to ${MAX_DOMAIN_OFFSET}.`,
    })
  }
}

export function organicOnly(
  resultTypes: string[] | undefined,
  operation: string,
): void {
  const types = [...new Set(resultTypes ?? ['organic'])]
  if (types.length !== 1 || types[0] !== 'organic') {
    throw new ProviderError({
      provider: 'semrush',
      operation,
      code: 'configuration',
      message:
        'Semrush V3 domain research currently supports organic rows only.',
    })
  }
}

export function unavailable<T>(field: string): ProviderValue<T> {
  return unavailableValue(
    'unavailable',
    `This Semrush V3 report does not return ${field}.`,
  )
}

export function missing<T>(field: string): ProviderValue<T> {
  return unavailableValue('missing', `Semrush omitted ${field}.`)
}

export function organicFootprint(input: {
  traffic?: string
  keywords?: string
  cost?: string
}): OrganicFootprint {
  return {
    estimatedMonthlyTraffic: semrushNumber(
      input.traffic,
      'estimated organic monthly traffic',
      (value) => value >= 0,
    ),
    rankedKeywords: semrushNumber(
      input.keywords,
      'ranked organic keywords',
      (value) => Number.isSafeInteger(value) && value >= 0,
    ),
    estimatedMonthlyTrafficCostUsd: semrushNumber(
      input.cost,
      'estimated organic traffic cost',
      (value) => value >= 0,
    ),
    rankings: unavailable<RankingDistribution>('organic ranking distribution'),
    newRankings: unavailable<number>('new rankings'),
    improvedRankings: unavailable<number>('improved rankings'),
    declinedRankings: unavailable<number>('declined rankings'),
    lostRankings: unavailable<number>('lost rankings'),
  }
}

export function observedNumber(value: ProviderValue<number>): number {
  return value.state === 'observed' ? value.value : -1
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

export function coverage(input: {
  requestedRows: number
  returnedRows: number
  retainedRows: number
  invalidRows: number
  offset: number
  filtered: boolean
}): ProviderCoverage {
  const hasMore = input.returnedRows >= input.requestedRows
  return {
    requestedRows: input.requestedRows,
    returnedRows: input.returnedRows,
    retainedRows: input.retainedRows,
    invalidRows: input.invalidRows,
    providerTotalRows: null,
    completeness:
      input.invalidRows > 0
        ? 'partial'
        : hasMore
          ? 'capped'
          : input.filtered
            ? 'filtered'
            : 'complete',
    nextCursor: hasMore ? String(input.offset + input.returnedRows) : null,
  }
}

export function combinedCache(
  snapshots: SemrushReportSnapshot[],
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
  return { status: 'miss', storedAt: null, expiresAt: null }
}

function sumNullable(values: Array<number | null>): number | null {
  return values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + (value ?? 0), 0)
    : null
}

export function combinedCost(
  snapshots: SemrushReportSnapshot[],
): ProviderCostEvidence {
  const natives = snapshots.map((snapshot) => snapshot.cost.native)
  const remaining = natives
    .map((native) => native?.remainingBefore ?? null)
    .filter((value): value is number => value !== null)
  return {
    currency: 'USD',
    estimatedMicros: sumNullable(
      snapshots.map((snapshot) => snapshot.cost.estimatedMicros),
    ),
    actualMicros: sumNullable(
      snapshots.map((snapshot) => snapshot.cost.actualMicros),
    ),
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

export function mappedWarnings(
  market: SearchMarket,
  snapshot: SemrushReportSnapshot,
  invalidRows: number,
  rowLabel: string,
): ProviderWarning[] {
  return [
    ...snapshot.warnings,
    ...semrushMarketWarnings(market),
    ...(invalidRows
      ? [
          {
            code: `invalid-${rowLabel}-rows`,
            field: 'data.rows',
            message: `Semrush returned ${invalidRows} ${rowLabel} row${invalidRows === 1 ? '' : 's'} without the required fields.`,
          },
        ]
      : []),
  ]
}

export function evidence<T>(input: {
  capability: ProviderEvidence<T>['capability']
  data: T
  market: SearchMarket
  snapshot: SemrushReportSnapshot
  coverage: ProviderCoverage
  limit: number
  filters: Record<string, string | number | boolean>
  sort: string[]
  warnings: ProviderWarning[]
}): ProviderEvidence<T> {
  return {
    schemaVersion: 1,
    provider: 'semrush',
    capability: input.capability,
    data: input.data,
    observedAt: input.snapshot.observedAt,
    market: input.market,
    coverage: input.coverage,
    cache: input.snapshot.cache,
    cost: input.snapshot.cost,
    request: {
      operation: input.capability,
      endpoint: 'https://api.semrush.com/',
      limit: input.limit,
      filters: input.filters,
      sort: input.sort,
    },
    warnings: input.warnings,
  }
}
