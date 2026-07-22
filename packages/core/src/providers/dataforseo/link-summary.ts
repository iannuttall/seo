import type { MarketIndependentProviderEvidence } from '../contracts.js'
import type { LinkSummary, LinkSummaryRequest } from '../link-contracts.js'
import { compareCodepoints } from './keyword-mapping.js'
import type { LinkResearchClient } from './link-research-client.js'
import {
  LINK_ENDPOINTS,
  linkEvidence,
  linkTarget,
  metric,
  missing,
  numberValue,
  requestContext,
} from './link-research-shared.js'

export async function dataForSeoLinkSummary(
  client: LinkResearchClient,
  input: LinkSummaryRequest,
): Promise<MarketIndependentProviderEvidence<LinkSummary>> {
  const normalized = linkTarget(input.target, input.scope)
  const includeSubdomains =
    normalized.scope === 'domain' ? (input.includeSubdomains ?? true) : false
  const snapshot = await client.linkSummary({
    ...normalized,
    includeSubdomains,
    refresh: input.refresh,
    context: requestContext('link-evidence', input.context),
  })
  const rows = snapshot.response.tasks.flatMap((task) => task.result ?? [])
  const row = [...rows].sort((left, right) =>
    compareCodepoints(left.target ?? '', right.target ?? ''),
  )[0]
  const data: LinkSummary = {
    target: normalized.target,
    scope: normalized.scope,
    backlinks: numberValue(row?.backlinks, 'total backlinks'),
    referringDomains: numberValue(row?.referring_domains, 'referring domains'),
    referringPages: numberValue(row?.referring_pages, 'referring pages'),
    brokenBacklinks: numberValue(row?.broken_backlinks, 'broken backlinks'),
    brokenPages: numberValue(row?.broken_pages, 'broken referring pages'),
    metrics: [
      ...metric('rank', 'DataForSEO rank', row?.rank),
      ...metric(
        'backlinks-spam-score',
        'DataForSEO backlink spam score',
        row?.backlinks_spam_score,
      ),
      ...metric(
        'target-spam-score',
        'DataForSEO target spam score',
        row?.info?.target_spam_score,
      ),
    ],
  }
  const retainedRows = row ? 1 : 0
  return linkEvidence({
    capability: 'link-summary',
    data,
    snapshot,
    coverage: {
      requestedRows: 1,
      returnedRows: rows.length,
      retainedRows,
      invalidRows: 0,
      providerTotalRows: rows.length,
      completeness: row ? 'complete' : 'unavailable',
      nextCursor: null,
    },
    endpoint: LINK_ENDPOINTS.summary,
    limit: 1,
    filters: {
      scope: normalized.scope,
      includeSubdomains,
      status: 'live',
      includeIndirectLinks: true,
      excludeInternalBacklinks: true,
    },
    sort: [],
    warnings: [
      ...snapshot.warnings,
      ...(rows.length > 1
        ? [
            {
              code: 'multiple-link-summary-rows',
              field: 'data',
              message:
                'DataForSEO returned more than one summary row. One row was retained deterministically.',
            },
          ]
        : []),
      ...(!row
        ? [
            {
              code: 'missing-link-summary-row',
              field: 'data',
              message:
                'DataForSEO returned no summary row. Counts remain unavailable rather than zero.',
            },
          ]
        : []),
    ],
  })
}

export function unavailableLinkSummary(
  target: string,
  scope: LinkSummary['scope'],
): LinkSummary {
  return {
    target,
    scope,
    backlinks: missing('total backlinks'),
    referringDomains: missing('referring domains'),
    referringPages: missing('referring pages'),
    brokenBacklinks: missing('broken backlinks'),
    brokenPages: missing('broken referring pages'),
    metrics: [],
  }
}
