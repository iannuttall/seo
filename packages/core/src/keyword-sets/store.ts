import { randomUUID } from 'node:crypto'
import { SeoError } from '../errors.js'
import { providerIdSchema, searchMarketSchema } from '../providers/contracts.js'
import { KEYWORD_SET_FIELD_LIMITS, KEYWORD_SET_LIMITS } from './limits.js'
import {
  enforceKeywordSetLogicalBytes,
  findSetRow,
  type KeywordItemRow,
  type KeywordSetRow,
  type KeywordSetStoreOptions,
  requireSetRow,
  rowCount,
  rowToSet,
  SET_SELECT,
  storeDatabase,
} from './rows.js'
import type {
  KeywordSet,
  KeywordSetDetail,
  KeywordSetItem,
  KeywordSetPageMapping,
  SavedKeywordMetric,
} from './types.js'
import {
  boundedText,
  invalid,
  normalizeSavedKeyword,
  parseStoredJson,
  savedMetricSchema,
} from './validation.js'

export function createKeywordSet(
  input: {
    projectId: string
    name: string
    market: unknown
    provider?: unknown
    sourceReport?: string
  },
  options: KeywordSetStoreOptions = {},
): KeywordSet {
  const projectId = boundedText(
    input.projectId,
    'Project id',
    KEYWORD_SET_FIELD_LIMITS.projectId,
  )
  const name = boundedText(
    input.name,
    'Keyword set name',
    KEYWORD_SET_FIELD_LIMITS.name,
  )
  const market = searchMarketSchema.safeParse(input.market)
  if (!market.success) invalid('Use a valid search market.')
  const provider =
    input.provider === undefined
      ? undefined
      : providerIdSchema.safeParse(input.provider)
  if (provider && !provider.success)
    invalid('Use a supported keyword provider.')
  const sourceReport = input.sourceReport
    ? boundedText(
        input.sourceReport,
        'Source report',
        KEYWORD_SET_FIELD_LIMITS.sourceReport,
      )
    : null
  const db = storeDatabase(options)
  if (
    rowCount(db, 'SELECT COUNT(*) AS count FROM keyword_sets') >=
    KEYWORD_SET_LIMITS.totalSets
  ) {
    invalid(
      `At most ${KEYWORD_SET_LIMITS.totalSets} keyword sets can be saved.`,
    )
  }
  if (
    rowCount(
      db,
      'SELECT COUNT(*) AS count FROM keyword_sets WHERE project_id = ?',
      projectId,
    ) >= KEYWORD_SET_LIMITS.setsPerProject
  ) {
    invalid(
      `A project can have at most ${KEYWORD_SET_LIMITS.setsPerProject} keyword sets.`,
    )
  }
  const now = (options.now ?? (() => new Date()))().getTime()
  const id = (options.id ?? randomUUID)()
  try {
    const create = db.transaction(() => {
      db.prepare(
        `INSERT INTO keyword_sets
         (id, project_id, name, market_json, provider, source_report, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        projectId,
        name,
        JSON.stringify(market.data),
        provider?.data ?? null,
        sourceReport,
        now,
        now,
      )
      enforceKeywordSetLogicalBytes(db, options.maxLogicalBytes)
    })
    create.immediate()
  } catch (error) {
    if (/unique constraint/i.test(String(error))) {
      invalid(`A keyword set named ${name} already exists for this project.`)
    }
    throw error
  }
  return rowToSet(requireSetRow(db, projectId, id))
}

export function listKeywordSets(
  input: { projectId: string; limit?: number; offset?: number },
  options: KeywordSetStoreOptions = {},
): KeywordSet[] {
  const projectId = boundedText(
    input.projectId,
    'Project id',
    KEYWORD_SET_FIELD_LIMITS.projectId,
  )
  const limit = input.limit ?? 100
  const offset = input.offset ?? 0
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    invalid('Keyword set list limit must be from 1 to 100.')
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    invalid('Keyword set list offset must be zero or greater.')
  }
  return (
    storeDatabase(options)
      .prepare(
        `${SET_SELECT}
         WHERE sets.project_id = ?
         ORDER BY sets.updated_at DESC, sets.id
         LIMIT ? OFFSET ?`,
      )
      .all(projectId, limit, offset) as KeywordSetRow[]
  ).map(rowToSet)
}

export function getKeywordSet(
  input: {
    projectId: string
    idOrName: string
    tag?: string
    limit?: number
    offset?: number
  },
  options: KeywordSetStoreOptions = {},
): KeywordSetDetail {
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
  const tag = input.tag
    ? boundedText(input.tag, 'Tag', KEYWORD_SET_FIELD_LIMITS.tag).toLowerCase()
    : null
  const limit = input.limit ?? 100
  const offset = input.offset ?? 0
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > KEYWORD_SET_LIMITS.outputRows
  ) {
    invalid(
      `Keyword set output limit must be from 1 to ${KEYWORD_SET_LIMITS.outputRows}.`,
    )
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    invalid('Keyword set output offset must be zero or greater.')
  }
  const db = storeDatabase(options)
  const setRow = requireSetRow(db, projectId, idOrName)
  const filterSql = tag
    ? `AND EXISTS (
        SELECT 1 FROM keyword_set_tags filter_tags
        WHERE filter_tags.set_id = items.set_id
          AND filter_tags.normalized_keyword = items.normalized_keyword
          AND filter_tags.tag = ?
      )`
    : ''
  const params = tag ? [setRow.id, tag] : [setRow.id]
  const total = rowCount(
    db,
    `SELECT COUNT(*) AS count FROM keyword_set_items items
     WHERE items.set_id = ? ${filterSql}`,
    ...params,
  )
  const rows = db
    .prepare(
      `SELECT items.* FROM keyword_set_items items
       WHERE items.set_id = ? ${filterSql}
       ORDER BY items.normalized_keyword
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as KeywordItemRow[]
  const tagsByKeyword = loadTags(db, setRow.id, rows)
  const items: KeywordSetItem[] = rows.map((row) =>
    itemFromRow(row, tagsByKeyword.get(row.normalized_keyword) ?? []),
  )
  return {
    schemaVersion: 1,
    set: rowToSet(setRow),
    items,
    pagination: {
      offset,
      limit,
      returned: items.length,
      total,
      nextOffset: offset + items.length < total ? offset + items.length : null,
    },
    filter: { tag },
  }
}

function loadTags(
  db: ReturnType<typeof storeDatabase>,
  setId: string,
  rows: KeywordItemRow[],
): Map<string, string[]> {
  if (rows.length === 0) return new Map()
  const tagRows = db
    .prepare(
      `SELECT normalized_keyword, tag FROM keyword_set_tags
       WHERE set_id = ? AND normalized_keyword IN (${rows.map(() => '?').join(', ')})
       ORDER BY normalized_keyword, tag`,
    )
    .all(setId, ...rows.map((row) => row.normalized_keyword)) as Array<{
    normalized_keyword: string
    tag: string
  }>
  const tagsByKeyword = new Map<string, string[]>()
  for (const row of tagRows) {
    const tags = tagsByKeyword.get(row.normalized_keyword) ?? []
    tags.push(row.tag)
    tagsByKeyword.set(row.normalized_keyword, tags)
  }
  return tagsByKeyword
}

function itemFromRow(row: KeywordItemRow, tags: string[]): KeywordSetItem {
  const latestMetric = row.metric_json
    ? parseStoredJson(
        row.metric_json,
        savedMetricSchema,
        'Saved keyword metric',
      )
    : null
  if (
    latestMetric &&
    (latestMetric.provider !== row.metric_provider ||
      latestMetric.observedAt !== row.metric_observed_at ||
      normalizeSavedKeyword(latestMetric.metric.keyword) !==
        row.normalized_keyword)
  ) {
    throw new SeoError(
      'INTERNAL_ERROR',
      'Saved keyword metric metadata is inconsistent.',
    )
  }
  const page =
    row.page_kind && row.page_url
      ? ({ kind: row.page_kind, url: row.page_url } as KeywordSetPageMapping)
      : null
  return {
    keyword: row.display_keyword,
    normalizedKeyword: row.normalized_keyword,
    tags,
    page,
    latestMetric: latestMetric as SavedKeywordMetric | null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export function deleteKeywordSet(
  input: { projectId: string; idOrName: string },
  options: KeywordSetStoreOptions = {},
): boolean {
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
  const db = storeDatabase(options)
  const row = findSetRow(db, projectId, idOrName)
  if (!row) return false
  return (
    db.prepare('DELETE FROM keyword_sets WHERE id = ?').run(row.id).changes > 0
  )
}
