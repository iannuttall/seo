import type {
  KeywordMetric,
  KeywordMonthlySearch,
  ProviderValue,
  ProviderWarning,
  SearchMarket,
} from '../contracts.js'
import { observedValue, unavailableValue } from '../contracts.js'
import { ProviderError } from '../errors.js'
import {
  type DataForSeoKeywordOverviewItem,
  optionalResultCount,
} from './schema.js'

export const MAX_RETAINED_MONTHLY_SEARCH_ROWS = 24

type KeywordField = Exclude<keyof KeywordMetric, 'keyword'>

export function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function normalizedKeyword(keyword: string): string {
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

export function metricForKeyword(
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

export function locationRequest(
  market: SearchMarket,
  operation: string,
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
      operation,
      code: 'configuration',
      message: `No DataForSEO country location could be derived from ${market.countryCode}.`,
    })
  }
  return { locationName: countryName }
}

export function marketWarnings(market: SearchMarket): ProviderWarning[] {
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
        'Keyword estimates are market-level and are not segmented by device.',
    })
  }
  return warnings
}
