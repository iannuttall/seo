import { randomUUID } from 'node:crypto'
import { getDb } from '../../storage/database.js'
import { groupFromRow } from './mappers.js'
import type {
  ContentGroup,
  ContentGroupDimension,
  ContentGroupMatchType,
  ContentGroupRow,
} from './types.js'

export function createContentGroup(input: {
  site: string
  name: string
  dimension?: ContentGroupDimension
  matchType?: ContentGroupMatchType
  pattern: string
}): ContentGroup {
  const group: ContentGroup = {
    id: randomUUID(),
    site: input.site,
    name: input.name,
    dimension: input.dimension ?? 'page',
    matchType: input.matchType ?? 'contains',
    pattern: input.pattern,
    createdAt: new Date().toISOString(),
  }

  getDb()
    .prepare(
      `INSERT INTO content_groups
      (id, site_url, name, dimension, match_type, pattern, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      group.id,
      group.site,
      group.name,
      group.dimension,
      group.matchType,
      group.pattern,
      Date.parse(group.createdAt),
    )

  return group
}

export function listContentGroups(site?: string): ContentGroup[] {
  const sql = site
    ? 'SELECT * FROM content_groups WHERE site_url = ? ORDER BY created_at DESC'
    : 'SELECT * FROM content_groups ORDER BY created_at DESC'
  const rows = site
    ? (getDb().prepare(sql).all(site) as ContentGroupRow[])
    : (getDb().prepare(sql).all() as ContentGroupRow[])
  return rows.map(groupFromRow)
}

export function getContentGroup(id: string): ContentGroup | undefined {
  const row = getDb()
    .prepare('SELECT * FROM content_groups WHERE id = ?')
    .get(id) as ContentGroupRow | undefined
  return row ? groupFromRow(row) : undefined
}

export function deleteContentGroup(id: string): boolean {
  return (
    getDb().prepare('DELETE FROM content_groups WHERE id = ?').run(id).changes >
    0
  )
}
