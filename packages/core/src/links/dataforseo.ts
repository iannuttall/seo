import { randomUUID } from 'node:crypto'
import { SeoError } from '../errors.js'
import type { ProviderRequestContext } from '../providers/contracts.js'
import { DataForSeoLinkProvider } from '../providers/dataforseo/link-research.js'
import type { LinkTargetScope } from '../providers/link-contracts.js'
import type { CollectedLinkEvidence, LinkEvidenceRow } from './types.js'

const DEFAULT_ROW_LIMIT = 100
const MAX_ROW_LIMIT = 500

function rowLimit(value?: number): number {
  const limit = value ?? DEFAULT_ROW_LIMIT
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ROW_LIMIT) {
    throw new SeoError(
      'INVALID_INPUT',
      `DataForSEO link row limit must be between 1 and ${MAX_ROW_LIMIT}.`,
    )
  }
  return limit
}

export async function collectDataForSeoLinkEvidence(input: {
  target: string
  scope?: LinkTargetScope
  includeSubdomains?: boolean
  rowLimit?: number
  refresh?: boolean
  context?: ProviderRequestContext
  provider?: Pick<DataForSeoLinkProvider, 'linkSummary' | 'backlinks'>
}): Promise<CollectedLinkEvidence> {
  const limit = rowLimit(input.rowLimit)
  const provider = input.provider ?? new DataForSeoLinkProvider()
  const context = input.context ?? {
    reportId: 'link-evidence',
    reportRunId: randomUUID(),
  }
  const summary = await provider.linkSummary({
    target: input.target,
    scope: input.scope,
    includeSubdomains: input.includeSubdomains,
    refresh: input.refresh,
    context,
  })
  const backlinks = await provider.backlinks({
    target: summary.data.target,
    scope: summary.data.scope,
    includeSubdomains: input.includeSubdomains,
    mode: 'representative',
    status: 'live',
    limit,
    refresh: input.refresh,
    context,
  })
  const rows: LinkEvidenceRow[] = backlinks.data.rows.map((row) => ({
    sourceUrl: row.sourceUrl,
    sourceDomain: row.sourceDomain,
    targetUrl: row.targetUrl,
    anchorText: row.anchorText ?? undefined,
    firstSeenAt: row.firstSeenAt ?? undefined,
    lastSeenAt: row.lastSeenAt ?? undefined,
    nofollow: row.dofollow === null ? undefined : !row.dofollow,
    linkType: row.linkType ?? undefined,
    attributes: row.attributes,
    state: row.state,
    indirect: row.indirect ?? undefined,
    linksFromPage: row.linksFromPage ?? undefined,
    linksFromDomain: row.linksFromDomain ?? undefined,
    providerMetrics: row.metrics,
  }))
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.targetUrl, (counts.get(row.targetUrl) ?? 0) + 1)
  }
  const targetCounts = [...counts]
    .map(([targetUrl, observedLinks]) => ({ targetUrl, observedLinks }))
    .sort(
      (left, right) =>
        right.observedLinks - left.observedLinks ||
        (left.targetUrl < right.targetUrl
          ? -1
          : left.targetUrl > right.targetUrl
            ? 1
            : 0),
    )
  const completeness = backlinks.coverage.completeness
  const representative = backlinks.data.mode === 'representative'
  const partial = completeness !== 'complete' || representative
  return {
    rows,
    targetCounts,
    provenance: {
      provider: 'dataforseo',
      observedAt:
        backlinks.observedAt > summary.observedAt
          ? backlinks.observedAt
          : summary.observedAt,
      cached:
        summary.cache.status === 'hit' && backlinks.cache.status === 'hit',
      suppliedRows: backlinks.coverage.returnedRows ?? rows.length,
      validRows: rows.length,
      invalidRows: backlinks.coverage.invalidRows,
      duplicateRows: Math.max(
        0,
        (backlinks.coverage.returnedRows ?? rows.length) -
          backlinks.coverage.invalidRows -
          rows.length,
      ),
      capped: ['capped', 'partial'].includes(completeness),
      rowLimit: limit,
      completeness: partial ? 'partial' : 'complete',
      providerRequests: {
        methods: [summary.request.endpoint, backlinks.request.endpoint],
        maxConcurrentRequests: 1,
      },
      providerCoverage: {
        targetCountRows: {
          returnedRows: targetCounts.length,
          retainedRows: targetCounts.length,
          invalidRows: 0,
        },
        detailRows: {
          returnedRows: backlinks.coverage.returnedRows ?? rows.length,
          retainedRows: rows.length,
          invalidRows: backlinks.coverage.invalidRows,
        },
        summaryRows: {
          returnedRows: summary.coverage.returnedRows ?? 0,
          retainedRows: summary.coverage.retainedRows ?? 0,
          invalidRows: summary.coverage.invalidRows,
        },
        backlinkRows: {
          returnedRows: backlinks.coverage.returnedRows ?? rows.length,
          retainedRows: rows.length,
          invalidRows: backlinks.coverage.invalidRows,
          providerTotalRows: backlinks.coverage.providerTotalRows,
        },
      },
    },
    externalProvider: { summary, backlinks },
    warnings: [
      ...summary.warnings.map((warning) => warning.message),
      ...backlinks.warnings.map((warning) => warning.message),
      ...(representative
        ? [
            'The link list retains one representative backlink per referring domain. Provider summary counts remain separate from retained rows.',
          ]
        : []),
      ...(!representative && partial
        ? [
            'The link list is bounded or partial. Provider summary counts remain separate from retained rows.',
          ]
        : []),
    ],
  }
}
