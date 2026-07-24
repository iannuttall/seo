import type { ProviderEvidence } from '../contracts.js'
import type {
  RankingPage,
  RankingPagePage,
  RankingPagesRequest,
} from '../domain-contracts.js'
import { ProviderError } from '../errors.js'
import type { SemrushClient } from './client.js'
import {
  coverage,
  dedupeBy,
  domain,
  evidence,
  mappedWarnings,
  observedNumber,
  organicFootprint,
  rowLimit,
  safeUrl,
  unavailable,
} from './domain-research-shared.js'
import { compareCodepoints, semrushRecords } from './mapping.js'
import { semrushMarket } from './market.js'

const COLUMNS = ['Ur', 'Pc', 'Tg', 'Tr'] as const

function filters(input: RankingPagesRequest): string {
  const result: string[] = []
  if (input.minEstimatedTraffic !== undefined) {
    if (
      !Number.isFinite(input.minEstimatedTraffic) ||
      input.minEstimatedTraffic < 0
    ) {
      throw new ProviderError({
        provider: 'semrush',
        operation: 'ranking-pages',
        code: 'configuration',
        message: 'Minimum estimated traffic must be nonnegative.',
      })
    }
    if (input.minEstimatedTraffic > 0) {
      result.push(`+|Tg|Gt|${Math.max(0, input.minEstimatedTraffic - 1)}`)
    }
  }
  if (input.minRankedKeywords !== undefined) {
    if (
      !Number.isSafeInteger(input.minRankedKeywords) ||
      input.minRankedKeywords < 0
    ) {
      throw new ProviderError({
        provider: 'semrush',
        operation: 'ranking-pages',
        code: 'configuration',
        message: 'Minimum ranked keywords must be a nonnegative integer.',
      })
    }
    if (input.minRankedKeywords > 0) {
      result.push(`+|Pc|Gt|${input.minRankedKeywords - 1}`)
    }
  }
  return result.join(';')
}

export async function semrushRankingPages(
  client: Pick<SemrushClient, 'report'>,
  input: RankingPagesRequest,
): Promise<ProviderEvidence<RankingPagePage>> {
  const { market, database } = semrushMarket(input.market, 'ranking-pages')
  const target = domain(input.domain, 'ranking-pages')
  const offset = input.offset ?? 0
  rowLimit(input.limit, offset, 'ranking-pages')
  const displayFilter = filters(input)
  const snapshot = await client.report({
    operation: 'ranking-pages',
    reportType: 'domain_organic_unique',
    parameters: {
      domain: target,
      database,
      display_limit: input.limit + offset,
      display_offset: offset,
      display_sort: 'tg_desc',
      ...(displayFilter ? { display_filter: displayFilter } : {}),
    },
    columns: COLUMNS,
    maximumResponseRows: input.limit,
    unitsPerLine: 10,
    refresh: input.refresh,
  })
  const records = semrushRecords(snapshot.table, COLUMNS)
  let invalidRows = 0
  const mapped = records.flatMap((row): RankingPage[] => {
    const url = safeUrl(row.Ur)
    if (!url) {
      invalidRows += 1
      return []
    }
    const organic = organicFootprint({
      traffic: row.Tg,
      keywords: row.Pc,
    })
    organic.estimatedMonthlyTrafficCostUsd = unavailable(
      'estimated organic traffic cost',
    )
    return [{ url, organic }]
  })
  const rows = dedupeBy(mapped, (row) => row.url).sort(
    (left, right) =>
      observedNumber(right.organic.estimatedMonthlyTraffic) -
        observedNumber(left.organic.estimatedMonthlyTraffic) ||
      compareCodepoints(left.url, right.url),
  )
  const duplicateRows = mapped.length - rows.length
  return evidence({
    capability: 'relevant-pages',
    data: { domain: target, rows, totalRows: null },
    market,
    snapshot,
    coverage: coverage({
      requestedRows: input.limit,
      returnedRows: records.length,
      retainedRows: rows.length,
      invalidRows,
      offset,
      filtered: Boolean(displayFilter),
    }),
    limit: input.limit,
    filters: {
      database,
      countryCode: market.countryCode,
      languageCode: market.languageCode,
      minEstimatedTraffic: input.minEstimatedTraffic ?? 0,
      minRankedKeywords: input.minRankedKeywords ?? 0,
      offset,
      apiVersion: 3,
    },
    sort: ['estimatedMonthlyTraffic:descending', 'url:codepoint-ascending'],
    warnings: [
      ...mappedWarnings(market, snapshot, invalidRows, 'ranking-page'),
      ...(duplicateRows
        ? [
            {
              code: 'duplicate-ranking-page-rows',
              field: 'data.rows',
              message: `${duplicateRows} duplicate ranking-page row${duplicateRows === 1 ? '' : 's'} were collapsed deterministically.`,
            },
          ]
        : []),
    ],
  })
}
