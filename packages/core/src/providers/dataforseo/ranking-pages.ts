import type { ProviderEvidence } from '../contracts.js'
import type {
  RankingPage,
  RankingPagePage,
  RankingPagesRequest,
} from '../domain-contracts.js'
import { ProviderError } from '../errors.js'
import type { DomainResearchClient } from './domain-research-client.js'
import {
  coverage,
  DOMAIN_ENDPOINTS,
  dedupeBy,
  domain,
  domainEvidence,
  duplicateWarning,
  mappedWarnings,
  observedNumber,
  organicFootprint,
  requestContext,
  researchMarket,
  rowLimit,
  safeUrl,
  totalRows,
} from './domain-research-shared.js'
import { compareCodepoints, locationRequest } from './keyword-mapping.js'

function filters(input: RankingPagesRequest): unknown[] {
  const result: unknown[] = []
  const add = (value: unknown[]) => {
    if (result.length) result.push('and')
    result.push(value)
  }
  if (input.minEstimatedTraffic !== undefined) {
    if (
      !Number.isFinite(input.minEstimatedTraffic) ||
      input.minEstimatedTraffic < 0
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'ranking-pages',
        code: 'configuration',
        message: 'Minimum estimated traffic must be nonnegative.',
      })
    }
    add(['metrics.organic.etv', '>=', input.minEstimatedTraffic])
  }
  if (input.minRankedKeywords !== undefined) {
    if (
      !Number.isSafeInteger(input.minRankedKeywords) ||
      input.minRankedKeywords < 0
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'ranking-pages',
        code: 'configuration',
        message: 'Minimum ranked keywords must be a nonnegative integer.',
      })
    }
    add(['metrics.organic.count', '>=', input.minRankedKeywords])
  }
  return result
}

export async function dataForSeoRankingPages(
  client: DomainResearchClient,
  input: RankingPagesRequest,
): Promise<ProviderEvidence<RankingPagePage>> {
  const market = researchMarket(input.market, 'ranking-pages')
  const target = domain(input.domain)
  const offset = input.offset ?? 0
  rowLimit(input.limit, offset)
  const requestedFilters = filters(input)
  const orderBy = ['metrics.organic.etv,desc', 'page_address,asc']
  const snapshot = await client.rankingPages({
    target,
    languageCode: market.languageCode.split('-')[0] as string,
    ...locationRequest(market, 'ranking-pages'),
    filters: requestedFilters,
    orderBy,
    limit: input.limit,
    offset,
    refresh: input.refresh,
    context: requestContext('ranking-pages', input.context),
  })
  const responseResults = snapshot.response.tasks.flatMap(
    (task) => task.result ?? [],
  )
  const rawRows = responseResults.flatMap((result) => result.items ?? [])
  let invalidRows = 0
  const mappedRows = rawRows.flatMap((row): RankingPage[] => {
    const url = safeUrl(row.page_address)
    if (!url) {
      invalidRows += 1
      return []
    }
    return [{ url, organic: organicFootprint(row.metrics?.organic) }]
  })
  const rows = dedupeBy(mappedRows, (row) => row.url).sort(
    (left, right) =>
      observedNumber(right.organic.estimatedMonthlyTraffic) -
        observedNumber(left.organic.estimatedMonthlyTraffic) ||
      compareCodepoints(left.url, right.url),
  )
  const providerTotalRows = totalRows(
    responseResults.map((result) => result.total_count),
  )
  return domainEvidence({
    capability: 'relevant-pages',
    data: { domain: target, rows, totalRows: providerTotalRows },
    market,
    snapshot,
    coverage: coverage({
      requestedRows: input.limit,
      returnedRows: rawRows.length,
      retainedRows: rows.length,
      invalidRows,
      providerTotalRows,
      offset,
      filtered: requestedFilters.length > 0,
    }),
    endpoint: DOMAIN_ENDPOINTS.pages,
    limit: input.limit,
    filters: {
      minEstimatedTraffic: input.minEstimatedTraffic ?? 0,
      minRankedKeywords: input.minRankedKeywords ?? 0,
      offset,
    },
    sort: orderBy,
    warnings: [
      ...mappedWarnings(market, snapshot.warnings, invalidRows, 'ranking page'),
      ...duplicateWarning(mappedRows.length, rows.length, 'ranking-page'),
    ],
  })
}
