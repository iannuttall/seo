import type { MarketIndependentProviderEvidence } from '../contracts.js'
import type {
  BacklinksRequest,
  ExternalBacklink,
  ExternalBacklinkPage,
} from '../link-contracts.js'
import type { AhrefsClient } from './client.js'
import { ahrefsBacklinksResponseSchema } from './schema.js'
import {
  compareCodepoints,
  coverage,
  linkTarget,
  marketIndependentEvidence,
  metric,
  normalizedDate,
  requestContext,
  rowLimit,
  safeUrl,
} from './shared.js'

const ENDPOINT = 'site-explorer/all-backlinks'
const BASE_SELECT =
  'url_from,root_name_source,url_to,anchor,link_type,is_dofollow,first_seen_link,last_seen,is_lost,is_redirect,links_external,domain_rating_source,url_rating_source'
const ORDER_BY = 'domain_rating_source:desc,url_rating_source:desc,url_from:asc'

function metricValue(row: ExternalBacklink, id: string): number {
  return row.metrics.find((item) => item.id === id)?.value ?? -1
}

function compareRows(left: ExternalBacklink, right: ExternalBacklink): number {
  return (
    metricValue(right, 'source-domain-rating') -
      metricValue(left, 'source-domain-rating') ||
    metricValue(right, 'source-url-rating') -
      metricValue(left, 'source-url-rating') ||
    compareCodepoints(left.sourceDomain, right.sourceDomain) ||
    compareCodepoints(left.sourceUrl, right.sourceUrl) ||
    compareCodepoints(left.targetUrl, right.targetUrl) ||
    compareCodepoints(left.anchorText ?? '', right.anchorText ?? '')
  )
}

function dedupe(rows: ExternalBacklink[]): ExternalBacklink[] {
  const sorted = [...rows].sort(compareRows)
  const seen = new Set<string>()
  return sorted.filter((row) => {
    const key = `${row.sourceUrl}\0${row.targetUrl}\0${row.anchorText ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function providerWhere(status: NonNullable<BacklinksRequest['status']>) {
  return status === 'all'
    ? null
    : JSON.stringify({
        field: 'is_lost',
        is: ['eq', status === 'lost'],
      })
}

export async function ahrefsBacklinks(
  client: Pick<AhrefsClient, 'request'>,
  input: BacklinksRequest,
): Promise<MarketIndependentProviderEvidence<ExternalBacklinkPage>> {
  rowLimit(input.limit, input.offset, 'backlinks')
  const normalized = linkTarget(input.target, input.scope)
  const includeSubdomains =
    normalized.scope === 'domain' ? (input.includeSubdomains ?? true) : false
  const targetMode =
    normalized.scope === 'page'
      ? 'exact'
      : includeSubdomains
        ? 'subdomains'
        : 'domain'
  const mode = input.mode ?? 'representative'
  const status = input.status ?? 'live'
  const aggregation = mode === 'representative' ? '1_per_domain' : 'all'
  const where = providerWhere(status)
  const select =
    mode === 'representative' ? `${BASE_SELECT},link_group_count` : BASE_SELECT
  const snapshot = await client.request({
    operation: 'backlinks',
    capability: 'backlinks',
    path: ENDPOINT,
    query: {
      aggregation,
      history: status === 'live' ? 'live' : 'all_time',
      limit: input.limit,
      mode: targetMode,
      order_by: ORDER_BY,
      select,
      target: normalized.target,
      ...(where ? { where } : {}),
    },
    schema: ahrefsBacklinksResponseSchema,
    requestedRows: input.limit,
    perRowUnits: mode === 'representative' ? 14 : 13,
    rowCount: (response) => response.backlinks.length,
    refresh: input.refresh,
    context: requestContext('link-evidence', input.context),
  })

  let invalidRows = 0
  const mapped = snapshot.response.backlinks.flatMap(
    (row): ExternalBacklink[] => {
      const sourceUrl = safeUrl(row.url_from)
      const targetUrl = safeUrl(row.url_to)
      let sourceDomain: string
      try {
        sourceDomain = new URL(sourceUrl ?? '').hostname.toLowerCase()
      } catch {
        sourceDomain = ''
      }
      if (!sourceUrl || !targetUrl || !sourceDomain) {
        invalidRows += 1
        return []
      }
      return [
        {
          sourceUrl,
          sourceDomain,
          targetUrl,
          anchorText: row.anchor || null,
          linkType: row.link_type || null,
          dofollow: row.is_dofollow,
          attributes: [
            ...(row.is_dofollow ? [] : ['nofollow']),
            ...(row.is_redirect ? ['redirect'] : []),
          ],
          firstSeenAt: normalizedDate(row.first_seen_link),
          lastSeenAt: normalizedDate(row.last_seen),
          state: row.is_lost ? 'lost' : 'live',
          indirect: row.is_redirect,
          linksFromPage: null,
          linksFromDomain: row.link_group_count ?? null,
          metrics: [
            ...metric(
              'source-domain-rating',
              'Ahrefs source Domain Rating',
              row.domain_rating_source,
            ),
            ...metric(
              'source-url-rating',
              'Ahrefs source URL Rating',
              row.url_rating_source,
            ),
          ],
        },
      ]
    },
  )
  const rows = dedupe(mapped)
  const duplicateRows = mapped.length - rows.length
  return marketIndependentEvidence({
    capability: 'backlinks',
    data: { target: normalized.target, mode, rows, totalRows: null },
    snapshot,
    coverage: coverage({
      requestedRows: input.limit,
      returnedRows: snapshot.returnedRows,
      retainedRows: rows.length,
      invalidRows,
      filtered: mode === 'representative' || status !== 'all',
    }),
    endpoint: ENDPOINT,
    limit: input.limit,
    filters: {
      aggregation,
      apiVersion: 3,
      history: status === 'live' ? 'live' : 'all_time',
      includeSubdomains,
      mode,
      scope: normalized.scope,
      selectedFields: select,
      status,
      targetMode,
    },
    sort: [
      'sourceDomainRating:descending',
      'sourceUrlRating:descending',
      'sourceUrl:codepoint-ascending',
    ],
    warnings: [
      ...(invalidRows
        ? [
            {
              code: 'invalid-backlink-rows',
              field: 'data.rows',
              message: `Ahrefs returned ${invalidRows} backlink row${invalidRows === 1 ? '' : 's'} without valid source and target URLs.`,
            },
          ]
        : []),
      ...(duplicateRows
        ? [
            {
              code: 'duplicate-backlink-rows',
              field: 'data.rows',
              message: `${duplicateRows} duplicate backlink row${duplicateRows === 1 ? '' : 's'} were collapsed deterministically.`,
            },
          ]
        : []),
    ],
  })
}
