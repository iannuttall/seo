import {
  basicAuthorization,
  dataForSeoTask,
  fetchProviderJson,
  isRecord,
  nonNegativeInteger,
  nonNegativeNumber,
  normalizeProviderDomain,
  type ProviderAdapterDependencies,
  ProviderAdapterError,
  type ProviderDataStatus,
  providerCheckedAt,
  safeHttpUrl,
} from './provider-adapter.ts'

const HISTORY_ENDPOINT =
  'https://api.dataforseo.com/v3/dataforseo_labs/google/historical_rank_overview/live'
const KEYWORDS_ENDPOINT =
  'https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live'
const MONTH_LIMIT = 12
const KEYWORD_LIMIT = 5

export type DataForSeoTrafficInput = {
  target: string
  login: string
  password: string
  locationCode: number
  languageCode: string
}

export type DataForSeoTrafficMonth = {
  month: string
  estimatedOrganicTraffic: number | null
  rankingResults: number | null
  estimatedTrafficValueUsd: number | null
  positions: {
    first: number | null
    secondToThird: number | null
    fourthToTenth: number | null
    eleventhToTwentieth: number | null
    twentyFirstToHundredth: number | null
  }
  movement: {
    new: number | null
    up: number | null
    down: number | null
    lost: number | null
  }
}

export type DataForSeoTopKeyword = {
  keyword: string
  searchVolume: number | null
  rankGroup: number | null
  rankAbsolute: number | null
  rankingUrl: string | null
  estimatedOrganicTraffic: number | null
  estimatedTrafficValueUsd: number | null
}

export type DataForSeoTrafficResult = {
  schema: 1
  target: string
  dataStatus: ProviderDataStatus
  latest: DataForSeoTrafficMonth | null
  history: DataForSeoTrafficMonth[]
  topKeywords: DataForSeoTopKeyword[]
  warnings: Array<{
    code: 'provider-estimate' | 'history-unavailable' | 'keywords-unavailable'
    message: string
  }>
  provenance: {
    provider: 'dataforseo'
    endpoints: {
      history: typeof HISTORY_ENDPOINT
      keywords: typeof KEYWORDS_ENDPOINT
    }
    checkedAt: string
    market: {
      locationCode: number
      languageCode: string
    }
    period: {
      dateFrom: string
      dateTo: string
      requestedMonths: 12
      returnedMonths: number
    }
    providerCostUsd: number | null
    limits: {
      historyMonths: 12
      topKeywords: 5
    }
  }
}

export async function checkDataForSeoWebsiteTraffic(
  input: DataForSeoTrafficInput,
  dependencies: ProviderAdapterDependencies = {},
): Promise<DataForSeoTrafficResult> {
  const target = normalizeProviderDomain(input.target)
  const locationCode = validLocationCode(input.locationCode)
  const languageCode = validLanguageCode(input.languageCode)
  const checkedAt = providerCheckedAt(dependencies)
  const now = new Date(checkedAt)
  const period = twelveMonthPeriod(now)
  const authorization = basicAuthorization(input.login, input.password)
  const sharedTask = {
    target,
    location_code: locationCode,
    language_code: languageCode,
    ignore_synonyms: false,
    include_clickstream_data: false,
  }
  const historyPayload = await fetchProviderJson(
    HISTORY_ENDPOINT,
    {
      method: 'POST',
      headers: {
        authorization,
        accept: 'application/json',
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify([
        {
          ...sharedTask,
          date_from: period.dateFrom,
          date_to: period.dateTo,
          correlate: true,
        },
      ]),
    },
    dependencies,
  )
  const historyTask = dataForSeoTask(historyPayload)
  validateMarketResult(historyTask.result, target, locationCode, languageCode)
  const history = normalizeHistory(historyTask.result.items)
  const warnings: DataForSeoTrafficResult['warnings'] = [
    {
      code: 'provider-estimate',
      message:
        'Traffic, keyword, and traffic value figures are DataForSEO estimates for the selected market. They are not owner-verified analytics.',
    },
  ]
  if (history.length === 0) {
    warnings.push({
      code: 'history-unavailable',
      message: 'DataForSEO did not return historical traffic for this domain.',
    })
  }

  let keywordCostUsd: number | null = null
  let topKeywords: DataForSeoTopKeyword[] = []
  let keywordsAvailable = true
  try {
    const keywordPayload = await fetchProviderJson(
      KEYWORDS_ENDPOINT,
      {
        method: 'POST',
        headers: {
          authorization,
          accept: 'application/json',
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify([
          {
            ...sharedTask,
            item_types: ['organic'],
            historical_serp_mode: 'live',
            order_by: ['ranked_serp_element.serp_item.etv,desc'],
            limit: KEYWORD_LIMIT,
          },
        ]),
      },
      dependencies,
    )
    const keywordTask = dataForSeoTask(keywordPayload)
    validateMarketResult(keywordTask.result, target, locationCode, languageCode)
    keywordCostUsd = keywordTask.costUsd
    topKeywords = normalizeKeywords(keywordTask.result.items, target)
    if (topKeywords.length === 0) {
      keywordsAvailable = false
      warnings.push({
        code: 'keywords-unavailable',
        message: 'DataForSEO did not return the top keyword sample.',
      })
    }
  } catch {
    keywordsAvailable = false
    warnings.push({
      code: 'keywords-unavailable',
      message: 'DataForSEO did not return the top keyword sample.',
    })
  }

  const costParts = [historyTask.costUsd, keywordCostUsd].filter(
    (cost): cost is number => cost !== null,
  )
  const providerCostUsd =
    costParts.length > 0
      ? Number(costParts.reduce((sum, cost) => sum + cost, 0).toFixed(6))
      : null
  const dataStatus: ProviderDataStatus =
    history.length === 0
      ? topKeywords.length > 0
        ? 'partial'
        : 'unavailable'
      : keywordsAvailable
        ? 'complete'
        : 'partial'

  return {
    schema: 1,
    target,
    dataStatus,
    latest: history.at(-1) ?? null,
    history,
    topKeywords,
    warnings,
    provenance: {
      provider: 'dataforseo',
      endpoints: {
        history: HISTORY_ENDPOINT,
        keywords: KEYWORDS_ENDPOINT,
      },
      checkedAt,
      market: { locationCode, languageCode },
      period: {
        ...period,
        requestedMonths: MONTH_LIMIT,
        returnedMonths: history.length,
      },
      providerCostUsd,
      limits: {
        historyMonths: MONTH_LIMIT,
        topKeywords: KEYWORD_LIMIT,
      },
    },
  }
}

function validLocationCode(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 999_999_999) {
    throw new ProviderAdapterError(
      'invalid-request',
      'Choose a valid DataForSEO location.',
    )
  }
  return value
}

function validLanguageCode(value: string): string {
  if (typeof value !== 'string') {
    throw new ProviderAdapterError(
      'invalid-request',
      'Choose a valid DataForSEO language.',
    )
  }
  const normalized = value.trim().toLowerCase()
  if (!/^[a-z]{2,3}(?:-[a-z\d]{2,8})*$/u.test(normalized)) {
    throw new ProviderAdapterError(
      'invalid-request',
      'Choose a valid DataForSEO language.',
    )
  }
  return normalized
}

function validateMarketResult(
  result: Record<string, unknown>,
  target: string,
  locationCode: number,
  languageCode: string,
): void {
  if (
    result.target !== target ||
    result.location_code !== locationCode ||
    result.language_code !== languageCode
  ) {
    throw new ProviderAdapterError(
      'invalid-response',
      'DataForSEO returned an invalid response.',
    )
  }
}

function twelveMonthPeriod(now: Date): { dateFrom: string; dateTo: string } {
  const dateFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1),
  )
  return {
    dateFrom: dateFrom.toISOString().slice(0, 10),
    dateTo: now.toISOString().slice(0, 10),
  }
}

function normalizeHistory(value: unknown): DataForSeoTrafficMonth[] {
  if (!Array.isArray(value)) return []
  const byMonth = new Map<string, DataForSeoTrafficMonth>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const year = item.year
    const month = item.month
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      (year as number) < 2020 ||
      (year as number) > 3000 ||
      (month as number) < 1 ||
      (month as number) > 12
    ) {
      continue
    }
    const metrics = isRecord(item.metrics) ? item.metrics : undefined
    const organic = isRecord(metrics?.organic) ? metrics.organic : undefined
    if (!organic) continue
    const monthKey = `${year}-${String(month).padStart(2, '0')}`
    const candidate: DataForSeoTrafficMonth = {
      month: monthKey,
      estimatedOrganicTraffic: nonNegativeNumber(organic.etv),
      rankingResults: nonNegativeInteger(organic.count),
      estimatedTrafficValueUsd: nonNegativeNumber(
        organic.estimated_paid_traffic_cost,
      ),
      positions: {
        first: nonNegativeInteger(organic.pos_1),
        secondToThird: nonNegativeInteger(organic.pos_2_3),
        fourthToTenth: nonNegativeInteger(organic.pos_4_10),
        eleventhToTwentieth: nonNegativeInteger(organic.pos_11_20),
        twentyFirstToHundredth: sumKnownIntegers([
          organic.pos_21_30,
          organic.pos_31_40,
          organic.pos_41_50,
          organic.pos_51_60,
          organic.pos_61_70,
          organic.pos_71_80,
          organic.pos_81_90,
          organic.pos_91_100,
        ]),
      },
      movement: {
        new: nonNegativeInteger(organic.is_new),
        up: nonNegativeInteger(organic.is_up),
        down: nonNegativeInteger(organic.is_down),
        lost: nonNegativeInteger(organic.is_lost),
      },
    }
    const previous = byMonth.get(monthKey)
    if (!previous || JSON.stringify(candidate) < JSON.stringify(previous)) {
      byMonth.set(monthKey, candidate)
    }
  }
  return [...byMonth.values()]
    .sort((left, right) => codepointCompare(left.month, right.month))
    .slice(-MONTH_LIMIT)
}

function sumKnownIntegers(values: unknown[]): number | null {
  const numbers = values.map(nonNegativeInteger)
  if (numbers.some((number) => number === null)) return null
  const total = (numbers as number[]).reduce((sum, number) => sum + number, 0)
  return Number.isSafeInteger(total) ? total : null
}

function normalizeKeywords(
  value: unknown,
  target: string,
): DataForSeoTopKeyword[] {
  if (!Array.isArray(value)) return []
  const keywords: DataForSeoTopKeyword[] = []
  for (const item of value) {
    if (!isRecord(item) || !isRecord(item.keyword_data)) continue
    const keyword = item.keyword_data.keyword
    if (
      typeof keyword !== 'string' ||
      !keyword.trim() ||
      keyword.length > 500 ||
      hasControlCharacters(keyword) ||
      !isRecord(item.ranked_serp_element) ||
      !isRecord(item.ranked_serp_element.serp_item)
    ) {
      continue
    }
    const keywordInfo = isRecord(item.keyword_data.keyword_info)
      ? item.keyword_data.keyword_info
      : undefined
    const serpItem = item.ranked_serp_element.serp_item
    if (serpItem.type !== 'organic') continue
    keywords.push({
      keyword: keyword.trim(),
      searchVolume: nonNegativeInteger(keywordInfo?.search_volume),
      rankGroup: nonNegativeInteger(serpItem.rank_group),
      rankAbsolute: nonNegativeInteger(serpItem.rank_absolute),
      rankingUrl: safeRankingUrl(serpItem.url, target),
      estimatedOrganicTraffic: nonNegativeNumber(serpItem.etv),
      estimatedTrafficValueUsd: nonNegativeNumber(
        serpItem.estimated_paid_traffic_cost,
      ),
    })
  }

  return keywords
    .sort((left, right) => {
      const traffic =
        (right.estimatedOrganicTraffic ?? -1) -
        (left.estimatedOrganicTraffic ?? -1)
      return traffic || codepointCompare(left.keyword, right.keyword)
    })
    .slice(0, KEYWORD_LIMIT)
}

function safeRankingUrl(value: unknown, target: string): string | null {
  const normalized = safeHttpUrl(value)
  if (!normalized) return null
  const hostname = new URL(normalized).hostname
    .toLowerCase()
    .replace(/^www\./u, '')
  return hostname === target || hostname.endsWith(`.${target}`)
    ? normalized
    : null
}

function codepointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codepoint = character.codePointAt(0)
    if (codepoint !== undefined && (codepoint < 32 || codepoint === 127)) {
      return true
    }
  }
  return false
}
