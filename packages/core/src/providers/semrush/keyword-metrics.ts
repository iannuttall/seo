import type {
  KeywordMetric,
  KeywordMetricsProvider,
  KeywordMetricsRequest,
  ProviderEvidence,
} from '../contracts.js'
import { ProviderError } from '../errors.js'
import { SemrushClient, type SemrushClientOptions } from './client.js'
import {
  compareCodepoints,
  normalizedKeyword,
  type SemrushRecord,
  semrushMetric,
  semrushRecords,
} from './mapping.js'
import {
  SEMRUSH_V3_MARKETS,
  semrushKeywordDeprecationWarning,
  semrushMarket,
  semrushMarketWarnings,
} from './market.js'

const MAX_KEYWORDS = 100
const COLUMNS = ['Ph', 'Nq', 'Cp', 'Co', 'Nr', 'In', 'Kd'] as const

type KeywordMetricsClient = Pick<SemrushClient, 'report'>

export type SemrushKeywordMetricsProviderOptions = SemrushClientOptions & {
  client?: KeywordMetricsClient
}

function keywords(input: string[]): {
  normalized: string[]
  unique: string[]
} {
  const normalized = input.map(normalizedKeyword).filter(Boolean)
  const unique = [...new Set(normalized)].sort(compareCodepoints)
  if (
    input.length < 1 ||
    input.length > MAX_KEYWORDS ||
    normalized.length !== input.length ||
    unique.some(
      (keyword) =>
        keyword.length > 80 ||
        keyword.split(/\s+/u).length > 10 ||
        keyword.includes(';'),
    )
  ) {
    throw new ProviderError({
      provider: 'semrush',
      operation: 'keyword-metrics',
      code: 'configuration',
      message:
        'Semrush keyword metrics requires 1 to 100 keywords of at most 80 characters and 10 words.',
    })
  }
  return { normalized, unique }
}

export class SemrushKeywordMetricsProvider implements KeywordMetricsProvider {
  readonly provider = 'semrush' as const
  readonly capabilitySupport = [
    {
      capability: 'keyword-metrics' as const,
      status: 'available' as const,
      markets: SEMRUSH_V3_MARKETS,
    },
  ] as const

  private readonly client: KeywordMetricsClient

  constructor(options: SemrushKeywordMetricsProviderOptions = {}) {
    this.client = options.client ?? new SemrushClient(options)
  }

  async keywordMetrics(
    input: KeywordMetricsRequest,
  ): Promise<ProviderEvidence<KeywordMetric[]>> {
    const selection = keywords(input.keywords)
    const { market, database } = semrushMarket(input.market, 'keyword-metrics')
    const snapshot = await this.client.report({
      operation: 'keyword-metrics',
      reportType: 'phrase_these',
      parameters: {
        phrase: selection.unique.join(';'),
        database,
      },
      columns: COLUMNS,
      maximumResponseRows: selection.unique.length,
      unitsPerLine: 10,
      refresh: input.refresh,
    })
    const requested = new Set(selection.unique)
    const grouped = new Map<string, SemrushRecord[]>()
    let invalidRows = 0
    for (const row of semrushRecords(snapshot.table, COLUMNS)) {
      const keyword = normalizedKeyword(row.Ph ?? '')
      if (!keyword || !requested.has(keyword)) {
        invalidRows += 1
        continue
      }
      grouped.set(keyword, [...(grouped.get(keyword) ?? []), row])
    }
    const missing = selection.unique.filter((keyword) => !grouped.has(keyword))
    const duplicates = [...grouped.values()].filter(
      (rows) => rows.length > 1,
    ).length
    const warnings = [
      ...snapshot.warnings,
      ...semrushMarketWarnings(market),
      semrushKeywordDeprecationWarning(),
      ...(selection.normalized.length !== selection.unique.length
        ? [
            {
              code: 'duplicate-keywords-removed',
              field: 'keywords',
              message: 'Duplicate keywords were normalized and requested once.',
            },
          ]
        : []),
      ...(missing.length
        ? [
            {
              code: 'provider-keywords-omitted',
              field: 'keyword',
              message: `Semrush omitted ${missing.length} requested keyword${missing.length === 1 ? '' : 's'}.`,
            },
          ]
        : []),
      ...(invalidRows
        ? [
            {
              code: 'unexpected-provider-keywords',
              field: 'keyword',
              message: `Semrush returned ${invalidRows} unexpected or invalid keyword row${invalidRows === 1 ? '' : 's'}.`,
            },
          ]
        : []),
      ...(duplicates
        ? [
            {
              code: 'duplicate-provider-keywords',
              field: 'keyword',
              message: `Semrush returned duplicate rows for ${duplicates} keyword${duplicates === 1 ? '' : 's'}; conflicting fields are invalid.`,
            },
          ]
        : []),
    ]
    return {
      schemaVersion: 1,
      provider: 'semrush',
      capability: 'keyword-metrics',
      data: selection.unique.map((keyword) =>
        semrushMetric(keyword, grouped.get(keyword) ?? []),
      ),
      observedAt: snapshot.observedAt,
      market,
      coverage: {
        requestedRows: selection.unique.length,
        returnedRows: snapshot.returnedRows,
        retainedRows: selection.unique.length,
        invalidRows,
        providerTotalRows: null,
        completeness:
          missing.length || invalidRows || duplicates ? 'partial' : 'complete',
        nextCursor: null,
      },
      cache: snapshot.cache,
      cost: snapshot.cost,
      request: {
        operation: 'keyword-metrics',
        endpoint: 'https://api.semrush.com/',
        limit: selection.unique.length,
        filters: {
          database,
          countryCode: market.countryCode,
          languageCode: market.languageCode,
          apiVersion: 3,
        },
        sort: ['keyword:codepoint-ascending'],
      },
      warnings,
    }
  }
}
