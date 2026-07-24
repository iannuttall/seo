import type { ProviderEvidence } from '../contracts.js'
import type {
  RankingPage,
  RankingPagePage,
  RankingPagesRequest,
} from '../domain-contracts.js'
import { ProviderError } from '../errors.js'
import type { AhrefsClient } from './client.js'
import { ahrefsTopPagesResponseSchema } from './schema.js'
import {
  apiDate,
  compareCodepoints,
  coverage,
  dedupeBy,
  domain,
  evidence,
  freeTestValue,
  marketCountry,
  observedNumber,
  organicFootprint,
  requestContext,
  rowLimit,
  safeUrl,
} from './shared.js'

const ENDPOINT = 'site-explorer/top-pages'
const SELECT = 'url,keywords,sum_traffic,value'
const PER_ROW_UNITS = 22
const ORDER_BY = 'sum_traffic:desc,keywords:desc,url:asc'

function nonnegative(
  value: number | undefined,
  field: string,
  label: string,
): Record<string, unknown> | null {
  if (value === undefined) return null
  if (!Number.isFinite(value) || value < 0) {
    throw new ProviderError({
      provider: 'ahrefs',
      operation: 'ranking-pages',
      code: 'configuration',
      message: `${label} must be nonnegative.`,
    })
  }
  return { field, is: ['gte', value] }
}

function where(input: RankingPagesRequest): string | null {
  const filters = [
    nonnegative(
      input.minEstimatedTraffic,
      'sum_traffic',
      'Minimum estimated traffic',
    ),
    nonnegative(input.minRankedKeywords, 'keywords', 'Minimum ranked keywords'),
  ].filter((value): value is Record<string, unknown> => value !== null)
  return filters.length ? JSON.stringify({ and: filters }) : null
}

export async function ahrefsRankingPages(
  client: Pick<AhrefsClient, 'request'>,
  input: RankingPagesRequest,
  now: () => Date,
): Promise<ProviderEvidence<RankingPagePage>> {
  rowLimit(input.limit, input.offset, 'ranking-pages')
  const target = domain(input.domain, 'ranking-pages')
  const country = marketCountry(input.market, 'ranking-pages')
  const date = apiDate(now)
  const providerWhere = where(input)
  const snapshot = await client.request({
    operation: 'ranking-pages',
    capability: 'relevant-pages',
    path: ENDPOINT,
    query: {
      country,
      date,
      limit: input.limit,
      mode: 'subdomains',
      order_by: ORDER_BY,
      select: SELECT,
      target,
      volume_mode: 'average',
      ...(providerWhere ? { where: providerWhere } : {}),
    },
    schema: ahrefsTopPagesResponseSchema,
    requestedRows: input.limit,
    perRowUnits: PER_ROW_UNITS,
    rowCount: (response) => response.pages.length,
    free: freeTestValue(target),
    refresh: input.refresh,
    context: requestContext('ranking-pages', input.context),
  })

  let invalidRows = 0
  const mapped = snapshot.response.pages.flatMap((row): RankingPage[] => {
    const url = safeUrl(row.url)
    if (!url) {
      invalidRows += 1
      return []
    }
    return [
      {
        url,
        organic: organicFootprint({
          traffic: row.sum_traffic,
          keywords: row.keywords,
          costCents: row.value,
        }),
      },
    ]
  })
  const rows = dedupeBy(mapped, (row) => row.url).sort(
    (left, right) =>
      observedNumber(right.organic.estimatedMonthlyTraffic) -
        observedNumber(left.organic.estimatedMonthlyTraffic) ||
      observedNumber(right.organic.rankedKeywords) -
        observedNumber(left.organic.rankedKeywords) ||
      compareCodepoints(left.url, right.url),
  )
  const duplicateRows = mapped.length - rows.length

  return evidence({
    capability: 'relevant-pages',
    data: { domain: target, rows, totalRows: null },
    market: input.market,
    snapshot,
    coverage: coverage({
      requestedRows: input.limit,
      returnedRows: snapshot.returnedRows,
      retainedRows: rows.length,
      invalidRows,
      filtered: Boolean(providerWhere),
    }),
    endpoint: ENDPOINT,
    limit: input.limit,
    filters: {
      apiVersion: 3,
      country,
      date,
      minEstimatedTraffic: input.minEstimatedTraffic ?? 0,
      minRankedKeywords: input.minRankedKeywords ?? 0,
      mode: 'subdomains',
      selectedFields: SELECT,
      volumeMode: 'average',
    },
    sort: [
      'estimatedMonthlyTraffic:descending',
      'rankedKeywords:descending',
      'url:codepoint-ascending',
    ],
    warnings: [
      ...(invalidRows
        ? [
            {
              code: 'invalid-ranking-page-rows',
              field: 'data.rows',
              message: `Ahrefs returned ${invalidRows} ranking-page row${invalidRows === 1 ? '' : 's'} without a valid URL.`,
            },
          ]
        : []),
      ...(duplicateRows
        ? [
            {
              code: 'duplicate-ranking-page-rows',
              field: 'data.rows',
              message: `${duplicateRows} duplicate ranking-page row${duplicateRows === 1 ? '' : 's'} were collapsed deterministically.`,
            },
          ]
        : []),
    ],
  })
}
