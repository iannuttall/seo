import type {
  ChangeRow,
  ContentGroup,
  ContentGroupRow,
  SeoChange,
} from './types.js'

function toIsoDate(value: number): string {
  return new Date(value).toISOString()
}

export function groupFromRow(row: ContentGroupRow): ContentGroup {
  return {
    id: row.id,
    site: row.site_url,
    name: row.name,
    dimension: row.dimension,
    matchType: row.match_type,
    pattern: row.pattern,
    createdAt: toIsoDate(row.created_at),
  }
}

export function changeFromRow(row: ChangeRow): SeoChange {
  return {
    id: row.id,
    site: row.site_url,
    scope: row.scope,
    target: row.target,
    title: row.title,
    description: row.description ?? undefined,
    changedAt: row.changed_at,
    createdAt: toIsoDate(row.created_at),
  }
}
