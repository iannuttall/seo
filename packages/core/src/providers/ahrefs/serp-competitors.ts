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
import type { AhrefsApiSnapshot, AhrefsClient } from './client.js'
import { ahrefsSerpOverviewResponseSchema } from './schema.js'
import {
  AHREFS_API_BASE_URL,
  combinedCache,
  combinedCost,
  compareCodepoints,
  domain,
  freeTestValue,
  marketCountry,
  marketWarnings,
  normalizedKeyword,
  organicOnly,
  requestContext,
  rowLimit,
  unavailable,
} from './shared.js'

const ENDPOINT = 'serp-overview/serp-overview'
const MAX_KEYWORDS = 20
const MAX_SERP_DEPTH = 100
const SELECT = 'position,type,url'
const PER_ROW_UNITS = 3

type SerpSnapshot = AhrefsApiSnapshot<
  (typeof ahrefsSerpOverviewResponseSchema)['_output']
>

function keywords(input: string[]): string[] {
  const result = [
    ...new Set(
      input.map((value) => normalizedKeyword(value, 'serp-competitors')),
    ),
  ].sort(compareCodepoints)
  if (result.length < 1 || result.length > MAX_KEYWORDS) {
    throw new ProviderError({
      provider: 'ahrefs',
      operation: 'serp-competitors',
      code: 'configuration',
      message: 'Ahrefs SERP competitors requires 1 to 20 keywords.',
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

export async function ahrefsSerpCompetitors(
  client: Pick<AhrefsClient, 'request'>,
  input: SerpCompetitorsRequest,
): Promise<ProviderEvidence<SerpCompetitorSet>> {
  organicOnly(input.resultTypes, 'serp-competitors')
  if (input.includeSubdomains) {
    throw new ProviderError({
      provider: 'ahrefs',
      operation: 'serp-competitors',
      code: 'configuration',
      message:
        'Ahrefs SERP competitors preserves observed domains and does not fold subdomains together.',
    })
  }
  rowLimit(input.limit, input.offset, 'serp-competitors')
  const requestedKeywords = keywords(input.keywords)
  const country = marketCountry(input.market, 'serp-competitors')
  const depth = Math.min(MAX_SERP_DEPTH, input.limit)
  const context = requestContext('serp-competitors', input.context)
  const snapshots: SerpSnapshot[] = []
  const grouped = new Map<string, Map<string, Set<number>>>()
  const warnings: ProviderWarning[] = [...marketWarnings(input.market)]
  let invalidRows = 0
  let duplicateRows = 0
  let lastError: ProviderError | undefined

  for (const keyword of requestedKeywords) {
    try {
      const snapshot = await client.request({
        operation: 'serp-competitors-organic-results',
        capability: 'serp-competitors',
        path: ENDPOINT,
        query: {
          country,
          keyword,
          select: SELECT,
          top_positions: depth,
          type: 'organic',
        },
        schema: ahrefsSerpOverviewResponseSchema,
        requestedRows: depth,
        perRowUnits: PER_ROW_UNITS,
        rowCount: (response) => response.positions.length,
        free: freeTestValue(keyword),
        refresh: input.refresh,
        context,
      })
      snapshots.push(snapshot)
      warnings.push(...snapshot.warnings)
      for (const row of snapshot.response.positions) {
        const url = row.url
        const position = row.position
        let resultDomain = ''
        try {
          resultDomain = url ? domain(url, 'serp-competitors') : ''
        } catch {
          resultDomain = ''
        }
        if (
          !resultDomain ||
          !Number.isSafeInteger(position) ||
          position < 1 ||
          position > MAX_SERP_DEPTH ||
          !row.type.includes('organic')
        ) {
          invalidRows += 1
          continue
        }
        const byKeyword =
          grouped.get(resultDomain) ?? new Map<string, Set<number>>()
        const positions = byKeyword.get(keyword) ?? new Set<number>()
        if (positions.has(position)) duplicateRows += 1
        positions.add(position)
        byKeyword.set(keyword, positions)
        grouped.set(resultDomain, byKeyword)
      }
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error
      lastError = error
      warnings.push({
        code: 'competitor-request-failed',
        field: 'keywords',
        message: `Ahrefs organic results failed for one keyword (${error.code}).`,
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
  const rows = allRows.slice(0, input.limit)
  const failedCalls = requestedKeywords.length - snapshots.length
  const providerCapped = snapshots.some(
    (snapshot) => snapshot.returnedRows >= depth,
  )
  const capped = allRows.length > input.limit || providerCapped
  const resultCoverage: ProviderCoverage = {
    requestedRows: input.limit,
    returnedRows: allRows.length,
    retainedRows: rows.length,
    invalidRows,
    providerTotalRows: null,
    completeness:
      failedCalls || invalidRows ? 'partial' : capped ? 'capped' : 'complete',
    nextCursor: null,
  }
  if (invalidRows) {
    warnings.push({
      code: 'invalid-organic-result-rows',
      field: 'data.rows',
      message: `Ahrefs returned ${invalidRows} organic result row${invalidRows === 1 ? '' : 's'} without a valid organic domain or position.`,
    })
  }
  if (duplicateRows) {
    warnings.push({
      code: 'duplicate-organic-result-rows',
      field: 'data.rows',
      message: `${duplicateRows} duplicate organic result row${duplicateRows === 1 ? '' : 's'} were collapsed deterministically.`,
    })
  }

  return {
    schemaVersion: 1,
    provider: 'ahrefs',
    capability: 'serp-competitors',
    data: { keywords: requestedKeywords, rows, totalRows: null },
    observedAt: snapshots
      .map((snapshot) => snapshot.observedAt)
      .sort(compareCodepoints)
      .at(-1) as string,
    market: input.market,
    coverage: resultCoverage,
    cache: combinedCache(snapshots),
    cost: combinedCost(snapshots),
    request: {
      operation: 'serp-competitors',
      endpoint: new URL(ENDPOINT, AHREFS_API_BASE_URL).toString(),
      limit: input.limit,
      filters: {
        apiVersion: 3,
        country,
        includeSubdomains: false,
        keywordCount: requestedKeywords.length,
        organicDepthPerKeyword: depth,
        providerRequests: requestedKeywords.length,
        resultTypes: 'organic',
        selectedFields: SELECT,
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
