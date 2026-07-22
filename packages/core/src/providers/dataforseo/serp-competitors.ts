import type { ProviderEvidence } from '../contracts.js'
import type {
  SerpCompetitor,
  SerpCompetitorSet,
  SerpCompetitorsRequest,
} from '../domain-contracts.js'
import { ProviderError } from '../errors.js'
import type { DomainResearchClient } from './domain-research-client.js'
import {
  COMPETITOR_RESULT_TYPES,
  countValue,
  coverage,
  DOMAIN_ENDPOINTS,
  dedupeBy,
  domain,
  domainEvidence,
  duplicateWarning,
  MAX_COMPETITOR_KEYWORDS,
  mappedWarnings,
  numberValue,
  observedNumber,
  requestContext,
  researchMarket,
  resultTypes,
  rowLimit,
  totalRows,
} from './domain-research-shared.js'
import {
  compareCodepoints,
  locationRequest,
  normalizedKeyword,
} from './keyword-mapping.js'

function keywords(input: string[]): string[] {
  const result = [...new Set(input.map(normalizedKeyword))]
    .filter(Boolean)
    .sort(compareCodepoints)
  if (
    result.length < 1 ||
    result.length > MAX_COMPETITOR_KEYWORDS ||
    result.some(
      (keyword) => keyword.length > 80 || keyword.split(/\s+/u).length > 10,
    )
  ) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'serp-competitors',
      code: 'configuration',
      message:
        'SERP competitors requires 1 to 200 keywords of at most 80 characters and 10 words.',
    })
  }
  return result
}

export async function dataForSeoSerpCompetitors(
  client: DomainResearchClient,
  input: SerpCompetitorsRequest,
): Promise<ProviderEvidence<SerpCompetitorSet>> {
  const market = researchMarket(input.market, 'serp-competitors')
  const offset = input.offset ?? 0
  rowLimit(input.limit, offset)
  const requestedKeywords = keywords(input.keywords)
  const types = resultTypes(input.resultTypes, COMPETITOR_RESULT_TYPES)
  const orderBy = ['visibility,desc', 'keywords_count,desc', 'domain,asc']
  const snapshot = await client.serpCompetitors({
    keywords: requestedKeywords,
    includeSubdomains: input.includeSubdomains ?? false,
    resultTypes: types,
    languageCode: market.languageCode.split('-')[0] as string,
    ...locationRequest(market, 'serp-competitors'),
    orderBy,
    limit: input.limit,
    offset,
    refresh: input.refresh,
    context: requestContext('serp-competitors', input.context),
  })
  const responseResults = snapshot.response.tasks.flatMap(
    (task) => task.result ?? [],
  )
  const rawRows = responseResults.flatMap((result) => result.items ?? [])
  let invalidRows = 0
  const mappedRows = rawRows.flatMap((row): SerpCompetitor[] => {
    let normalizedDomain = ''
    try {
      normalizedDomain = row.domain ? domain(row.domain) : ''
    } catch {
      normalizedDomain = ''
    }
    if (
      !normalizedDomain ||
      row.keywords_count === null ||
      row.keywords_count === undefined ||
      row.keywords_count > requestedKeywords.length
    ) {
      invalidRows += 1
      return []
    }
    const keywordPositions = Object.entries(row.keywords_positions ?? {})
      .map(([keyword, positions]) => ({
        keyword: normalizedKeyword(keyword),
        positions: [...new Set(positions)].sort((left, right) => left - right),
      }))
      .filter((item) => item.keyword)
      .sort((left, right) => compareCodepoints(left.keyword, right.keyword))
    return [
      {
        domain: normalizedDomain,
        matchedKeywords: row.keywords_count,
        averagePosition: numberValue(row.avg_position, 'average position'),
        medianPosition: numberValue(row.median_position, 'median position'),
        visibility: numberValue(row.visibility, 'visibility'),
        estimatedMonthlyTraffic: numberValue(
          row.etv,
          'estimated monthly traffic',
        ),
        relevantResults: countValue(
          row.relevant_serp_items,
          'relevant result count',
        ),
        keywordPositions,
      },
    ]
  })
  const rows = dedupeBy(mappedRows, (row) => row.domain).sort(
    (left, right) =>
      observedNumber(right.visibility) - observedNumber(left.visibility) ||
      right.matchedKeywords - left.matchedKeywords ||
      compareCodepoints(left.domain, right.domain),
  )
  const providerTotalRows = totalRows(
    responseResults.map((result) => result.total_count),
  )
  return domainEvidence({
    capability: 'serp-competitors',
    data: { keywords: requestedKeywords, rows, totalRows: providerTotalRows },
    market,
    snapshot,
    coverage: coverage({
      requestedRows: input.limit,
      returnedRows: rawRows.length,
      retainedRows: rows.length,
      invalidRows,
      providerTotalRows,
      offset,
      filtered: false,
    }),
    endpoint: DOMAIN_ENDPOINTS.competitors,
    limit: input.limit,
    filters: {
      keywordCount: requestedKeywords.length,
      includeSubdomains: input.includeSubdomains ?? false,
      resultTypes: types.join(','),
      offset,
    },
    sort: orderBy,
    warnings: [
      ...mappedWarnings(market, snapshot.warnings, invalidRows, 'competitor'),
      ...duplicateWarning(mappedRows.length, rows.length, 'competitor'),
    ],
  })
}
