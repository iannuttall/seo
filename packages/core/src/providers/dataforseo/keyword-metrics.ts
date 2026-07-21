import { randomUUID } from 'node:crypto'
import type {
  KeywordMetric,
  KeywordMetricsProvider,
  KeywordMetricsRequest,
  ProviderEvidence,
} from '../contracts.js'
import { searchMarketSchema } from '../contracts.js'
import { ProviderError } from '../errors.js'
import {
  DataForSeoClient,
  type DataForSeoClientOptions,
  type DataForSeoKeywordOverviewSnapshot,
} from './client.js'
import {
  compareCodepoints,
  locationRequest,
  MAX_RETAINED_MONTHLY_SEARCH_ROWS,
  marketWarnings,
  metricForKeyword,
  normalizedKeyword,
} from './keyword-mapping.js'
import type { DataForSeoKeywordOverviewItem } from './schema.js'

const MAX_KEYWORDS_PER_REPORT = 100
const KEYWORD_OVERVIEW_ENDPOINT =
  'v3/dataforseo_labs/google/keyword_overview/live'

type KeywordMetricsClient = Pick<DataForSeoClient, 'keywordOverview'>

export type DataForSeoKeywordMetricsProviderOptions =
  DataForSeoClientOptions & {
    client?: KeywordMetricsClient
  }

function responseItems(
  snapshot: DataForSeoKeywordOverviewSnapshot,
): DataForSeoKeywordOverviewItem[] {
  return snapshot.response.tasks.flatMap((task) =>
    (task.result ?? []).flatMap((result) => result.items ?? []),
  )
}

export class DataForSeoKeywordMetricsProvider
  implements KeywordMetricsProvider
{
  readonly provider = 'dataforseo' as const
  readonly capabilitySupport = [
    {
      capability: 'keyword-metrics' as const,
      status: 'available' as const,
      markets: [
        {
          searchEngines: ['google'] as const,
          location: 'any' as const,
        },
      ],
    },
  ] as const

  private readonly client: KeywordMetricsClient

  constructor(options: DataForSeoKeywordMetricsProviderOptions = {}) {
    this.client = options.client ?? new DataForSeoClient(options)
  }

  async keywordMetrics(
    input: KeywordMetricsRequest,
  ): Promise<ProviderEvidence<KeywordMetric[]>> {
    const market = searchMarketSchema.parse(input.market)
    if (market.searchEngine !== 'google') {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'configuration',
        message:
          'DataForSEO keyword metrics currently supports Google markets.',
      })
    }

    if (
      input.keywords.length < 1 ||
      input.keywords.length > MAX_KEYWORDS_PER_REPORT ||
      input.keywords.some((keyword) => {
        const normalized = keyword.trim()
        return (
          normalized.length < 1 ||
          normalized.length > 80 ||
          normalized.split(/\s+/u).length > 10
        )
      })
    ) {
      throw new ProviderError({
        provider: 'dataforseo',
        operation: 'keyword-metrics',
        code: 'configuration',
        message:
          'Keyword metrics requires 1 to 100 keywords of at most 80 characters and 10 words.',
      })
    }
    const normalized = input.keywords.map(normalizedKeyword)
    const keywords = [...new Set(normalized)]
      .filter(Boolean)
      .sort(compareCodepoints)
    const context = input.context ?? {
      reportId: 'keyword-metrics',
      reportRunId: randomUUID(),
    }
    const location = locationRequest(market, 'keyword-metrics')
    const snapshot = await this.client.keywordOverview({
      keywords,
      languageCode: market.languageCode.split('-')[0] as string,
      ...location,
      includeSerpInfo: true,
      refresh: input.refresh,
      projectId: context.projectId,
      reportId: context.reportId,
      reportRunId: context.reportRunId,
    })
    const requested = new Set(keywords)
    const grouped = new Map<string, DataForSeoKeywordOverviewItem[]>()
    const warnings = [...snapshot.warnings, ...marketWarnings(market)]
    if (normalized.filter(Boolean).length !== keywords.length) {
      warnings.push({
        code: 'duplicate-keywords-removed',
        field: 'keywords',
        message: 'Duplicate keywords were normalized and requested once.',
      })
    }
    const providerRows = responseItems(snapshot)
    const extendedHistoryRows = providerRows.filter(
      (row) =>
        (row.keyword_info?.monthly_searches?.length ?? 0) >
        MAX_RETAINED_MONTHLY_SEARCH_ROWS,
    ).length
    if (extendedHistoryRows > 0) {
      warnings.push({
        code: 'monthly-search-history-truncated',
        field: 'monthlySearches',
        message: `DataForSEO returned more than ${MAX_RETAINED_MONTHLY_SEARCH_ROWS} monthly history rows for ${extendedHistoryRows} keyword${extendedHistoryRows === 1 ? '' : 's'}; only the most recent ${MAX_RETAINED_MONTHLY_SEARCH_ROWS} months were retained.`,
      })
    }
    let unexpectedRows = 0
    for (const [index, row] of providerRows.entries()) {
      const keyword = normalizedKeyword(row.keyword)
      if (!requested.has(keyword)) {
        unexpectedRows += 1
        warnings.push({
          code: 'unexpected-provider-keyword',
          field: 'keyword',
          row: index,
          message: 'DataForSEO returned a keyword that was not requested.',
        })
        continue
      }
      grouped.set(keyword, [...(grouped.get(keyword) ?? []), row])
    }
    const missingKeywords = keywords.filter((keyword) => !grouped.has(keyword))
    if (missingKeywords.length > 0) {
      warnings.push({
        code: 'provider-keywords-omitted',
        field: 'keyword',
        message: `DataForSEO omitted ${missingKeywords.length} requested keyword${missingKeywords.length === 1 ? '' : 's'}.`,
      })
    }
    for (const [keyword, rows] of grouped) {
      if (rows.length > 1) {
        warnings.push({
          code: 'duplicate-provider-keyword',
          field: 'keyword',
          message: `DataForSEO returned ${rows.length} rows for ${keyword}; conflicting fields are invalid.`,
        })
      }
    }

    return {
      schemaVersion: 1,
      provider: 'dataforseo',
      capability: 'keyword-metrics',
      data: keywords.map((keyword) =>
        metricForKeyword(keyword, grouped.get(keyword) ?? []),
      ),
      observedAt: snapshot.observedAt,
      market,
      coverage: {
        requestedRows: keywords.length,
        returnedRows: snapshot.returnedRows,
        retainedRows: keywords.length,
        invalidRows: unexpectedRows,
        providerTotalRows: null,
        completeness:
          missingKeywords.length > 0 || unexpectedRows > 0
            ? 'partial'
            : 'complete',
        nextCursor: null,
      },
      cache: snapshot.cache,
      cost: snapshot.cost,
      request: {
        operation: 'keyword-metrics',
        endpoint: KEYWORD_OVERVIEW_ENDPOINT,
        limit: MAX_KEYWORDS_PER_REPORT,
        filters: {
          countryCode: market.countryCode,
          languageCode: market.languageCode,
          ...(location.locationCode !== undefined
            ? { locationCode: location.locationCode }
            : { locationName: location.locationName }),
          includeSerpInfo: true,
          retainedMonthlyHistoryRows: MAX_RETAINED_MONTHLY_SEARCH_ROWS,
        },
        sort: ['keyword:codepoint-ascending'],
      },
      warnings,
    }
  }
}
