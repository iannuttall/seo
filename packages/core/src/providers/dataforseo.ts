import { randomUUID } from 'node:crypto'
import type {
  KeywordDataProvider,
  KeywordOverview,
  ProviderOpts,
  ProviderResult,
} from '../types.js'
import {
  DataForSeoClient,
  type DataForSeoClientOptions,
} from './dataforseo/client.js'
import {
  firstKeywordOverviewItem,
  optionalResultCount,
} from './dataforseo/schema.js'

type DataForSeoProviderOptions = DataForSeoClientOptions

export class DataForSeoProvider implements KeywordDataProvider {
  readonly name = 'dataforseo'
  readonly capabilities = {
    overview: true,
  }

  private readonly client: DataForSeoClient

  constructor(options: DataForSeoProviderOptions = {}) {
    this.client = new DataForSeoClient(options)
  }

  async keywordOverview(
    phrase: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordOverview>> {
    const snapshot = await this.client.keywordOverview({
      keywords: [phrase],
      languageCode: 'en',
      locationCode: 2840,
      refresh: opts.refresh,
      reportId: 'legacy-keyword-overview',
      reportRunId: randomUUID(),
    })
    const row = firstKeywordOverviewItem(snapshot.response)
    const keywordInfo = row?.keyword_info
    const warnings = [
      ...snapshot.warnings.map((warning) => warning.message),
      ...(opts.database
        ? ['DataForSEO overview currently ignores the database option.']
        : []),
      ...(!row
        ? ['DataForSEO returned no keyword item for the requested phrase.']
        : []),
      ...(snapshot.spendNotice
        ? [
            `Local DataForSEO spend reached ${snapshot.spendNotice.spentMicros} micros for the UTC day.`,
          ]
        : []),
    ]
    return {
      data: {
        phrase: row?.keyword ?? phrase,
        volume: keywordInfo?.search_volume ?? undefined,
        competition: keywordInfo?.competition ?? undefined,
        cpc: keywordInfo?.cpc ?? undefined,
        difficulty: row?.keyword_properties?.keyword_difficulty ?? undefined,
        intent: row?.search_intent_info?.main_intent ?? undefined,
        results: optionalResultCount(row?.serp_info?.se_results_count),
      },
      usage: {
        provider: 'DataForSEO',
        units: snapshot.cache.status === 'hit' ? 0 : 1,
        unitLabel: 'tasks',
        estimatedUsd:
          (snapshot.cost.actualMicros ?? snapshot.cost.estimatedMicros ?? 0) /
          1_000_000,
        calls: 1,
        cacheHits: snapshot.cache.status === 'hit' ? 1 : 0,
      },
      warnings: warnings.length ? warnings : undefined,
      cached: snapshot.cache.status === 'hit',
    }
  }
}
