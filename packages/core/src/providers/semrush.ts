import type {
  KeywordDataProvider,
  KeywordOverview,
  KeywordRow,
  ProviderOpts,
  ProviderResult,
} from '../types.js'
import { cachedSemrushCall } from './semrush/cache.js'
import { mapKeywordRows, mapOverview } from './semrush/mappers.js'
import {
  semrushDifficultyRowsSchema,
  semrushKeywordOverviewSchema,
  semrushKeywordRowsSchema,
} from './semrush/schemas.js'

export class SemrushProvider implements KeywordDataProvider {
  readonly name = 'semrush'
  readonly capabilities = {
    overview: true,
    batchOverview: true,
    related: true,
    broadMatch: true,
    questions: true,
    difficulty: true,
    urlKeywords: true,
    domainKeywords: true,
    maxBatchSize: 100,
  }

  async keywordOverview(
    phrase: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordOverview>> {
    return cachedSemrushCall(
      'phrase_this',
      {
        phrase,
        database: opts.database ?? 'us',
        export_columns: 'Ph,Nq,Cp,Co,Nr,Td,Kd',
      },
      mapOverview,
      semrushKeywordOverviewSchema,
      7 * 86_400_000,
      10,
      opts.refresh,
    )
  }

  async batchKeywordOverview(
    phrases: string[],
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordOverview[]>> {
    return cachedSemrushCall(
      'phrase_these',
      {
        phrase: phrases.join(';'),
        database: opts.database ?? 'us',
        export_columns: 'Ph,Nq,Cp,Co,Nr,Td,Kd',
      },
      (rows) =>
        mapKeywordRows(rows).map((row) => ({ ...row, phrase: row.phrase })),
      semrushKeywordRowsSchema,
      7 * 86_400_000,
      10,
      opts.refresh,
    )
  }

  async relatedKeywords(
    phrase: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordRow[]>> {
    return cachedSemrushCall(
      'phrase_related',
      {
        phrase,
        database: opts.database ?? 'us',
        display_limit: 20,
        export_columns: 'Ph,Nq,Kd,Cp,Co',
      },
      mapKeywordRows,
      semrushKeywordRowsSchema,
      14 * 86_400_000,
      40,
      opts.refresh,
    )
  }

  async questions(
    phrase: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordRow[]>> {
    return cachedSemrushCall(
      'phrase_questions',
      {
        phrase,
        database: opts.database ?? 'us',
        display_limit: 20,
        export_columns: 'Ph,Nq,Kd,Cp,Co',
      },
      mapKeywordRows,
      semrushKeywordRowsSchema,
      14 * 86_400_000,
      40,
      opts.refresh,
    )
  }

  async keywordDifficulty(
    phrases: string[],
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<{ phrase: string; kd: number }[]>> {
    return cachedSemrushCall(
      'phrase_kdi',
      {
        phrase: phrases.join(';'),
        database: opts.database ?? 'us',
        export_columns: 'Ph,Kd',
      },
      (rows) =>
        mapKeywordRows(rows).flatMap((row) =>
          row.difficulty === undefined
            ? []
            : [{ phrase: row.phrase, kd: row.difficulty }],
        ),
      semrushDifficultyRowsSchema,
      7 * 86_400_000,
      50,
      opts.refresh,
    )
  }

  async domainKeywords(
    domain: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordRow[]>> {
    return cachedSemrushCall(
      'domain_organic',
      {
        domain,
        database: opts.database ?? 'us',
        display_limit: 100,
        export_columns: 'Ph,Nq,Cp,Co,Kd,Po,Ur,Dn',
      },
      mapKeywordRows,
      semrushKeywordRowsSchema,
      7 * 86_400_000,
      10,
      opts.refresh,
    )
  }

  async urlKeywords(
    url: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordRow[]>> {
    return cachedSemrushCall(
      'url_organic',
      {
        url,
        database: opts.database ?? 'us',
        display_limit: 100,
        export_columns: 'Ph,Nq,Cp,Co,Kd,Po,Ur,Dn',
      },
      mapKeywordRows,
      semrushKeywordRowsSchema,
      7 * 86_400_000,
      10,
      opts.refresh,
    )
  }
}
