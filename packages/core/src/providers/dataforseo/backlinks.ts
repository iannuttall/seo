import type { MarketIndependentProviderEvidence } from '../contracts.js'
import type {
  BacklinksRequest,
  ExternalBacklink,
  ExternalBacklinkPage,
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
  requestContext,
  safeUrl,
  totalRows,
  uniqueSorted,
} from './link-research-shared.js'

function metricValue(row: ExternalBacklink, id: string): number {
  return row.metrics.find((item) => item.id === id)?.value ?? -1
}

function compareRows(left: ExternalBacklink, right: ExternalBacklink): number {
  return (
    metricValue(right, 'backlink-rank') - metricValue(left, 'backlink-rank') ||
    metricValue(right, 'source-domain-rank') -
      metricValue(left, 'source-domain-rank') ||
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

export async function dataForSeoBacklinks(
  client: LinkResearchClient,
  input: BacklinksRequest,
): Promise<MarketIndependentProviderEvidence<ExternalBacklinkPage>> {
  const normalized = linkTarget(input.target, input.scope)
  const includeSubdomains =
    normalized.scope === 'domain' ? (input.includeSubdomains ?? true) : false
  const offset = input.offset ?? 0
  linkRowLimit(input.limit, offset)
  const mode = input.mode ?? 'representative'
  const status = input.status ?? 'live'
  const providerMode = mode === 'representative' ? 'one_per_domain' : 'as_is'
  const orderBy = ['rank,desc', 'domain_from_rank,desc', 'url_from,asc']
  const snapshot = await client.backlinks({
    ...normalized,
    includeSubdomains,
    mode: providerMode,
    status,
    limit: input.limit,
    offset,
    orderBy,
    refresh: input.refresh,
    context: requestContext('link-evidence', input.context),
  })
  const results = snapshot.response.tasks.flatMap((task) => task.result ?? [])
  const rawRows = results.flatMap((result) => result.items ?? [])
  let invalidRows = 0
  const mapped = rawRows.flatMap((row): ExternalBacklink[] => {
    const sourceUrl = safeUrl(row.url_from)
    const targetUrl = safeUrl(row.url_to)
    if (!sourceUrl || !targetUrl) {
      invalidRows += 1
      return []
    }
    return [
      {
        sourceUrl,
        sourceDomain: new URL(sourceUrl).hostname.toLowerCase(),
        targetUrl,
        anchorText: row.anchor ?? null,
        linkType: row.item_type ?? null,
        dofollow: row.dofollow ?? null,
        attributes: uniqueSorted(row.rel_attributes ?? row.attributes ?? []),
        firstSeenAt: normalizedDate(row.first_seen),
        lastSeenAt: normalizedDate(row.lost_date ?? row.last_visited),
        state: row.is_lost || row.lost_date ? 'lost' : 'live',
        indirect: row.is_indirect_link ?? null,
        linksFromPage: row.links_count ?? null,
        linksFromDomain: row.group_count ?? null,
        metrics: [
          ...metric('backlink-rank', 'DataForSEO backlink rank', row.rank),
          ...metric(
            'source-domain-rank',
            'DataForSEO source domain rank',
            row.domain_from_rank,
          ),
          ...metric(
            'source-page-rank',
            'DataForSEO source page rank',
            row.page_from_rank,
          ),
          ...metric(
            'backlink-spam-score',
            'DataForSEO backlink spam score',
            row.backlink_spam_score ?? row.backlinks_spam_score,
          ),
        ],
      },
    ]
  })
  const rows = dedupe(mapped)
  const duplicateRows = mapped.length - rows.length
  const providerTotalRows = totalRows(
    results.map((result) => result.total_count),
  )
  return linkEvidence({
    capability: 'backlinks',
    data: {
      target: normalized.target,
      mode,
      rows,
      totalRows: providerTotalRows,
    },
    snapshot,
    coverage: linkCoverage({
      requestedRows: input.limit,
      returnedRows: rawRows.length,
      retainedRows: rows.length,
      invalidRows,
      providerTotalRows,
      offset,
      filtered: mode === 'representative' || status !== 'all',
    }),
    endpoint: LINK_ENDPOINTS.backlinks,
    limit: input.limit,
    filters: {
      scope: normalized.scope,
      includeSubdomains,
      mode,
      status,
      includeIndirectLinks: true,
      excludeInternalBacklinks: true,
      offset,
    },
    sort: orderBy,
    warnings: mappingWarnings({
      snapshotWarnings: snapshot.warnings,
      invalidRows,
      duplicateRows,
      label: 'backlink',
    }),
  })
}
