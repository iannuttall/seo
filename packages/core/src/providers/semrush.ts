import { fetch } from 'undici'
import { readConfig } from '../storage/config.js'
import { getDb, hashKey } from '../storage/database.js'
import type {
  KeywordDataProvider,
  KeywordOverview,
  KeywordRow,
  ProviderOpts,
  ProviderResult,
} from '../types.js'

const BASE_URL = 'https://api.semrush.com/'

function parseSemicolonCsv(text: string): string[][] {
  return text
    .trim()
    .split('\n')
    .map((line) =>
      line.split(';').map((cell) => cell.replace(/^"|"$/g, '').trim()),
    )
}

function estimateUsd(units: number): number {
  return (units / 1000) * 0.05
}

async function cachedCall<T>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
  map: (rows: string[][]) => T,
  ttlMs: number,
  creditsPerLine: number,
  refresh = false,
): Promise<ProviderResult<T>> {
  const config = readConfig()
  const apiKey = config.providers.semrushApiKey
  if (!apiKey) {
    throw new Error('Semrush API key missing. Add it to config.json first.')
  }

  const requestParams = Object.fromEntries(
    Object.entries({ ...params, key: apiKey, type: endpoint }).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Record<string, string>

  const db = getDb()
  const queryHash = hashKey([endpoint, requestParams])
  const cached = db
    .prepare(
      'SELECT response_json, credits_used FROM semrush_cache WHERE endpoint = ? AND query_hash = ? AND expires_at > ?',
    )
    .get(endpoint, queryHash, Date.now()) as
    | { response_json?: string; credits_used?: number }
    | undefined

  if (!refresh && cached?.response_json) {
    return {
      data: JSON.parse(cached.response_json) as T,
      usage: {
        provider: 'Semrush',
        units: cached.credits_used ?? 0,
        unitLabel: 'units',
        estimatedUsd: estimateUsd(cached.credits_used ?? 0),
        calls: 1,
        cacheHits: 1,
      },
      cached: true,
    }
  }

  const url = new URL(BASE_URL)
  url.search = new URLSearchParams(requestParams).toString()

  const response = await fetch(url)
  const text = await response.text()
  if (!response.ok || text.startsWith('ERROR ::')) {
    throw new Error(text || `Semrush request failed with ${response.status}.`)
  }

  const rows = parseSemicolonCsv(text)
  const data = map(rows)
  const credits = Math.max(0, rows.length - 1) * creditsPerLine

  db.prepare(
    `INSERT OR REPLACE INTO semrush_cache
    (endpoint, query_hash, request_json, response_json, credits_used, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    endpoint,
    queryHash,
    JSON.stringify(requestParams),
    JSON.stringify(data),
    credits,
    Date.now(),
    Date.now() + ttlMs,
  )

  return {
    data,
    usage: {
      provider: 'Semrush',
      units: credits,
      unitLabel: 'units',
      estimatedUsd: estimateUsd(credits),
      calls: 1,
    },
  }
}

function mapOverview(rows: string[][]): KeywordOverview {
  const [header, first] = rows
  if (!header || !first) {
    return { phrase: '' }
  }

  const record = Object.fromEntries(
    header.map((key, index) => [key, first[index]]),
  )
  return {
    phrase: record.Ph ?? '',
    volume: Number(record.Nq ?? 0) || undefined,
    cpc: Number(record.Cp ?? 0) || undefined,
    competition: Number(record.Co ?? 0) || undefined,
    difficulty: Number(record.Kd ?? 0) || undefined,
    results: Number(record.Nr ?? 0) || undefined,
  }
}

function mapKeywordRows(rows: string[][]): KeywordRow[] {
  const [header, ...body] = rows
  if (!header) {
    return []
  }

  return body.map((row) => {
    const record = Object.fromEntries(
      header.map((key, index) => [key, row[index]]),
    )
    return {
      phrase: record.Ph ?? '',
      volume: Number(record.Nq ?? 0) || undefined,
      difficulty: Number(record.Kd ?? 0) || undefined,
      cpc: Number(record.Cp ?? 0) || undefined,
      competition: Number(record.Co ?? 0) || undefined,
      url: record.Ur,
      domain: record.Dn,
      position: Number(record.Po ?? 0) || undefined,
    }
  })
}

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
    return cachedCall(
      'phrase_this',
      {
        phrase,
        database: opts.database ?? 'us',
        export_columns: 'Ph,Nq,Cp,Co,Nr,Td,Kd',
      },
      mapOverview,
      7 * 86_400_000,
      10,
      opts.refresh,
    )
  }

  async batchKeywordOverview(
    phrases: string[],
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordOverview[]>> {
    return cachedCall(
      'phrase_these',
      {
        phrase: phrases.join(';'),
        database: opts.database ?? 'us',
        export_columns: 'Ph,Nq,Cp,Co,Nr,Td,Kd',
      },
      (rows) =>
        mapKeywordRows(rows).map((row) => ({ ...row, phrase: row.phrase })),
      7 * 86_400_000,
      10,
      opts.refresh,
    )
  }

  async relatedKeywords(
    phrase: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordRow[]>> {
    return cachedCall(
      'phrase_related',
      {
        phrase,
        database: opts.database ?? 'us',
        display_limit: 20,
        export_columns: 'Ph,Nq,Kd,Cp,Co',
      },
      mapKeywordRows,
      14 * 86_400_000,
      40,
      opts.refresh,
    )
  }

  async questions(
    phrase: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordRow[]>> {
    return cachedCall(
      'phrase_questions',
      {
        phrase,
        database: opts.database ?? 'us',
        display_limit: 20,
        export_columns: 'Ph,Nq,Kd,Cp,Co',
      },
      mapKeywordRows,
      14 * 86_400_000,
      40,
      opts.refresh,
    )
  }

  async keywordDifficulty(
    phrases: string[],
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<{ phrase: string; kd: number }[]>> {
    return cachedCall(
      'phrase_kdi',
      {
        phrase: phrases.join(';'),
        database: opts.database ?? 'us',
        export_columns: 'Ph,Kd',
      },
      (rows) =>
        mapKeywordRows(rows).map((row) => ({
          phrase: row.phrase,
          kd: row.difficulty ?? 0,
        })),
      7 * 86_400_000,
      50,
      opts.refresh,
    )
  }

  async domainKeywords(
    domain: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordRow[]>> {
    return cachedCall(
      'domain_organic',
      {
        domain,
        database: opts.database ?? 'us',
        display_limit: 100,
        export_columns: 'Ph,Nq,Cp,Co,Kd,Po,Ur,Dn',
      },
      mapKeywordRows,
      7 * 86_400_000,
      10,
      opts.refresh,
    )
  }

  async urlKeywords(
    url: string,
    opts: ProviderOpts = {},
  ): Promise<ProviderResult<KeywordRow[]>> {
    return cachedCall(
      'url_organic',
      {
        url,
        database: opts.database ?? 'us',
        display_limit: 100,
        export_columns: 'Ph,Nq,Cp,Co,Kd,Po,Ur,Dn',
      },
      mapKeywordRows,
      7 * 86_400_000,
      10,
      opts.refresh,
    )
  }
}
