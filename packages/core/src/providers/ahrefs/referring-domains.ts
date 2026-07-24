import type { MarketIndependentProviderEvidence } from '../contracts.js'
import type {
  ReferringDomain,
  ReferringDomainPage,
  ReferringDomainsRequest,
} from '../link-contracts.js'
import type { AhrefsClient } from './client.js'
import { ahrefsRefdomainsResponseSchema } from './schema.js'
import {
  compareCodepoints,
  coverage,
  dedupeBy,
  domain,
  linkTarget,
  marketIndependentEvidence,
  metric,
  normalizedDate,
  numberValue,
  requestContext,
  rowLimit,
  unavailable,
} from './shared.js'

const ENDPOINT = 'site-explorer/refdomains'
const SELECT = 'domain,domain_rating,first_seen,links_to_target'
const PER_ROW_UNITS = 4
const ORDER_BY = 'links_to_target:desc,domain_rating:desc,domain:asc'

function observedBacklinks(row: ReferringDomain): number {
  return row.backlinks.state === 'observed' ? row.backlinks.value : -1
}

export async function ahrefsReferringDomains(
  client: Pick<AhrefsClient, 'request'>,
  input: ReferringDomainsRequest,
): Promise<MarketIndependentProviderEvidence<ReferringDomainPage>> {
  rowLimit(input.limit, input.offset, 'referring-domains')
  const normalized = linkTarget(input.target, input.scope)
  const includeSubdomains =
    normalized.scope === 'domain' ? (input.includeSubdomains ?? true) : false
  const mode =
    normalized.scope === 'page'
      ? 'exact'
      : includeSubdomains
        ? 'subdomains'
        : 'domain'
  const snapshot = await client.request({
    operation: 'referring-domains',
    capability: 'referring-domains',
    path: ENDPOINT,
    query: {
      history: 'live',
      limit: input.limit,
      mode,
      order_by: ORDER_BY,
      select: SELECT,
      target: normalized.target,
    },
    schema: ahrefsRefdomainsResponseSchema,
    requestedRows: input.limit,
    perRowUnits: PER_ROW_UNITS,
    rowCount: (response) => response.refdomains.length,
    refresh: input.refresh,
    context: requestContext('link-evidence', input.context),
  })

  let invalidRows = 0
  const mapped = snapshot.response.refdomains.flatMap(
    (row): ReferringDomain[] => {
      let sourceDomain: string
      try {
        sourceDomain = domain(row.domain, 'referring-domains')
      } catch {
        invalidRows += 1
        return []
      }
      const firstSeen = normalizedDate(row.first_seen)
      return [
        {
          domain: sourceDomain,
          backlinks: numberValue(
            row.links_to_target,
            'referring-domain backlinks',
          ),
          referringPages: unavailable('referring pages for this domain'),
          brokenBacklinks: unavailable(
            'broken backlinks from this referring domain',
          ),
          brokenPages: unavailable('broken pages from this referring domain'),
          firstSeenAt: firstSeen
            ? { state: 'observed', value: firstSeen }
            : {
                state: 'invalid',
                value: null,
                reason: 'Ahrefs returned an invalid first-seen date.',
              },
          metrics: metric(
            'domain-rating',
            'Ahrefs Domain Rating',
            row.domain_rating,
          ),
        },
      ]
    },
  )
  const rows = dedupeBy(mapped, (row) => row.domain).sort(
    (left, right) =>
      observedBacklinks(right) - observedBacklinks(left) ||
      compareCodepoints(left.domain, right.domain),
  )
  const duplicateRows = mapped.length - rows.length
  return marketIndependentEvidence({
    capability: 'referring-domains',
    data: { target: normalized.target, rows, totalRows: null },
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
      history: 'live',
      includeSubdomains,
      mode,
      scope: normalized.scope,
      selectedFields: SELECT,
    },
    sort: [
      'backlinks:descending',
      'domainRating:descending',
      'domain:codepoint-ascending',
    ],
    warnings: [
      ...(invalidRows
        ? [
            {
              code: 'invalid-referring-domain-rows',
              field: 'data.rows',
              message: `Ahrefs returned ${invalidRows} referring-domain row${invalidRows === 1 ? '' : 's'} without a valid domain.`,
            },
          ]
        : []),
      ...(duplicateRows
        ? [
            {
              code: 'duplicate-referring-domain-rows',
              field: 'data.rows',
              message: `${duplicateRows} duplicate referring-domain row${duplicateRows === 1 ? '' : 's'} were collapsed deterministically.`,
            },
          ]
        : []),
    ],
  })
}
