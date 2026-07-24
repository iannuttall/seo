import type { ProviderEvidence } from '../contracts.js'
import type {
  DomainOverview,
  DomainOverviewRequest,
} from '../domain-contracts.js'
import type { SemrushClient } from './client.js'
import {
  domain,
  evidence,
  mappedWarnings,
  organicFootprint,
} from './domain-research-shared.js'
import { semrushRecords } from './mapping.js'
import { semrushMarket } from './market.js'

const COLUMNS = ['Dn', 'Or', 'Ot', 'Oc'] as const

export async function semrushDomainOverview(
  client: Pick<SemrushClient, 'report'>,
  input: DomainOverviewRequest,
): Promise<ProviderEvidence<DomainOverview>> {
  const { market, database } = semrushMarket(input.market, 'domain-overview')
  const target = domain(input.domain, 'domain-overview')
  const snapshot = await client.report({
    operation: 'domain-overview',
    reportType: 'domain_rank',
    parameters: { domain: target, database },
    columns: COLUMNS,
    maximumResponseRows: 1,
    unitsPerLine: 10,
    refresh: input.refresh,
  })
  const records = semrushRecords(snapshot.table, COLUMNS)
  let row = records[0]
  let invalidRows = 0
  if (row) {
    try {
      if (!row.Dn || domain(row.Dn, 'domain-overview') !== target) {
        invalidRows = 1
        row = undefined
      }
    } catch {
      invalidRows = 1
      row = undefined
    }
  }
  return evidence({
    capability: 'domain-overview',
    data: {
      domain: target,
      organic: organicFootprint({
        traffic: row?.Ot,
        keywords: row?.Or,
        cost: row?.Oc,
      }),
    },
    market,
    snapshot,
    coverage: {
      requestedRows: 1,
      returnedRows: snapshot.returnedRows,
      retainedRows: row ? 1 : 0,
      invalidRows,
      providerTotalRows: null,
      completeness: invalidRows ? 'invalid' : 'complete',
      nextCursor: null,
    },
    limit: 1,
    filters: {
      database,
      countryCode: market.countryCode,
      languageCode: market.languageCode,
      domain: target,
      apiVersion: 3,
    },
    sort: [],
    warnings: mappedWarnings(market, snapshot, invalidRows, 'overview'),
  })
}
