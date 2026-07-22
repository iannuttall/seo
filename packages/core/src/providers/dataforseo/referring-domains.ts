import type { MarketIndependentProviderEvidence } from '../contracts.js'
import type {
  ReferringDomain,
  ReferringDomainPage,
  ReferringDomainsRequest,
} from '../link-contracts.js'
import { compareCodepoints } from './keyword-mapping.js'
import type { LinkResearchClient } from './link-research-client.js'
import {
  LINK_ENDPOINTS,
  linkCoverage,
  linkEvidence,
  linkRowLimit,
  linkTarget,
  mappingWarnings,
  metric,
  normalizedDate,
  numberValue,
  requestContext,
  stringValue,
  totalRows,
} from './link-research-shared.js'

function observedNumber(row: ReferringDomain): number {
  return row.backlinks.state === 'observed' ? row.backlinks.value : -1
}

export async function dataForSeoReferringDomains(
  client: LinkResearchClient,
  input: ReferringDomainsRequest,
): Promise<MarketIndependentProviderEvidence<ReferringDomainPage>> {
  const normalized = linkTarget(input.target, input.scope)
  const includeSubdomains =
    normalized.scope === 'domain' ? (input.includeSubdomains ?? true) : false
  const offset = input.offset ?? 0
  linkRowLimit(input.limit, offset)
  const orderBy = ['backlinks,desc', 'rank,desc', 'domain,asc']
  const snapshot = await client.referringDomains({
    ...normalized,
    includeSubdomains,
    limit: input.limit,
    offset,
    orderBy,
    refresh: input.refresh,
    context: requestContext('link-evidence', input.context),
  })
  const results = snapshot.response.tasks.flatMap((task) => task.result ?? [])
  const rawRows = results.flatMap((result) => result.items ?? [])
  let invalidRows = 0
  const mapped = rawRows.flatMap((row): ReferringDomain[] => {
    const domain = row.domain?.trim().toLowerCase()
    if (!domain) {
      invalidRows += 1
      return []
    }
    const firstSeenAt = normalizedDate(row.first_seen)
    return [
      {
        domain,
        backlinks: numberValue(row.backlinks, 'domain backlinks'),
        referringPages: numberValue(
          row.referring_pages,
          'domain referring pages',
        ),
        brokenBacklinks: numberValue(
          row.broken_backlinks,
          'domain broken backlinks',
        ),
        brokenPages: numberValue(row.broken_pages, 'domain broken pages'),
        firstSeenAt: stringValue(firstSeenAt, 'domain first seen date'),
        metrics: [
          ...metric(
            'source-domain-rank',
            'DataForSEO source domain rank',
            row.rank,
          ),
          ...metric(
            'domain-backlinks-spam-score',
            'DataForSEO domain backlink spam score',
            row.backlinks_spam_score,
          ),
        ],
      },
    ]
  })
  const byDomain = new Map<string, ReferringDomain>()
  for (const row of mapped.sort(
    (left, right) =>
      observedNumber(right) - observedNumber(left) ||
      compareCodepoints(left.domain, right.domain),
  )) {
    if (!byDomain.has(row.domain)) byDomain.set(row.domain, row)
  }
  const rows = [...byDomain.values()]
  const duplicateRows = mapped.length - rows.length
  const providerTotalRows = totalRows(
    results.map((result) => result.total_count),
  )
  return linkEvidence({
    capability: 'referring-domains',
    data: { target: normalized.target, rows, totalRows: providerTotalRows },
    snapshot,
    coverage: linkCoverage({
      requestedRows: input.limit,
      returnedRows: rawRows.length,
      retainedRows: rows.length,
      invalidRows,
      providerTotalRows,
      offset,
      filtered: true,
    }),
    endpoint: LINK_ENDPOINTS.referringDomains,
    limit: input.limit,
    filters: {
      scope: normalized.scope,
      includeSubdomains,
      status: 'live',
      includeIndirectLinks: true,
      excludeInternalBacklinks: true,
      offset,
    },
    sort: orderBy,
    warnings: mappingWarnings({
      snapshotWarnings: snapshot.warnings,
      invalidRows,
      duplicateRows,
      label: 'referring-domain',
    }),
  })
}
