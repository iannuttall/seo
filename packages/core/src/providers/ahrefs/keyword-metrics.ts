import type {
  KeywordMetric,
  KeywordMetricsProvider,
  KeywordMetricsRequest,
  ProviderEvidence,
} from '../contracts.js'
import { ProviderError } from '../errors.js'
import { AhrefsClient, type AhrefsClientOptions } from './client.js'
import { ahrefsKeywordMetric } from './mapping.js'
import { ahrefsKeywordOverviewResponseSchema } from './schema.js'
import {
  AHREFS_API_BASE_URL,
  AHREFS_MARKETS,
  compareCodepoints,
  marketCountry,
  marketWarnings,
  normalizedKeyword,
  requestContext,
} from './shared.js'

const ENDPOINT = 'keywords-explorer/overview'
const MAX_KEYWORDS = 100
const SELECT = 'keyword,volume,cpc,difficulty,intents'
const PER_ROW_UNITS = 32

type KeywordMetricsClient = Pick<AhrefsClient, 'request'>

export type AhrefsKeywordMetricsProviderOptions = AhrefsClientOptions & {
  client?: KeywordMetricsClient
}

export class AhrefsKeywordMetricsProvider implements KeywordMetricsProvider {
  readonly provider = 'ahrefs' as const
  readonly capabilitySupport = [
    {
      capability: 'keyword-metrics' as const,
      status: 'available' as const,
      markets: AHREFS_MARKETS,
    },
  ] as const

  private readonly client: KeywordMetricsClient

  constructor(options: AhrefsKeywordMetricsProviderOptions = {}) {
    this.client = options.client ?? new AhrefsClient(options)
  }

  async keywordMetrics(
    input: KeywordMetricsRequest,
  ): Promise<ProviderEvidence<KeywordMetric[]>> {
    if (input.keywords.length < 1 || input.keywords.length > MAX_KEYWORDS) {
      throw new ProviderError({
        provider: 'ahrefs',
        operation: 'keyword-metrics',
        code: 'configuration',
        message: 'Ahrefs keyword metrics requires 1 to 100 keywords.',
      })
    }
    const normalized = input.keywords.map((keyword) =>
      normalizedKeyword(keyword, 'keyword-metrics'),
    )
    const keywords = [...new Set(normalized)].sort(compareCodepoints)
    const country = marketCountry(input.market, 'keyword-metrics')
    const snapshot = await this.client.request({
      operation: 'keyword-metrics',
      capability: 'keyword-metrics',
      path: ENDPOINT,
      query: {
        country,
        keywords: keywords.join(','),
        select: SELECT,
        limit: keywords.length,
      },
      schema: ahrefsKeywordOverviewResponseSchema,
      requestedRows: keywords.length,
      perRowUnits: PER_ROW_UNITS,
      rowCount: (response) => response.keywords.length,
      free: keywords.every((keyword) =>
        ['ahrefs', 'yep', 'firehose'].includes(keyword),
      ),
      refresh: input.refresh,
      context: requestContext('keyword-metrics', input.context),
    })
    const requested = new Set(keywords)
    const grouped = new Map<
      string,
      (typeof snapshot.response.keywords)[number][]
    >()
    let invalidRows = 0
    for (const row of snapshot.response.keywords) {
      let keyword: string
      try {
        keyword = normalizedKeyword(row.keyword, 'keyword-metrics')
      } catch {
        invalidRows += 1
        continue
      }
      if (!requested.has(keyword)) {
        invalidRows += 1
        continue
      }
      grouped.set(keyword, [...(grouped.get(keyword) ?? []), row])
    }
    const missingRows = keywords.filter((keyword) => !grouped.has(keyword))
    const duplicateRows = [...grouped.values()].reduce(
      (total, rows) => total + Math.max(0, rows.length - 1),
      0,
    )
    const partial =
      missingRows.length > 0 || invalidRows > 0 || duplicateRows > 0
    return {
      schemaVersion: 1,
      provider: 'ahrefs',
      capability: 'keyword-metrics',
      data: keywords.map((keyword) =>
        ahrefsKeywordMetric(keyword, grouped.get(keyword) ?? []),
      ),
      observedAt: snapshot.observedAt,
      market: input.market,
      coverage: {
        requestedRows: keywords.length,
        returnedRows: snapshot.returnedRows,
        retainedRows: keywords.length,
        invalidRows,
        providerTotalRows: null,
        completeness: partial ? 'partial' : 'complete',
        nextCursor: null,
      },
      cache: snapshot.cache,
      cost: snapshot.cost,
      request: {
        operation: 'keyword-metrics',
        endpoint: new URL(ENDPOINT, AHREFS_API_BASE_URL).toString(),
        limit: keywords.length,
        filters: {
          country,
          selectedFields: SELECT,
          apiVersion: 3,
        },
        sort: ['keyword:codepoint-ascending'],
      },
      warnings: [
        ...snapshot.warnings,
        ...marketWarnings(input.market),
        ...(normalized.length !== keywords.length
          ? [
              {
                code: 'duplicate-keywords-removed',
                field: 'keywords',
                message:
                  'Duplicate keywords were normalized and requested once.',
              },
            ]
          : []),
        ...(missingRows.length
          ? [
              {
                code: 'provider-keywords-omitted',
                field: 'keyword',
                message: `Ahrefs omitted ${missingRows.length} requested keyword${missingRows.length === 1 ? '' : 's'}.`,
              },
            ]
          : []),
        ...(invalidRows
          ? [
              {
                code: 'unexpected-provider-keywords',
                field: 'keyword',
                message: `Ahrefs returned ${invalidRows} unexpected or invalid keyword row${invalidRows === 1 ? '' : 's'}.`,
              },
            ]
          : []),
        ...(duplicateRows
          ? [
              {
                code: 'duplicate-provider-keywords',
                field: 'keyword',
                message: `Ahrefs returned ${duplicateRows} duplicate keyword row${duplicateRows === 1 ? '' : 's'}; conflicting fields are invalid.`,
              },
            ]
          : []),
      ],
    }
  }
}
