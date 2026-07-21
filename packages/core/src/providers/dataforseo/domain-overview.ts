import type { ProviderEvidence } from '../contracts.js'
import type {
  DomainOverview,
  DomainOverviewRequest,
} from '../domain-contracts.js'
import type { DomainResearchClient } from './domain-research-client.js'
import {
  DOMAIN_ENDPOINTS,
  domain,
  domainEvidence,
  mappedWarnings,
  organicFootprint,
  requestContext,
  researchMarket,
} from './domain-research-shared.js'
import { locationRequest } from './keyword-mapping.js'

export async function dataForSeoDomainOverview(
  client: DomainResearchClient,
  input: DomainOverviewRequest,
): Promise<ProviderEvidence<DomainOverview>> {
  const market = researchMarket(input.market, 'domain-overview')
  const target = domain(input.domain)
  const location = locationRequest(market, 'domain-overview')
  const snapshot = await client.domainOverview({
    target,
    languageCode: market.languageCode.split('-')[0] as string,
    ...location,
    refresh: input.refresh,
    context: requestContext('domain-overview', input.context),
  })
  const rows = snapshot.response.tasks.flatMap((task) => task.result ?? [])
  const matching = rows.find(
    (row) => !row.target || domain(row.target) === target,
  )
  const invalidRows = rows.length > 0 && !matching ? rows.length : 0
  return domainEvidence({
    capability: 'domain-overview',
    data: {
      domain: target,
      organic: organicFootprint(matching?.metrics?.organic),
    },
    market,
    snapshot,
    coverage: {
      requestedRows: 1,
      returnedRows: rows.length,
      retainedRows: matching ? 1 : 0,
      invalidRows,
      providerTotalRows: rows.length,
      completeness: matching || rows.length === 0 ? 'complete' : 'invalid',
      nextCursor: null,
    },
    endpoint: DOMAIN_ENDPOINTS.overview,
    limit: 1,
    filters: { domain: target },
    sort: [],
    warnings: mappedWarnings(
      market,
      snapshot.warnings,
      invalidRows,
      'overview',
    ),
  })
}
