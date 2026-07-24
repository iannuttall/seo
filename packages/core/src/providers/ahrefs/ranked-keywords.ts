import type { KeywordMetric, ProviderEvidence } from '../contracts.js'
import { observedValue } from '../contracts.js'
import type {
  RankedKeyword,
  RankedKeywordPage,
  RankedKeywordsRequest,
} from '../domain-contracts.js'
import { ProviderError } from '../errors.js'
import type { AhrefsClient } from './client.js'
import { ahrefsOrganicKeywordsResponseSchema } from './schema.js'
import {
  apiDate,
  centsValue,
  compareCodepoints,
  coverage,
  dedupeBy,
  domain,
  evidence,
  freeTestValue,
  marketCountry,
  missing,
  normalizedKeyword,
  observedNumber,
  organicOnly,
  requestContext,
  rowLimit,
  safeUrl,
  unavailable,
} from './shared.js'

const ENDPOINT = 'site-explorer/organic-keywords'
const SELECT =
  'keyword,best_position,best_position_kind,best_position_url,volume,cpc,keyword_difficulty,sum_traffic,is_branded,is_commercial,is_informational,is_local,is_navigational,is_transactional'
const PER_ROW_UNITS = 41
const ORDER_BY = 'best_position:asc,volume:desc,keyword:asc'
const INTENTS = [
  'informational',
  'navigational',
  'commercial',
  'transactional',
  'branded',
  'local',
] as const

type OrganicRow =
  (typeof ahrefsOrganicKeywordsResponseSchema)['_output']['keywords'][number]

function integerFilter(
  value: number | undefined,
  input: {
    field: string
    operator: 'gte' | 'lte'
    minimum: number
    maximum?: number
    label: string
  },
): Record<string, unknown> | null {
  if (value === undefined) return null
  if (
    !Number.isSafeInteger(value) ||
    value < input.minimum ||
    (input.maximum !== undefined && value > input.maximum)
  ) {
    throw new ProviderError({
      provider: 'ahrefs',
      operation: 'ranked-keywords',
      code: 'configuration',
      message: `${input.label} must be from ${input.minimum}${input.maximum === undefined ? ' upward' : ` to ${input.maximum}`}.`,
    })
  }
  return { field: input.field, is: [input.operator, value] }
}

function where(input: RankedKeywordsRequest): string {
  const filters: Record<string, unknown>[] = [
    { field: 'best_position_kind', is: ['eq', 'organic'] },
  ]
  const minVolume = integerFilter(input.minSearchVolume, {
    field: 'volume',
    operator: 'gte',
    minimum: 0,
    label: 'Minimum search volume',
  })
  const maxRank = integerFilter(input.maxRank, {
    field: 'best_position',
    operator: 'lte',
    minimum: 1,
    maximum: 100,
    label: 'Maximum rank',
  })
  if (minVolume) filters.push(minVolume)
  if (maxRank) filters.push(maxRank)

  const excluded = [
    ...new Set(
      (input.excludeTerms ?? []).map((term) =>
        normalizedKeyword(term, 'ranked-keywords'),
      ),
    ),
  ].sort(compareCodepoints)
  if (excluded.length > 5) {
    throw new ProviderError({
      provider: 'ahrefs',
      operation: 'ranked-keywords',
      code: 'configuration',
      message: 'Use at most 5 excluded terms.',
    })
  }
  filters.push(
    ...excluded.map((term) => ({
      not: { field: 'keyword', is: ['isubstring', term] },
    })),
  )
  return JSON.stringify({ and: filters })
}

function keywordMetric(row: OrganicRow, keyword: string): KeywordMetric {
  const intent = INTENTS.filter((name) => row[`is_${name}`])
  return {
    keyword,
    monthlySearchVolume:
      row.volume === null
        ? missing('monthly search volume')
        : observedValue(row.volume),
    monthlySearches: unavailable('monthly search history'),
    searchVolumeUpdatedAt: unavailable('the search-volume update time'),
    cpcUsd: centsValue(row.cpc, 'cost per click'),
    paidCompetition: unavailable('paid-search competition'),
    keywordDifficulty:
      row.keyword_difficulty === null
        ? missing('keyword difficulty')
        : observedValue(row.keyword_difficulty),
    intent:
      intent.length > 0
        ? observedValue(intent.join(','))
        : missing('keyword intent'),
    resultCount: unavailable('search result count'),
  }
}

export async function ahrefsRankedKeywords(
  client: Pick<AhrefsClient, 'request'>,
  input: RankedKeywordsRequest,
  now: () => Date,
): Promise<ProviderEvidence<RankedKeywordPage>> {
  organicOnly(input.resultTypes, 'ranked-keywords')
  rowLimit(input.limit, input.offset, 'ranked-keywords')
  const target = domain(input.target, 'ranked-keywords')
  const country = marketCountry(input.market, 'ranked-keywords')
  const date = apiDate(now)
  const mode = input.includeSubdomains === false ? 'domain' : 'subdomains'
  const providerWhere = where(input)
  const snapshot = await client.request({
    operation: 'ranked-keywords',
    capability: 'ranked-keywords',
    path: ENDPOINT,
    query: {
      country,
      date,
      limit: input.limit,
      mode,
      order_by: ORDER_BY,
      select: SELECT,
      target,
      volume_mode: 'average',
      where: providerWhere,
    },
    schema: ahrefsOrganicKeywordsResponseSchema,
    requestedRows: input.limit,
    perRowUnits: PER_ROW_UNITS,
    rowCount: (response) => response.keywords.length,
    free: freeTestValue(target),
    refresh: input.refresh,
    context: requestContext('ranked-keywords', input.context),
  })

  let invalidRows = 0
  const mapped = snapshot.response.keywords.flatMap((row): RankedKeyword[] => {
    let keyword: string
    try {
      keyword = normalizedKeyword(row.keyword ?? '', 'ranked-keywords')
    } catch {
      invalidRows += 1
      return []
    }
    const url = safeUrl(row.best_position_url)
    const rank = row.best_position
    if (
      !url ||
      !Number.isSafeInteger(rank) ||
      !rank ||
      rank < 1 ||
      rank > 100 ||
      row.best_position_kind !== 'organic'
    ) {
      invalidRows += 1
      return []
    }
    return [
      {
        ...keywordMetric(row, keyword),
        url,
        rankGroup: rank,
        rankAbsolute: rank,
        resultType: 'organic',
        estimatedMonthlyTraffic:
          row.sum_traffic === null
            ? missing('estimated monthly traffic')
            : observedValue(row.sum_traffic),
      },
    ]
  })
  const rows = dedupeBy(
    mapped,
    (row) => `${row.keyword}\0${row.url}\0${row.resultType}`,
  ).sort(
    (left, right) =>
      observedNumber(right.monthlySearchVolume) -
        observedNumber(left.monthlySearchVolume) ||
      left.rankGroup - right.rankGroup ||
      compareCodepoints(left.keyword, right.keyword) ||
      compareCodepoints(left.url, right.url),
  )
  const duplicateRows = mapped.length - rows.length

  return evidence({
    capability: 'ranked-keywords',
    data: { target, rows, totalRows: null },
    market: input.market,
    snapshot,
    coverage: coverage({
      requestedRows: input.limit,
      returnedRows: snapshot.returnedRows,
      retainedRows: rows.length,
      invalidRows,
      filtered: true,
    }),
    endpoint: ENDPOINT,
    limit: input.limit,
    filters: {
      apiVersion: 3,
      country,
      date,
      excludedTerms: input.excludeTerms?.length ?? 0,
      includeSubdomains: input.includeSubdomains ?? true,
      maxRank: input.maxRank ?? 100,
      minSearchVolume: input.minSearchVolume ?? 0,
      mode,
      resultTypes: 'organic',
      selectedFields: SELECT,
      volumeMode: 'average',
    },
    sort: [
      'monthlySearchVolume:descending',
      'rank:ascending',
      'keyword:codepoint-ascending',
    ],
    warnings: [
      ...(invalidRows
        ? [
            {
              code: 'invalid-ranked-keyword-rows',
              field: 'data.rows',
              message: `Ahrefs returned ${invalidRows} ranked-keyword row${invalidRows === 1 ? '' : 's'} without the required fields.`,
            },
          ]
        : []),
      ...(duplicateRows
        ? [
            {
              code: 'duplicate-ranked-keyword-rows',
              field: 'data.rows',
              message: `${duplicateRows} duplicate ranked-keyword row${duplicateRows === 1 ? '' : 's'} were collapsed deterministically.`,
            },
          ]
        : []),
    ],
  })
}
