import { fetch } from 'undici'
import { readConfig } from '../storage/config.js'
import type {
  KeywordDataProvider,
  KeywordOverview,
  ProviderOpts,
  ProviderResult,
} from '../types.js'

export class DataForSeoProvider implements KeywordDataProvider {
  readonly name = 'dataforseo'
  readonly capabilities = {
    overview: true,
  }

  private getAuthHeader(): string {
    const config = readConfig()
    const login = config.providers.dataForSeoLogin
    const password = config.providers.dataForSeoPassword
    if (!login || !password) {
      throw new Error(
        'DataForSEO credentials missing. Add login and password to config.json.',
      )
    }
    return `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`
  }

  async keywordOverview(
    phrase: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordOverview>> {
    const response = await fetch(
      'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live',
      {
        method: 'POST',
        headers: {
          authorization: this.getAuthHeader(),
          'content-type': 'application/json',
        },
        body: JSON.stringify([
          {
            keyword: phrase,
            language_code: 'en',
            location_code: 2840,
          },
        ]),
      },
    )

    if (!response.ok) {
      throw new Error(`DataForSEO request failed with ${response.status}.`)
    }

    const json = (await response.json()) as {
      cost?: number
      tasks?: Array<{
        result?: Array<{
          keyword?: string
          search_volume?: number
          competition?: number
          cpc?: number
          keyword_difficulty?: number
        }>
      }>
    }

    const row = json.tasks?.[0]?.result?.[0]
    return {
      data: {
        phrase: row?.keyword ?? phrase,
        volume: row?.search_volume,
        competition: row?.competition,
        cpc: row?.cpc,
        difficulty: row?.keyword_difficulty,
      },
      usage: {
        provider: 'DataForSEO',
        units: 1,
        unitLabel: 'tasks',
        estimatedUsd: json.cost,
        calls: 1,
      },
      warnings: opts.database
        ? ['DataForSEO overview currently ignores the database option.']
        : undefined,
    }
  }
}
