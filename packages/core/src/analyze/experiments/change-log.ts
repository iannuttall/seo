import { randomUUID } from 'node:crypto'
import { getDb } from '../../storage/database.js'
import { changeFromRow } from './mappers.js'
import type { ChangeRow, ChangeScope, SeoChange } from './types.js'

export function recordChange(input: {
  site: string
  scope: ChangeScope
  target: string
  title: string
  description?: string
  changedAt: string
}): SeoChange {
  const change: SeoChange = {
    id: randomUUID(),
    site: input.site,
    scope: input.scope,
    target: input.target,
    title: input.title,
    description: input.description,
    changedAt: input.changedAt,
    createdAt: new Date().toISOString(),
  }

  getDb()
    .prepare(
      `INSERT INTO seo_changes
      (id, site_url, scope, target, title, description, changed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      change.id,
      change.site,
      change.scope,
      change.target,
      change.title,
      change.description ?? null,
      change.changedAt,
      Date.parse(change.createdAt),
    )

  return change
}

export function listChanges(
  input: { site?: string; limit?: number } = {},
): SeoChange[] {
  const limit = input.limit ?? 25
  const rows = input.site
    ? (getDb()
        .prepare(
          'SELECT * FROM seo_changes WHERE site_url = ? ORDER BY changed_at DESC, created_at DESC LIMIT ?',
        )
        .all(input.site, limit) as ChangeRow[])
    : (getDb()
        .prepare(
          'SELECT * FROM seo_changes ORDER BY changed_at DESC, created_at DESC LIMIT ?',
        )
        .all(limit) as ChangeRow[])
  return rows.map(changeFromRow)
}

export function getChange(id: string): SeoChange | undefined {
  const row = getDb()
    .prepare('SELECT * FROM seo_changes WHERE id = ?')
    .get(id) as ChangeRow | undefined
  return row ? changeFromRow(row) : undefined
}

export function deleteChange(id: string): boolean {
  return (
    getDb().prepare('DELETE FROM seo_changes WHERE id = ?').run(id).changes > 0
  )
}
