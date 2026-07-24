import type {
  ProviderCoverage,
  ProviderEvidence,
  ProviderWarning,
} from '../contracts.js'
import { observedValue } from '../contracts.js'
import type {
  SerpCompetitor,
  SerpCompetitorSet,
  SerpCompetitorsRequest,
} from '../domain-contracts.js'
import { ProviderError } from '../errors.js'
import type { SemrushClient, SemrushReportSnapshot } from './client.js'
import {
  combinedCache,
  combinedCost,
  domain,
  organicOnly,
  rowLimit,
  unavailable,
} from './domain-research-shared.js'
import {
  compareCodepoints,
  normalizedKeyword,
  semrushRecords,
} from './mapping.js'
import {
  semrushKeywordDeprecationWarning,
  semrushMarket,
  semrushMarketWarnings,
} from './market.js'

const MAX_KEYWORDS = 20
const MAX_SERP_DEPTH = 100
const COLUMNS = ['Po', 'Dn', 'Ur'] as const

function keywords(input: string[]): string[] {
  const result = [...new Set(input.map(normalizedKeyword))]
    .filter(Boolean)
    .sort(compareCodepoints)
  if (
    result.length < 1 ||
    result.length > MAX_KEYWORDS ||
    result.some(
      (keyword) =>
        keyword.length > 80 ||
        keyword.split(/\s+/u).length > 10 ||
        keyword.includes(';'),
    )
  ) {
    throw new ProviderError({
      provider: 'semrush',
      operation: 'serp-competitors',
      code: 'configuration',
      message:
        'Semrush SERP competitors requires 1 to 20 keywords of at most 80 characters and 10 words.',
    })
  }
  return result
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

export async function semrushSerpCompetitors(
  client: Pick<SemrushClient, 'report'>,
  input: SerpCompetitorsRequest,
): Promise<ProviderEvidence<SerpCompetitorSet>> {
  const { market, database } = semrushMarket(input.market, 'serp-competitors')
  organicOnly(input.resultTypes, 'serp-competitors')
  if (input.includeSubdomains) {
    throw new ProviderError({
      provider: 'semrush',
      operation: 'serp-competitors',
      code: 'configuration',
      message:
        'Semrush SERP competitors preserves observed domains and does not fold subdomains together.',
    })
  }
  const requestedKeywords = keywords(input.keywords)
  const offset = input.offset ?? 0
  rowLimit(input.limit, offset, 'serp-competitors')
  const depth = Math.min(MAX_SERP_DEPTH, input.limit + offset)
  const snapshots: SemrushReportSnapshot[] = []
  const warnings: ProviderWarning[] = [
    ...semrushMarketWarnings(market),
    semrushKeywordDeprecationWarning(),
  ]
  const grouped = new Map<string, Map<string, Set<number>>>()
  let invalidRows = 0
  let duplicateRows = 0
  let lastError: ProviderError | undefined

  for (const keyword of requestedKeywords) {
    try {
      const snapshot = await client.report({
        operation: 'serp-competitors-organic-results',
        reportType: 'phrase_organic',
        parameters: {
          phrase: keyword,
          database,
          display_limit: depth,
          positions_type: 'organic',
        },
        columns: COLUMNS,
        maximumResponseRows: depth,
        unitsPerLine: 10,
        refresh: input.refresh,
      })
      snapshots.push(snapshot)
      warnings.push(...snapshot.warnings)
      for (const row of semrushRecords(snapshot.table, COLUMNS)) {
        let normalizedDomain = ''
        try {
          normalizedDomain = domain(row.Dn ?? '', 'serp-competitors')
        } catch {
          normalizedDomain = ''
        }
        const position = Number(row.Po)
        if (
          !normalizedDomain ||
          !Number.isSafeInteger(position) ||
          position < 1 ||
          position > MAX_SERP_DEPTH
        ) {
          invalidRows += 1
          continue
        }
        const byKeyword =
          grouped.get(normalizedDomain) ?? new Map<string, Set<number>>()
        const positions = byKeyword.get(keyword) ?? new Set<number>()
        if (positions.has(position)) duplicateRows += 1
        positions.add(position)
        byKeyword.set(keyword, positions)
        grouped.set(normalizedDomain, byKeyword)
      }
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error
      lastError = error
      warnings.push({
        code: 'competitor-request-failed',
        field: 'keywords',
        message: `Semrush organic results failed for one keyword (${error.code}).`,
      })
    }
  }
  if (!snapshots.length && lastError) throw lastError

  const allRows: SerpCompetitor[] = [...grouped.entries()]
    .map(([competitorDomain, byKeyword]) => {
      const keywordPositions = [...byKeyword.entries()]
        .map(([keyword, positions]) => ({
          keyword,
          positions: [...positions].sort((left, right) => left - right),
        }))
        .sort((left, right) => compareCodepoints(left.keyword, right.keyword))
      const positions = keywordPositions.flatMap((item) => item.positions)
      return {
        domain: competitorDomain,
        matchedKeywords: keywordPositions.length,
        averagePosition: observedValue(
          positions.reduce((sum, value) => sum + value, 0) / positions.length,
        ),
        medianPosition: observedValue(median(positions)),
        visibility: unavailable<number>(
          'a provider visibility metric for this supplied keyword set',
        ),
        estimatedMonthlyTraffic: unavailable<number>(
          'absolute estimated monthly traffic for this supplied keyword set',
        ),
        relevantResults: unavailable<number>(
          'a complete relevant-result count for this supplied keyword set',
        ),
        keywordPositions,
      }
    })
    .sort((left, right) => {
      const leftAverage =
        left.averagePosition.state === 'observed'
          ? left.averagePosition.value
          : Number.POSITIVE_INFINITY
      const rightAverage =
        right.averagePosition.state === 'observed'
          ? right.averagePosition.value
          : Number.POSITIVE_INFINITY
      return (
        right.matchedKeywords - left.matchedKeywords ||
        leftAverage - rightAverage ||
        compareCodepoints(left.domain, right.domain)
      )
    })
  const rows = allRows.slice(offset, offset + input.limit)
  const failedCalls = requestedKeywords.length - snapshots.length
  const providerCapped = snapshots.some(
    (snapshot) => snapshot.returnedRows >= depth,
  )
  const capped = allRows.length > offset + input.limit || providerCapped
  const coverage: ProviderCoverage = {
    requestedRows: input.limit,
    returnedRows: allRows.length,
    retainedRows: rows.length,
    invalidRows,
    providerTotalRows: null,
    completeness:
      failedCalls || invalidRows ? 'partial' : capped ? 'capped' : 'complete',
    nextCursor: capped ? String(offset + rows.length) : null,
  }
  if (invalidRows) {
    warnings.push({
      code: 'invalid-organic-result-rows',
      field: 'data.rows',
      message: `Semrush returned ${invalidRows} organic result row${invalidRows === 1 ? '' : 's'} without a valid domain or position.`,
    })
  }
  if (duplicateRows) {
    warnings.push({
      code: 'duplicate-organic-result-rows',
      field: 'data.rows',
      message: `${duplicateRows} duplicate organic result row${duplicateRows === 1 ? '' : 's'} were collapsed deterministically.`,
    })
  }
  const observedAt = snapshots
    .map((snapshot) => snapshot.observedAt)
    .sort(compareCodepoints)
    .at(-1)
  return {
    schemaVersion: 1,
    provider: 'semrush',
    capability: 'serp-competitors',
    data: {
      keywords: requestedKeywords,
      rows,
      totalRows: null,
    },
    observedAt: observedAt as string,
    market,
    coverage,
    cache: combinedCache(snapshots),
    cost: combinedCost(snapshots),
    request: {
      operation: 'serp-competitors',
      endpoint: 'https://api.semrush.com/',
      limit: input.limit,
      filters: {
        database,
        countryCode: market.countryCode,
        languageCode: market.languageCode,
        keywordCount: requestedKeywords.length,
        resultTypes: 'organic',
        includeSubdomains: false,
        organicDepthPerKeyword: depth,
        providerRequests: requestedKeywords.length,
        offset,
        apiVersion: 3,
      },
      sort: [
        'matchedKeywords:descending',
        'averagePosition:ascending',
        'domain:codepoint-ascending',
      ],
    },
    warnings,
  }
}
