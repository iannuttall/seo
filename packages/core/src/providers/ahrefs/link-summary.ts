import type { MarketIndependentProviderEvidence } from '../contracts.js'
import type { LinkSummary, LinkSummaryRequest } from '../link-contracts.js'
import type { AhrefsClient } from './client.js'
import { ahrefsBacklinksStatsResponseSchema } from './schema.js'
import {
  apiDate,
  linkTarget,
  marketIndependentEvidence,
  numberValue,
  requestContext,
  unavailable,
} from './shared.js'

const ENDPOINT = 'site-explorer/backlinks-stats'
const PER_ROW_UNITS = 12

export async function ahrefsLinkSummary(
  client: Pick<AhrefsClient, 'request'>,
  input: LinkSummaryRequest,
  now: () => Date,
): Promise<MarketIndependentProviderEvidence<LinkSummary>> {
  const normalized = linkTarget(input.target, input.scope)
  const includeSubdomains =
    normalized.scope === 'domain' ? (input.includeSubdomains ?? true) : false
  const mode =
    normalized.scope === 'page'
      ? 'exact'
      : includeSubdomains
        ? 'subdomains'
        : 'domain'
  const date = apiDate(now)
  const snapshot = await client.request({
    operation: 'link-summary',
    capability: 'link-summary',
    path: ENDPOINT,
    query: {
      date,
      mode,
      target: normalized.target,
    },
    schema: ahrefsBacklinksStatsResponseSchema,
    requestedRows: 1,
    perRowUnits: PER_ROW_UNITS,
    rowCount: () => 1,
    refresh: input.refresh,
    context: requestContext('link-evidence', input.context),
  })
  const metrics = snapshot.response.metrics
  return marketIndependentEvidence({
    capability: 'link-summary',
    data: {
      target: normalized.target,
      scope: normalized.scope,
      backlinks: numberValue(metrics.live, 'live backlinks'),
      referringDomains: numberValue(
        metrics.live_refdomains,
        'live referring domains',
      ),
      referringPages: unavailable('live referring pages'),
      brokenBacklinks: unavailable('broken backlinks'),
      brokenPages: unavailable('broken referring pages'),
      metrics: [],
    },
    snapshot,
    coverage: {
      requestedRows: 1,
      returnedRows: 1,
      retainedRows: 1,
      invalidRows: 0,
      providerTotalRows: null,
      completeness: 'complete',
      nextCursor: null,
    },
    endpoint: ENDPOINT,
    limit: 1,
    filters: {
      apiVersion: 3,
      date,
      includeSubdomains,
      mode,
      scope: normalized.scope,
    },
    sort: [],
  })
}
