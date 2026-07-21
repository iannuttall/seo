import { SeoError } from '../errors.js'
import { providerIdSchema, searchMarketSchema } from '../providers/contracts.js'
import { getDb } from '../storage/database.js'
import type Database from '../storage/sqlite.js'
import { KEYWORD_SET_LIMITS } from './limits.js'
import type { KeywordSet } from './types.js'
import { invalid, parseStoredJson } from './validation.js'

export type KeywordSetStoreOptions = {
  database?: Database.Database
  now?: () => Date
  id?: () => string
  maxLogicalBytes?: number
}

export type KeywordSetRow = {
  id: string
  project_id: string
  name: string
  market_json: string
  provider: string | null
  source_report: string | null
  created_at: number
  updated_at: number
  last_refreshed_at: number | null
  keyword_count: number
  tag_count: number
}

export type KeywordItemRow = {
  normalized_keyword: string
  display_keyword: string
  metric_json: string | null
  metric_provider: string | null
  metric_observed_at: string | null
  page_kind: string | null
  page_url: string | null
  created_at: number
  updated_at: number
}

export const SET_SELECT = `
  SELECT sets.*,
    (SELECT COUNT(*) FROM keyword_set_items items WHERE items.set_id = sets.id) AS keyword_count,
    (SELECT COUNT(DISTINCT tags.tag) FROM keyword_set_tags tags WHERE tags.set_id = sets.id) AS tag_count
  FROM keyword_sets sets`

export function storeDatabase(
  options: KeywordSetStoreOptions,
): Database.Database {
  return options.database ?? getDb()
}

export function rowToSet(row: KeywordSetRow): KeywordSet {
  const provider = row.provider
    ? providerIdSchema.safeParse(row.provider)
    : undefined
  if (provider && !provider.success) {
    throw new SeoError(
      'INTERNAL_ERROR',
      'Saved keyword set provider is invalid.',
    )
  }
  return {
    schemaVersion: 1,
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    market: parseStoredJson(
      row.market_json,
      searchMarketSchema,
      'Saved search market',
    ),
    provider: provider?.data ?? null,
    sourceReport: row.source_report,
    keywordCount: row.keyword_count,
    tagCount: row.tag_count,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    lastRefreshedAt:
      row.last_refreshed_at === null
        ? null
        : new Date(row.last_refreshed_at).toISOString(),
  }
}

export function findSetRow(
  db: Database.Database,
  projectId: string,
  idOrName: string,
): KeywordSetRow | undefined {
  return db
    .prepare(
      `${SET_SELECT}
       WHERE sets.project_id = ?
         AND (sets.id = ? OR sets.name = ? COLLATE NOCASE)
       ORDER BY CASE WHEN sets.id = ? THEN 0 ELSE 1 END
       LIMIT 1`,
    )
    .get(projectId, idOrName, idOrName, idOrName) as KeywordSetRow | undefined
}

export function requireSetRow(
  db: Database.Database,
  projectId: string,
  idOrName: string,
): KeywordSetRow {
  const row = findSetRow(db, projectId, idOrName)
  if (!row) invalid(`Keyword set not found: ${idOrName}`)
  return row
}

export function rowCount(
  db: Database.Database,
  sql: string,
  ...params: unknown[]
): number {
  return (db.prepare(sql).get(...params) as { count: number }).count
}

export function keywordSetLogicalBytes(
  db: Database.Database = getDb(),
): number {
  const row = db
    .prepare(
      `SELECT
        COALESCE((SELECT SUM(length(id) + length(project_id) + length(name) + length(market_json) + COALESCE(length(provider), 0) + COALESCE(length(source_report), 0)) FROM keyword_sets), 0) +
        COALESCE((SELECT SUM(length(set_id) + length(normalized_keyword) + length(display_keyword) + COALESCE(length(metric_json), 0) + COALESCE(length(metric_provider), 0) + COALESCE(length(metric_observed_at), 0) + COALESCE(length(page_kind), 0) + COALESCE(length(page_url), 0)) FROM keyword_set_items), 0) +
        COALESCE((SELECT SUM(length(set_id) + length(normalized_keyword) + length(tag)) FROM keyword_set_tags), 0)
        AS bytes`,
    )
    .get() as { bytes: number }
  return row.bytes
}

export function enforceKeywordSetLogicalBytes(
  db: Database.Database,
  maxLogicalBytes = KEYWORD_SET_LIMITS.logicalBytes,
): void {
  if (keywordSetLogicalBytes(db) > maxLogicalBytes) {
    invalid(
      `Saved keyword data cannot exceed ${maxLogicalBytes} logical bytes. Remove an unused set before adding more.`,
    )
  }
}
