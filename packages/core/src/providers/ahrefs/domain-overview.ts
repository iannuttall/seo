import type { ProviderEvidence } from '../contracts.js'
import type {
  DomainOverview,
  DomainOverviewRequest,
} from '../domain-contracts.js'
import type { AhrefsClient } from './client.js'
import { ahrefsDomainMetricsResponseSchema } from './schema.js'
import {
  apiDate,
  domain,
  evidence,
  freeTestValue,
  marketCountry,
  organicFootprint,
  requestContext,
} from './shared.js'

const ENDPOINT = 'site-explorer/metrics'
const PER_ROW_UNITS = 44

export async function ahrefsDomainOverview(
  client: Pick<AhrefsClient, 'request'>,
  input: DomainOverviewRequest,
  now: () => Date,
): Promise<ProviderEvidence<DomainOverview>> {
  const target = domain(input.domain, 'domain-overview')
  const country = marketCountry(input.market, 'domain-overview')
  const date = apiDate(now)
  const snapshot = await client.request({
    operation: 'domain-overview',
    capability: 'domain-overview',
    path: ENDPOINT,
    query: {
      country,
      date,
      mode: 'subdomains',
      target,
      volume_mode: 'average',
    },
    schema: ahrefsDomainMetricsResponseSchema,
    requestedRows: 1,
    perRowUnits: PER_ROW_UNITS,
    rowCount: () => 1,
    free: freeTestValue(target),
    refresh: input.refresh,
    context: requestContext('domain-overview', input.context),
  })

  return evidence({
    capability: 'domain-overview',
    data: {
      domain: target,
      organic: organicFootprint({
        traffic: snapshot.response.metrics.org_traffic,
        keywords: snapshot.response.metrics.org_keywords,
        costCents: snapshot.response.metrics.org_cost,
      }),
    },
    market: input.market,
    snapshot,
    coverage: {
      requestedRows: 1,
      returnedRows: 1,
      retainedRows: 1,
      invalidRows: 0,
      providerTotalRows: 1,
      completeness: 'complete',
      nextCursor: null,
    },
    endpoint: ENDPOINT,
    limit: 1,
    filters: {
      apiVersion: 3,
      country,
      date,
      domain: target,
      mode: 'subdomains',
      volumeMode: 'average',
    },
    sort: [],
  })
}
