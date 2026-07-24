import type { ProviderEvidence } from '../contracts.js'
import type {
  RankedKeyword,
  RankedKeywordPage,
  RankedKeywordsRequest,
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
  organicOnly,
  rowLimit,
  safeUrl,
  unavailable,
} from './domain-research-shared.js'
import {
  compareCodepoints,
  normalizedKeyword,
  semrushMetric,
  semrushRecords,
} from './mapping.js'
import { semrushMarket } from './market.js'

const COLUMNS = [
  'Ph',
  'Po',
  'Nq',
  'Cp',
  'Co',
  'Nr',
  'Kd',
  'In',
  'Ur',
  'Ts',
] as const

function target(value: string): {
  target: string
  reportType: 'domain_organic' | 'url_organic'
  parameter: { domain: string } | { url: string }
} {
  const raw = value.trim()
  if (!/^https?:\/\//iu.test(raw)) {
    const normalized = domain(raw, 'ranked-keywords')
    return {
      target: normalized,
      reportType: 'domain_organic',
      parameter: { domain: normalized },
    }
  }
  try {
    const url = new URL(raw)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      raw.length > 2_048
    ) {
      throw new Error()
    }
    url.hash = ''
    return {
      target: url.toString(),
      reportType: 'url_organic',
      parameter: { url: url.toString() },
    }
  } catch {
    throw new ProviderError({
      provider: 'semrush',
      operation: 'ranked-keywords',
      code: 'configuration',
      message: 'Use a valid domain or absolute page URL.',
    })
  }
}

function filters(input: RankedKeywordsRequest): string {
  const result: string[] = []
  if (input.minSearchVolume !== undefined) {
    if (
      !Number.isSafeInteger(input.minSearchVolume) ||
      input.minSearchVolume < 0
    ) {
      throw new ProviderError({
        provider: 'semrush',
        operation: 'ranked-keywords',
        code: 'configuration',
        message: 'Minimum search volume must be a nonnegative integer.',
      })
    }
    if (input.minSearchVolume > 0) {
      result.push(`+|Nq|Gt|${input.minSearchVolume - 1}`)
    }
  }
  if (input.maxRank !== undefined) {
    if (
      !Number.isSafeInteger(input.maxRank) ||
      input.maxRank < 1 ||
      input.maxRank > 100
    ) {
      throw new ProviderError({
        provider: 'semrush',
        operation: 'ranked-keywords',
        code: 'configuration',
        message: 'Maximum rank must be from 1 to 100.',
      })
    }
    result.push(`+|Po|Lt|${input.maxRank + 1}`)
  }
  const excluded = [
    ...new Set((input.excludeTerms ?? []).map(normalizedKeyword)),
  ]
    .filter(Boolean)
    .sort(compareCodepoints)
  if (
    excluded.length > 5 ||
    excluded.some(
      (term) => term.length > 80 || term.includes('|') || term.includes(';'),
    )
  ) {
    throw new ProviderError({
      provider: 'semrush',
      operation: 'ranked-keywords',
      code: 'configuration',
      message:
        'Use at most 5 excluded terms of at most 80 characters without filter separators.',
    })
  }
  result.push(...excluded.map((term) => `-|Ph|Co|${term}`))
  return result.join(';')
}

export async function semrushRankedKeywords(
  client: Pick<SemrushClient, 'report'>,
  input: RankedKeywordsRequest,
): Promise<ProviderEvidence<RankedKeywordPage>> {
  const { market, database } = semrushMarket(input.market, 'ranked-keywords')
  organicOnly(input.resultTypes, 'ranked-keywords')
  const selection = target(input.target)
  if (
    selection.reportType === 'domain_organic' &&
    input.includeSubdomains === false
  ) {
    throw new ProviderError({
      provider: 'semrush',
      operation: 'ranked-keywords',
      code: 'configuration',
      message:
        'Semrush V3 does not expose the requested subdomain exclusion for domain keyword reports.',
    })
  }
  const offset = input.offset ?? 0
  rowLimit(input.limit, offset, 'ranked-keywords')
  const displayFilter = filters(input)
  const snapshot = await client.report({
    operation: 'ranked-keywords',
    reportType: selection.reportType,
    parameters: {
      ...selection.parameter,
      database,
      display_limit: input.limit + offset,
      display_offset: offset,
      display_sort: 'nq_desc',
      positions_type: 'organic',
      ...(displayFilter ? { display_filter: displayFilter } : {}),
    },
    columns: COLUMNS,
    maximumResponseRows: input.limit,
    unitsPerLine: 10,
    refresh: input.refresh,
  })
  const records = semrushRecords(snapshot.table, COLUMNS)
  let invalidRows = 0
  const mapped = records.flatMap((row): RankedKeyword[] => {
    const keyword = normalizedKeyword(row.Ph ?? '')
    const url = safeUrl(row.Ur)
    const rank = Number(row.Po)
    if (
      !keyword ||
      !url ||
      !Number.isSafeInteger(rank) ||
      rank < 1 ||
      rank > 100
    ) {
      invalidRows += 1
      return []
    }
    return [
      {
        ...semrushMetric(keyword, [row]),
        url,
        rankGroup: rank,
        rankAbsolute: rank,
        resultType: 'organic',
        estimatedMonthlyTraffic: unavailable(
          'absolute estimated keyword traffic; the provider row exposes traffic share',
        ),
      },
    ]
  })
  const rows = dedupeBy(
    mapped,
    (row) => `${row.keyword}\0${row.url}\0${row.resultType}`,
  ).sort(
    (left, right) =>
      observedNumber(right.monthlySearchVolume) -
        observedNumber(left.monthlySearchVolume) ||
      left.rankGroup - right.rankGroup ||
      compareCodepoints(left.keyword, right.keyword) ||
      compareCodepoints(left.url, right.url),
  )
  const duplicateRows = mapped.length - rows.length
  return evidence({
    capability: 'ranked-keywords',
    data: { target: selection.target, rows, totalRows: null },
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
      includeSubdomains: input.includeSubdomains ?? true,
      resultTypes: 'organic',
      minSearchVolume: input.minSearchVolume ?? 0,
      maxRank: input.maxRank ?? 100,
      excludedTerms: input.excludeTerms?.length ?? 0,
      offset,
      apiVersion: 3,
    },
    sort: ['monthlySearchVolume:descending', 'rank:ascending'],
    warnings: [
      ...mappedWarnings(market, snapshot, invalidRows, 'ranked-keyword'),
      ...(duplicateRows
        ? [
            {
              code: 'duplicate-ranked-keyword-rows',
              field: 'data.rows',
              message: `${duplicateRows} duplicate ranked-keyword row${duplicateRows === 1 ? '' : 's'} were collapsed deterministically.`,
            },
          ]
        : []),
    ],
  })
}
