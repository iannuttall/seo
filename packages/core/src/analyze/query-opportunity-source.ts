import { shouldExcludeBrandQuery } from '../brand.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { resolveQueryOpportunityInput } from './query-opportunity-input.js'
import {
  compareQueryOpportunityRows,
  normalizeQueryOpportunityRows,
} from './query-opportunity-rows.js'
import type {
  QueryOpportunityDependencies,
  QueryOpportunityEvidence,
  QueryOpportunityInput,
  QueryOpportunitySelection,
} from './query-opportunity-types.js'

export type {
  QueryOpportunityDependencies,
  QueryOpportunityEvidence,
  QueryOpportunityInput,
  QueryOpportunityRow,
  QueryOpportunitySelection,
} from './query-opportunity-types.js'

export const defaultQueryOpportunityDependencies: QueryOpportunityDependencies =
  {
    searchAnalytics: querySearchAnalytics,
    now: () => new Date(),
  }

export async function queryOpportunityEvidence(
  input: QueryOpportunityInput,
  dependencies: QueryOpportunityDependencies = defaultQueryOpportunityDependencies,
): Promise<QueryOpportunityEvidence> {
  const now = dependencies.now()
  const resolved = resolveQueryOpportunityInput(input, now)
  const result = await dependencies.searchAnalytics(
    input.site,
    {
      ...resolved.range,
      dimensions: ['query'],
      type: 'web',
      dataState: 'final',
      aggregationType: 'auto',
      maxRows: resolved.maxRows,
    },
    { refresh: input.refresh },
  )
  const selection: QueryOpportunitySelection = {
    sourceRows: result.rows.length,
    invalidRows: 0,
    duplicateRows: 0,
    conflictingRows: 0,
    brandRows: 0,
    belowMinimumRows: 0,
    eligibleRows: 0,
  }
  const rows = normalizeQueryOpportunityRows(result.rows, selection)
    .filter((row) => {
      if (row.impressions < resolved.minImpressions) {
        selection.belowMinimumRows++
        return false
      }
      if (
        shouldExcludeBrandQuery({
          query: row.query,
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        })
      ) {
        selection.brandRows++
        return false
      }
      return true
    })
    .sort(compareQueryOpportunityRows)
  selection.eligibleRows = rows.length
  const possiblyTruncated = result.rowsFetched >= resolved.maxRows
  const warnings: string[] = []
  if (possiblyTruncated) {
    warnings.push(
      `GSC reached the ${resolved.maxRows}-row retention cap. Lower-click queries may be missing.`,
    )
  }
  if (selection.invalidRows > 0) {
    warnings.push(`${selection.invalidRows} malformed GSC rows were excluded.`)
  }
  if (selection.conflictingRows > 0) {
    warnings.push(
      `${selection.conflictingRows} conflicting duplicate GSC rows were excluded.`,
    )
  }

  return {
    site: input.site,
    generatedAt: now.toISOString(),
    rangeDays: resolved.days,
    dateRange: resolved.range,
    filters: {
      limit: resolved.limit,
      minImpressions: resolved.minImpressions,
      maxRows: resolved.maxRows,
    },
    source: {
      provider: 'google-search-console',
      dimensions: ['query'],
      searchType: 'web',
      dataState: 'final',
      aggregationType: 'auto',
      rowsFetched: result.rowsFetched,
      calls: result.calls,
      maxRows: resolved.maxRows,
      possiblyTruncated,
      completeness: possiblyTruncated
        ? 'possibly-truncated'
        : 'retained-query-rows-only',
      availableDateWindow: {
        ...resolved.availableDateWindow,
        basis: 'rolling-16-month-retention-with-finalization-lag',
      },
    },
    selection,
    rows,
    warnings,
    caveats: [
      'Search Console exposes retained top query rows and does not guarantee every query.',
      'Clicks, impressions, CTR, and position are observed GSC metrics; classifications and generated prompts are heuristics.',
    ],
  }
}
