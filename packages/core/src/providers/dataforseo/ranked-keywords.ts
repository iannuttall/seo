import type { ProviderEvidence } from '../contracts.js'
import type {
  RankedKeyword,
  RankedKeywordPage,
  RankedKeywordsRequest,
} from '../domain-contracts.js'
import { ProviderError } from '../errors.js'
import type { DomainResearchClient } from './domain-research-client.js'
import {
  coverage,
  DOMAIN_ENDPOINTS,
  dedupeBy,
  domainEvidence,
  duplicateWarning,
  mappedWarnings,
  numberValue,
  observedNumber,
  RANKED_RESULT_TYPES,
  rankedTarget,
  requestContext,
  researchMarket,
  resultTypes,
  rowLimit,
  safeUrl,
  totalRows,
} from './domain-research-shared.js'
import {
  compareCodepoints,
  locationRequest,
  metricForKeyword,
  normalizedKeyword,
} from './keyword-mapping.js'

function excludedTerms(input: RankedKeywordsRequest): string[] {
  const result = [...new Set(input.excludeTerms ?? [])]
    .map(normalizedKeyword)
    .filter(Boolean)
    .sort(compareCodepoints)
  if (result.length > 5 || result.some((term) => term.length > 80)) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ranked-keywords',
      code: 'configuration',
      message: 'Use at most 5 excluded terms of at most 80 characters.',
    })
  }
  return result
}

function filters(input: RankedKeywordsRequest, excluded: string[]): unknown[] {
  const result: unknown[] = []
  const add = (value: unknown[]) => {
    if (result.length) result.push('and')
    result.push(value)
  }
  if (input.minSearchVolume !== undefined) {
    if (
      !Number.isSafeInteger(input.minSearchVolume) ||
      input.minSearchVolume < 0
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'ranked-keywords',
        code: 'configuration',
        message: 'Minimum search volume must be a nonnegative integer.',
      })
    }
    add([
      'keyword_data.keyword_info.search_volume',
      '>=',
      input.minSearchVolume,
    ])
  }
  if (input.maxRank !== undefined) {
    if (
      !Number.isSafeInteger(input.maxRank) ||
      input.maxRank < 1 ||
      input.maxRank > 100
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'ranked-keywords',
        code: 'configuration',
        message: 'Maximum rank must be from 1 to 100.',
      })
    }
    add(['ranked_serp_element.serp_item.rank_group', '<=', input.maxRank])
  }
  for (const term of excluded) {
    add([
      'keyword_data.keyword',
      'not_ilike',
      `%${term.replace(/[\\%_]/gu, (match) => `\\${match}`)}%`,
    ])
  }
  if ((result.length + 1) / 2 > 8) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'ranked-keywords',
      code: 'configuration',
      message: 'Ranked keyword filters exceed the provider limit of 8.',
    })
  }
  return result
}

export async function dataForSeoRankedKeywords(
  client: DomainResearchClient,
  input: RankedKeywordsRequest,
): Promise<ProviderEvidence<RankedKeywordPage>> {
  const market = researchMarket(input.market, 'ranked-keywords')
  const target = rankedTarget(input.target)
  const offset = input.offset ?? 0
  rowLimit(input.limit, offset)
  const types = resultTypes(input.resultTypes, RANKED_RESULT_TYPES)
  const excluded = excludedTerms(input)
  const requestedFilters = filters(input, excluded)
  const orderBy = [
    'keyword_data.keyword_info.search_volume,desc',
    'ranked_serp_element.serp_item.rank_group,asc',
    'keyword_data.keyword,asc',
  ]
  const snapshot = await client.rankedKeywords({
    target,
    includeSubdomains: input.includeSubdomains ?? true,
    resultTypes: types,
    languageCode: market.languageCode.split('-')[0] as string,
    ...locationRequest(market, 'ranked-keywords'),
    filters: requestedFilters,
    orderBy,
    limit: input.limit,
    offset,
    refresh: input.refresh,
    context: requestContext('ranked-keywords', input.context),
  })
  const responseResults = snapshot.response.tasks.flatMap(
    (task) => task.result ?? [],
  )
  const rawRows = responseResults.flatMap((result) => result.items ?? [])
  let invalidRows = 0
  const mappedRows = rawRows.flatMap((row): RankedKeyword[] => {
    const keywordData = row.keyword_data
    const serp = row.ranked_serp_element?.serp_item
    const keyword = keywordData?.keyword
      ? normalizedKeyword(keywordData.keyword)
      : ''
    const url = safeUrl(serp?.url)
    if (
      !keywordData ||
      !keyword ||
      !url ||
      !serp?.rank_group ||
      !serp.rank_absolute ||
      !serp.type
    ) {
      invalidRows += 1
      return []
    }
    return [
      {
        ...metricForKeyword(keyword, [keywordData]),
        url,
        rankGroup: serp.rank_group,
        rankAbsolute: serp.rank_absolute,
        resultType: serp.type,
        estimatedMonthlyTraffic: numberValue(
          serp.etv,
          'estimated keyword traffic',
        ),
      },
    ]
  })
  const rows = dedupeBy(
    mappedRows,
    (row) => `${row.keyword}\0${row.url}\0${row.resultType}`,
  ).sort(
    (left, right) =>
      observedNumber(right.monthlySearchVolume) -
        observedNumber(left.monthlySearchVolume) ||
      left.rankGroup - right.rankGroup ||
      compareCodepoints(left.keyword, right.keyword) ||
      compareCodepoints(left.url, right.url),
  )
  const providerTotalRows = totalRows(
    responseResults.map((result) => result.total_count),
  )
  return domainEvidence({
    capability: 'ranked-keywords',
    data: { target, rows, totalRows: providerTotalRows },
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
    endpoint: DOMAIN_ENDPOINTS.keywords,
    limit: input.limit,
    filters: {
      includeSubdomains: input.includeSubdomains ?? true,
      resultTypes: types.join(','),
      minSearchVolume: input.minSearchVolume ?? 0,
      maxRank: input.maxRank ?? 100,
      excludeTerms: excluded.join(','),
      offset,
    },
    sort: orderBy,
    warnings: [
      ...mappedWarnings(
        market,
        snapshot.warnings,
        invalidRows,
        'ranked keyword',
      ),
      ...duplicateWarning(mappedRows.length, rows.length, 'ranked-keyword'),
    ],
  })
}
