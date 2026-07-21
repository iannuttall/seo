import { randomUUID } from 'node:crypto'
import type {
  KeywordMetric,
  KeywordMetricsProvider,
  KeywordMetricsRequest,
  KeywordMonthlySearch,
  ProviderEvidence,
  ProviderValue,
  ProviderWarning,
  SearchMarket,
} from '../contracts.js'
import {
  observedValue,
  searchMarketSchema,
  unavailableValue,
} from '../contracts.js'
import { ProviderError } from '../errors.js'
import {
  DataForSeoClient,
  type DataForSeoClientOptions,
  type DataForSeoKeywordOverviewSnapshot,
} from './client.js'
import {
  type DataForSeoKeywordOverviewItem,
  optionalResultCount,
} from './schema.js'

const MAX_KEYWORDS_PER_REPORT = 100
const MAX_RETAINED_MONTHLY_SEARCH_ROWS = 24
const KEYWORD_OVERVIEW_ENDPOINT =
  'v3/dataforseo_labs/google/keyword_overview/live'

type KeywordField = Exclude<keyof KeywordMetric, 'keyword'>

type KeywordMetricsClient = Pick<DataForSeoClient, 'keywordOverview'>

export type DataForSeoKeywordMetricsProviderOptions =
  DataForSeoClientOptions & {
    client?: KeywordMetricsClient
  }

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizedKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/gu, ' ').toLowerCase()
}

function missing(field: KeywordField): ProviderValue<never> {
  return unavailableValue('missing', `DataForSEO omitted ${field}.`)
}

function numericValue(
  values: unknown[],
  field: KeywordField,
  valid: (value: number) => boolean,
): ProviderValue<number> {
  const present = values.filter(
    (value) => value !== null && value !== undefined,
  )
  if (present.length === 0) return missing(field)
  const numbers = present.filter(
    (value): value is number => typeof value === 'number' && valid(value),
  )
  if (numbers.length !== present.length) {
    return unavailableValue(
      'invalid',
      `DataForSEO returned an invalid ${field}.`,
    )
  }
  const unique = [...new Set(numbers)]
  return unique.length === 1
    ? observedValue(unique[0] as number)
    : unavailableValue(
        'invalid',
        `DataForSEO returned conflicting ${field} values.`,
      )
}

function stringValue(
  values: unknown[],
  field: KeywordField,
  normalize: (value: string) => string | null,
): ProviderValue<string> {
  const present = values.filter(
    (value) => value !== null && value !== undefined,
  )
  if (present.length === 0) return missing(field)
  const strings = present.flatMap((value) => {
    if (typeof value !== 'string') return []
    const normalized = normalize(value)
    return normalized ? [normalized] : []
  })
  if (strings.length !== present.length) {
    return unavailableValue(
      'invalid',
      `DataForSEO returned an invalid ${field}.`,
    )
  }
  const unique = [...new Set(strings)]
  return unique.length === 1
    ? observedValue(unique[0] as string)
    : unavailableValue(
        'invalid',
        `DataForSEO returned conflicting ${field} values.`,
      )
}

function monthlySearchesValue(
  rows: DataForSeoKeywordOverviewItem[],
): ProviderValue<KeywordMonthlySearch[]> {
  const histories = rows
    .map((row) => row.keyword_info?.monthly_searches)
    .filter((value) => value !== null && value !== undefined)
  if (histories.length === 0) return missing('monthlySearches')

  const byMonth = new Map<string, Set<number>>()
  let invalid = false
  for (const history of histories) {
    for (const item of history) {
      if (
        item.year < 2000 ||
        item.year > 2100 ||
        item.month < 1 ||
        item.month > 12 ||
        item.search_volume === null ||
        item.search_volume === undefined ||
        !Number.isSafeInteger(item.search_volume) ||
        item.search_volume < 0
      ) {
        invalid = true
        continue
      }
      const key = `${item.year}-${String(item.month).padStart(2, '0')}`
      const volumes = byMonth.get(key) ?? new Set<number>()
      volumes.add(item.search_volume)
      byMonth.set(key, volumes)
    }
  }
  if (invalid || [...byMonth.values()].some((values) => values.size !== 1)) {
    return unavailableValue(
      'invalid',
      'DataForSEO returned invalid or conflicting monthly search history.',
    )
  }
  const history = [...byMonth.entries()]
    .sort(([left], [right]) => compareCodepoints(left, right))
    .map(([key, volumes]) => {
      const [year, month] = key.split('-').map(Number)
      return {
        year: year as number,
        month: month as number,
        searchVolume: [...volumes][0] as number,
      }
    })
  return observedValue(history.slice(-MAX_RETAINED_MONTHLY_SEARCH_ROWS))
}

function resultCountValues(rows: DataForSeoKeywordOverviewItem[]): unknown[] {
  return rows.map((row) => {
    const raw = row.serp_info?.se_results_count
    const parsed = optionalResultCount(raw)
    return raw === null || raw === undefined ? raw : (parsed ?? Number.NaN)
  })
}

function metricForKeyword(
  keyword: string,
  rows: DataForSeoKeywordOverviewItem[],
): KeywordMetric {
  if (rows.length === 0) {
    return {
      keyword,
      monthlySearchVolume: missing('monthlySearchVolume'),
      monthlySearches: missing('monthlySearches'),
      searchVolumeUpdatedAt: missing('searchVolumeUpdatedAt'),
      cpcUsd: missing('cpcUsd'),
      paidCompetition: missing('paidCompetition'),
      keywordDifficulty: missing('keywordDifficulty'),
      intent: missing('intent'),
      resultCount: missing('resultCount'),
    }
  }

  return {
    keyword,
    monthlySearchVolume: numericValue(
      rows.map((row) => row.keyword_info?.search_volume),
      'monthlySearchVolume',
      (value) => Number.isSafeInteger(value) && value >= 0,
    ),
    monthlySearches: monthlySearchesValue(rows),
    searchVolumeUpdatedAt: stringValue(
      rows.map((row) => row.keyword_info?.last_updated_time),
      'searchVolumeUpdatedAt',
      (value) => {
        const timestamp = Date.parse(value)
        return Number.isFinite(timestamp)
          ? new Date(timestamp).toISOString()
          : null
      },
    ),
    cpcUsd: numericValue(
      rows.map((row) => row.keyword_info?.cpc),
      'cpcUsd',
      (value) => Number.isFinite(value) && value >= 0,
    ),
    paidCompetition: numericValue(
      rows.map((row) => row.keyword_info?.competition),
      'paidCompetition',
      (value) => Number.isFinite(value) && value >= 0 && value <= 1,
    ),
    keywordDifficulty: numericValue(
      rows.map((row) => row.keyword_properties?.keyword_difficulty),
      'keywordDifficulty',
      (value) => Number.isFinite(value) && value >= 0 && value <= 100,
    ),
    intent: stringValue(
      rows.map((row) => row.search_intent_info?.main_intent),
      'intent',
      (value) => value.trim().toLowerCase() || null,
    ),
    resultCount: numericValue(
      resultCountValues(rows),
      'resultCount',
      (value) => Number.isSafeInteger(value) && value >= 0,
    ),
  }
}

function responseItems(
  snapshot: DataForSeoKeywordOverviewSnapshot,
): DataForSeoKeywordOverviewItem[] {
  return snapshot.response.tasks.flatMap((task) =>
    (task.result ?? []).flatMap((result) => result.items ?? []),
  )
}

function locationRequest(
  market: SearchMarket,
):
  | { locationCode: number; locationName?: never }
  | { locationName: string; locationCode?: never } {
  if (market.location?.code !== undefined) {
    return { locationCode: market.location.code }
  }
  if (market.location?.name) return { locationName: market.location.name }
  const countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(
    market.countryCode,
  )
  if (!countryName || countryName === market.countryCode) {
    throw new ProviderError({
      provider: 'dataforseo',
      operation: 'keyword-metrics',
      code: 'configuration',
      message: `No DataForSEO country location could be derived from ${market.countryCode}.`,
    })
  }
  return { locationName: countryName }
}

function marketWarnings(market: SearchMarket): ProviderWarning[] {
  const warnings: ProviderWarning[] = []
  if (market.languageCode.includes('-')) {
    warnings.push({
      code: 'provider-language-normalized',
      field: 'market.languageCode',
      message: `DataForSEO used the primary language subtag ${market.languageCode.split('-')[0]} for ${market.languageCode}.`,
    })
  }
  if (market.device) {
    warnings.push({
      code: 'metric-not-device-segmented',
      field: 'market.device',
      message:
        'Keyword metrics are market-level estimates and are not segmented by device.',
    })
  }
  return warnings
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
    const location = locationRequest(market)
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
