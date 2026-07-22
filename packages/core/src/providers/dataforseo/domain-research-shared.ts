import { randomUUID } from 'node:crypto'
import type {
  ProviderCoverage,
  ProviderEvidence,
  ProviderValue,
  ProviderWarning,
  SearchMarket,
} from '../contracts.js'
import {
  observedValue,
  searchMarketSchema,
  unavailableValue,
} from '../contracts.js'
import type {
  DomainOverviewRequest,
  OrganicFootprint,
  RankingDistribution,
} from '../domain-contracts.js'
import { ProviderError } from '../errors.js'
import type {
  DataForSeoDomainOverviewSnapshot,
  DataForSeoRankedKeywordsSnapshot,
  DataForSeoRankingPagesSnapshot,
  DataForSeoSerpCompetitorsSnapshot,
} from './client.js'
import type { DataForSeoRankingMetrics } from './domain-schema.js'
import { compareCodepoints, marketWarnings } from './keyword-mapping.js'

export const MAX_DOMAIN_ROWS = 1_000
export const MAX_DOMAIN_OFFSET = 100_000
export const MAX_COMPETITOR_KEYWORDS = 200
export const DOMAIN_ENDPOINTS = {
  overview: 'v3/dataforseo_labs/google/domain_rank_overview/live',
  keywords: 'v3/dataforseo_labs/google/ranked_keywords/live',
  pages: 'v3/dataforseo_labs/google/relevant_pages/live',
  competitors: 'v3/dataforseo_labs/google/serp_competitors/live',
} as const
export const RANKED_RESULT_TYPES = new Set([
  'organic',
  'paid',
  'featured_snippet',
  'local_pack',
  'ai_overview_reference',
])
export const COMPETITOR_RESULT_TYPES = new Set([
  'organic',
  'paid',
  'featured_snippet',
  'local_pack',
])

export function missing<T>(field: string): ProviderValue<T> {
  return unavailableValue('missing', `DataForSEO omitted ${field}.`)
}

export function numberValue(
  value: number | null | undefined,
  field: string,
): ProviderValue<number> {
  return value === null || value === undefined
    ? missing(field)
    : observedValue(value)
}

export function countValue(
  value: number | null | undefined,
  field: string,
): ProviderValue<number> {
  return numberValue(value, field)
}

function sumBuckets(
  metrics: DataForSeoRankingMetrics,
  fields: Array<keyof DataForSeoRankingMetrics>,
  label: string,
): ProviderValue<number> {
  const values = fields.map(
    (field) => metrics[field] as number | null | undefined,
  )
  return values.some((value) => value === null || value === undefined)
    ? missing(label)
    : observedValue(
        values.reduce<number>(
          (sum, value) => sum + (typeof value === 'number' ? value : 0),
          0,
        ),
      )
}

function rankingDistribution(
  metrics: DataForSeoRankingMetrics | null | undefined,
): ProviderValue<RankingDistribution> {
  if (!metrics) return missing('organic ranking distribution')
  const buckets = {
    first: sumBuckets(metrics, ['pos_1'], 'position 1 rankings'),
    top3: sumBuckets(metrics, ['pos_1', 'pos_2_3'], 'top 3 rankings'),
    top10: sumBuckets(
      metrics,
      ['pos_1', 'pos_2_3', 'pos_4_10'],
      'top 10 rankings',
    ),
    top20: sumBuckets(
      metrics,
      ['pos_1', 'pos_2_3', 'pos_4_10', 'pos_11_20'],
      'top 20 rankings',
    ),
    top50: sumBuckets(
      metrics,
      [
        'pos_1',
        'pos_2_3',
        'pos_4_10',
        'pos_11_20',
        'pos_21_30',
        'pos_31_40',
        'pos_41_50',
      ],
      'top 50 rankings',
    ),
    top100: sumBuckets(
      metrics,
      [
        'pos_1',
        'pos_2_3',
        'pos_4_10',
        'pos_11_20',
        'pos_21_30',
        'pos_31_40',
        'pos_41_50',
        'pos_51_60',
        'pos_61_70',
        'pos_71_80',
        'pos_81_90',
        'pos_91_100',
      ],
      'top 100 rankings',
    ),
  }
  if (Object.values(buckets).some((bucket) => bucket.state !== 'observed')) {
    return unavailableValue(
      'missing',
      'DataForSEO omitted part of the organic ranking distribution.',
    )
  }
  return observedValue({
    first: buckets.first.value as number,
    top3: buckets.top3.value as number,
    top10: buckets.top10.value as number,
    top20: buckets.top20.value as number,
    top50: buckets.top50.value as number,
    top100: buckets.top100.value as number,
  })
}

export function organicFootprint(
  metrics: DataForSeoRankingMetrics | null | undefined,
): OrganicFootprint {
  return {
    estimatedMonthlyTraffic: numberValue(
      metrics?.etv,
      'estimated organic monthly traffic',
    ),
    rankedKeywords: countValue(metrics?.count, 'ranked organic keywords'),
    estimatedMonthlyTrafficCostUsd: numberValue(
      metrics?.estimated_paid_traffic_cost,
      'estimated organic traffic cost',
    ),
    rankings: rankingDistribution(metrics),
    newRankings: countValue(metrics?.is_new, 'new rankings'),
    improvedRankings: countValue(metrics?.is_up, 'improved rankings'),
    declinedRankings: countValue(metrics?.is_down, 'declined rankings'),
    lostRankings: countValue(metrics?.is_lost, 'lost rankings'),
  }
}

export function domain(value: string): string {
  const raw = value.trim().toLowerCase()
  let url: URL
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    throw invalidDomain()
  }
  const hostname = url.hostname.replace(/^www\./u, '').replace(/\.$/u, '')
  if (
    !hostname ||
    hostname.length > 253 ||
    hostname.includes('..') ||
    !hostname.includes('.') ||
    !/^[a-z0-9.-]+$/u.test(hostname)
  ) {
    throw invalidDomain()
  }
  return hostname
}

function invalidDomain(): ProviderError {
  return new ProviderError({
    provider: 'dataforseo',
    operation: 'domain-research',
    code: 'configuration',
    message: 'Use a valid domain.',
  })
}

export function rankedTarget(value: string): string {
  const raw = value.trim()
  if (!/^https?:\/\//iu.test(raw)) return domain(raw)
  try {
    const url = new URL(raw)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      raw.length > 2_048
    ) {
      throw new Error()
    }
    url.hash = ''
    return url.toString()
  } catch {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ranked-keywords',
      code: 'configuration',
      message: 'Use a valid domain or absolute page URL.',
    })
  }
}

export function researchMarket(
  input: SearchMarket,
  operation: string,
): SearchMarket {
  const parsed = searchMarketSchema.parse(input)
  if (parsed.searchEngine !== 'google' || parsed.location) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation,
      code: 'configuration',
      message:
        parsed.searchEngine !== 'google'
          ? 'DataForSEO domain research currently supports Google.'
          : 'DataForSEO Labs domain research uses country-level markets. Omit market.location.',
    })
  }
  return parsed
}

export function rowLimit(limit: number, offset = 0): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_DOMAIN_ROWS) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'domain-research',
      code: 'configuration',
      message: `Domain research limit must be from 1 to ${MAX_DOMAIN_ROWS}.`,
    })
  }
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > MAX_DOMAIN_OFFSET
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'domain-research',
      code: 'configuration',
      message: `Domain research offset must be from 0 to ${MAX_DOMAIN_OFFSET}.`,
    })
  }
}

export function resultTypes(
  input: string[] | undefined,
  allowed: Set<string>,
): string[] {
  const normalized = [...new Set(input ?? ['organic'])].sort(compareCodepoints)
  if (
    normalized.length < 1 ||
    normalized.length > allowed.size ||
    normalized.some((item) => !allowed.has(item))
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'domain-research',
      code: 'configuration',
      message: 'Choose supported domain research result types.',
    })
  }
  return normalized
}

export function safeUrl(value: string | null | undefined): string | null {
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

export function observedNumber(value: ProviderValue<number>): number {
  return value.state === 'observed' ? value.value : -1
}

export function duplicateWarning(
  available: number,
  retained: number,
  label: string,
): ProviderWarning[] {
  const duplicates = available - retained
  return duplicates > 0
    ? [
        {
          code: `duplicate-${label}-rows`,
          field: 'data.rows',
          message: `${duplicates} duplicate ${label} row${duplicates === 1 ? '' : 's'} were collapsed deterministically.`,
        },
      ]
    : []
}

export function totalRows(
  values: Array<number | null | undefined>,
): number | null {
  const present = values.filter(
    (value): value is number => value !== null && value !== undefined,
  )
  return present.length ? Math.max(...present) : null
}

export function coverage(input: {
  requestedRows: number
  returnedRows: number
  retainedRows: number
  invalidRows: number
  providerTotalRows: number | null
  offset: number
  filtered: boolean
}): ProviderCoverage {
  const hasMore =
    input.providerTotalRows !== null
      ? input.offset + input.returnedRows < input.providerTotalRows
      : input.returnedRows >= input.requestedRows
  return {
    requestedRows: input.requestedRows,
    returnedRows: input.returnedRows,
    retainedRows: input.retainedRows,
    invalidRows: input.invalidRows,
    providerTotalRows: input.providerTotalRows,
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

export function requestContext(
  reportId: string,
  supplied: DomainOverviewRequest['context'],
) {
  return supplied ?? { reportId, reportRunId: randomUUID() }
}

export function mappedWarnings(
  marketValue: SearchMarket,
  snapshotWarnings: ProviderWarning[],
  invalidRows: number,
  rowLabel: string,
): ProviderWarning[] {
  return [
    ...marketWarnings(marketValue),
    ...snapshotWarnings,
    ...(invalidRows
      ? [
          {
            code: `invalid-${rowLabel}-rows`,
            field: 'data.rows',
            message: `DataForSEO returned ${invalidRows} ${rowLabel} row${invalidRows === 1 ? '' : 's'} without the required fields.`,
          },
        ]
      : []),
  ]
}

type DomainSnapshot =
  | DataForSeoDomainOverviewSnapshot
  | DataForSeoRankedKeywordsSnapshot
  | DataForSeoRankingPagesSnapshot
  | DataForSeoSerpCompetitorsSnapshot

export function domainEvidence<T>(input: {
  capability: ProviderEvidence<T>['capability']
  data: T
  market: SearchMarket
  snapshot: DomainSnapshot
  coverage: ProviderCoverage
  endpoint: string
  limit: number
  filters: Record<string, string | number | boolean>
  sort: string[]
  warnings: ProviderWarning[]
}): ProviderEvidence<T> {
  return {
    schemaVersion: 1,
    provider: 'dataforseo',
    capability: input.capability,
    data: input.data,
    observedAt: input.snapshot.observedAt,
    market: input.market,
    coverage: input.coverage,
    cache: input.snapshot.cache,
    cost: input.snapshot.cost,
    request: {
      operation: input.capability,
      endpoint: input.endpoint,
      limit: input.limit,
      filters: input.filters,
      sort: input.sort,
    },
    warnings: input.warnings,
  }
}
