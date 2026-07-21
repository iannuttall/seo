import { KEYWORD_SET_FIELD_LIMITS, KEYWORD_SET_LIMITS } from './limits.js'
import {
  enforceKeywordSetLogicalBytes,
  type KeywordItemRow,
  type KeywordSetStoreOptions,
  requireSetRow,
  rowCount,
  rowToSet,
  storeDatabase,
} from './rows.js'
import type {
  KeywordSet,
  KeywordSetMutationItem,
  KeywordSetMutationResult,
} from './types.js'
import {
  boundedText,
  invalid,
  normalizeSavedKeyword,
  type ValidatedMutationItem,
  validateMutationItems,
} from './validation.js'

export function addKeywordsToSet(
  input: {
    projectId: string
    idOrName: string
    items: KeywordSetMutationItem[]
  },
  options: KeywordSetStoreOptions = {},
): KeywordSetMutationResult {
  const projectId = boundedText(
    input.projectId,
    'Project id',
    KEYWORD_SET_FIELD_LIMITS.projectId,
  )
  const idOrName = boundedText(
    input.idOrName,
    'Keyword set id or name',
    KEYWORD_SET_FIELD_LIMITS.name,
  )
  const items = validateMutationItems(input.items)
  const db = storeDatabase(options)
  const set = requireSetRow(db, projectId, idOrName)
  const currentSetCount = rowCount(
    db,
    'SELECT COUNT(*) AS count FROM keyword_set_items WHERE set_id = ?',
    set.id,
  )
  const currentTotalCount = rowCount(
    db,
    'SELECT COUNT(*) AS count FROM keyword_set_items',
  )
  const existingRows = db
    .prepare(
      `SELECT * FROM keyword_set_items
       WHERE set_id = ? AND normalized_keyword IN (${[...items].map(() => '?').join(', ')})`,
    )
    .all(set.id, ...items.keys()) as KeywordItemRow[]
  const existing = new Map(
    existingRows.map((row) => [row.normalized_keyword, row]),
  )
  const additions = items.size - existing.size
  if (currentSetCount + additions > KEYWORD_SET_LIMITS.keywordsPerSet) {
    invalid(
      `A keyword set can contain at most ${KEYWORD_SET_LIMITS.keywordsPerSet} keywords.`,
    )
  }
  if (currentTotalCount + additions > KEYWORD_SET_LIMITS.totalKeywords) {
    invalid(
      `At most ${KEYWORD_SET_LIMITS.totalKeywords} keywords can be saved across all sets.`,
    )
  }
  const now = (options.now ?? (() => new Date()))().getTime()
  const updated = new Set<string>()
  const mutate = db.transaction(() => {
    for (const [normalizedKeyword, item] of items) {
      const existingItem = existing.get(normalizedKeyword)
      if (!existingItem) {
        insertKeyword(db, set.id, normalizedKeyword, item, now)
      } else if (
        updateKeyword(db, set.id, normalizedKeyword, item, existingItem, now)
      ) {
        updated.add(normalizedKeyword)
      }
      if (addTags(db, set.id, normalizedKeyword, item.tags) && existingItem) {
        updated.add(normalizedKeyword)
        db.prepare(
          `UPDATE keyword_set_items SET updated_at = ?
           WHERE set_id = ? AND normalized_keyword = ?`,
        ).run(now, set.id, normalizedKeyword)
      }
    }
    if (additions > 0 || updated.size > 0) {
      db.prepare('UPDATE keyword_sets SET updated_at = ? WHERE id = ?').run(
        now,
        set.id,
      )
    }
    enforceKeywordSetLogicalBytes(db, options.maxLogicalBytes)
  })
  mutate.immediate()
  return {
    setId: set.id,
    requested: input.items.length,
    normalized: items.size,
    added: additions,
    removed: 0,
    existing: existing.size,
    updated: updated.size,
    keywordCount: currentSetCount + additions,
  }
}

function insertKeyword(
  db: ReturnType<typeof storeDatabase>,
  setId: string,
  normalizedKeyword: string,
  item: ValidatedMutationItem,
  now: number,
): void {
  db.prepare(
    `INSERT INTO keyword_set_items
     (set_id, normalized_keyword, display_keyword, metric_json, metric_provider,
      metric_observed_at, page_kind, page_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    setId,
    normalizedKeyword,
    item.keyword,
    item.metricJson,
    item.metric?.provider ?? null,
    item.metric?.observedAt ?? null,
    item.page?.kind ?? null,
    item.page?.url ?? null,
    now,
    now,
  )
}

function updateKeyword(
  db: ReturnType<typeof storeDatabase>,
  setId: string,
  normalizedKeyword: string,
  item: ValidatedMutationItem,
  existingItem: KeywordItemRow,
  now: number,
): boolean {
  const pageChanged =
    item.page !== undefined &&
    (existingItem.page_kind !== (item.page?.kind ?? null) ||
      existingItem.page_url !== (item.page?.url ?? null))
  const metricChanged =
    item.metric !== undefined && existingItem.metric_json !== item.metricJson
  if (!pageChanged && !metricChanged) return false
  db.prepare(
    `UPDATE keyword_set_items SET
       page_kind = CASE WHEN ? THEN ? ELSE page_kind END,
       page_url = CASE WHEN ? THEN ? ELSE page_url END,
       metric_json = CASE WHEN ? THEN ? ELSE metric_json END,
       metric_provider = CASE WHEN ? THEN ? ELSE metric_provider END,
       metric_observed_at = CASE WHEN ? THEN ? ELSE metric_observed_at END,
       updated_at = ?
     WHERE set_id = ? AND normalized_keyword = ?`,
  ).run(
    pageChanged ? 1 : 0,
    item.page?.kind ?? null,
    pageChanged ? 1 : 0,
    item.page?.url ?? null,
    metricChanged ? 1 : 0,
    item.metricJson,
    metricChanged ? 1 : 0,
    item.metric?.provider ?? null,
    metricChanged ? 1 : 0,
    item.metric?.observedAt ?? null,
    now,
    setId,
    normalizedKeyword,
  )
  return true
}

function addTags(
  db: ReturnType<typeof storeDatabase>,
  setId: string,
  normalizedKeyword: string,
  tags: string[],
): boolean {
  let changed = false
  for (const tag of tags) {
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO keyword_set_tags
         (set_id, normalized_keyword, tag) VALUES (?, ?, ?)`,
      )
      .run(setId, normalizedKeyword, tag)
    changed ||= inserted.changes > 0
  }
  return changed
}

export function removeKeywordsFromSet(
  input: { projectId: string; idOrName: string; keywords: string[] },
  options: KeywordSetStoreOptions = {},
): KeywordSetMutationResult {
  if (
    input.keywords.length < 1 ||
    input.keywords.length > KEYWORD_SET_LIMITS.mutationKeywords
  ) {
    invalid(
      `Remove 1 to ${KEYWORD_SET_LIMITS.mutationKeywords} keywords per operation.`,
    )
  }
  const projectId = boundedText(
    input.projectId,
    'Project id',
    KEYWORD_SET_FIELD_LIMITS.projectId,
  )
  const idOrName = boundedText(
    input.idOrName,
    'Keyword set id or name',
    KEYWORD_SET_FIELD_LIMITS.name,
  )
  const keywords = [...new Set(input.keywords.map(normalizeSavedKeyword))]
  const db = storeDatabase(options)
  const set = requireSetRow(db, projectId, idOrName)
  const removed = db
    .prepare(
      `DELETE FROM keyword_set_items
       WHERE set_id = ? AND normalized_keyword IN (${keywords.map(() => '?').join(', ')})`,
    )
    .run(set.id, ...keywords).changes
  const now = (options.now ?? (() => new Date()))().getTime()
  if (removed > 0) {
    db.prepare('UPDATE keyword_sets SET updated_at = ? WHERE id = ?').run(
      now,
      set.id,
    )
  }
  const keywordCount = rowCount(
    db,
    'SELECT COUNT(*) AS count FROM keyword_set_items WHERE set_id = ?',
    set.id,
  )
  return {
    setId: set.id,
    requested: input.keywords.length,
    normalized: keywords.length,
    added: 0,
    removed,
    existing: keywords.length - removed,
    updated: 0,
    keywordCount,
  }
}

export function setKeywordSetRefreshTime(
  input: { projectId: string; idOrName: string; refreshedAt: string },
  options: KeywordSetStoreOptions = {},
): KeywordSet {
  const projectId = boundedText(
    input.projectId,
    'Project id',
    KEYWORD_SET_FIELD_LIMITS.projectId,
  )
  const idOrName = boundedText(
    input.idOrName,
    'Keyword set id or name',
    KEYWORD_SET_FIELD_LIMITS.name,
  )
  const refreshedAt = Date.parse(input.refreshedAt)
  if (!Number.isFinite(refreshedAt)) invalid('Use a valid refresh timestamp.')
  const db = storeDatabase(options)
  const row = requireSetRow(db, projectId, idOrName)
  const now = (options.now ?? (() => new Date()))().getTime()
  db.prepare(
    'UPDATE keyword_sets SET last_refreshed_at = ?, updated_at = ? WHERE id = ?',
  ).run(refreshedAt, now, row.id)
  return rowToSet(requireSetRow(db, projectId, row.id))
}
