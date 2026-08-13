export function keywordSetsTableSql(
  table = 'keyword_sets',
  ifNotExists = true,
): string {
  return `CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${table} (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  market_json TEXT NOT NULL,
  provider TEXT,
  source_report TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_refreshed_at INTEGER,
  UNIQUE(project_id, name COLLATE NOCASE)
);`
}

export function keywordSetItemsTableSql(
  table = 'keyword_set_items',
  ifNotExists = true,
): string {
  return `CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${table} (
  set_id TEXT NOT NULL,
  normalized_keyword TEXT NOT NULL,
  display_keyword TEXT NOT NULL,
  metric_json TEXT,
  metric_provider TEXT,
  metric_observed_at TEXT,
  page_kind TEXT CHECK(page_kind IS NULL OR page_kind IN ('target', 'proposed')),
  page_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(set_id, normalized_keyword),
  FOREIGN KEY(set_id) REFERENCES keyword_sets(id) ON DELETE CASCADE
) WITHOUT ROWID;`
}

export const KEYWORD_SET_SCHEMA_SQL = `
${keywordSetsTableSql()}
CREATE INDEX IF NOT EXISTS idx_keyword_sets_project
  ON keyword_sets(project_id, updated_at DESC, id);

${keywordSetItemsTableSql()}
CREATE INDEX IF NOT EXISTS idx_keyword_set_items_set
  ON keyword_set_items(set_id, normalized_keyword);

CREATE TABLE IF NOT EXISTS keyword_set_tags (
  set_id TEXT NOT NULL,
  normalized_keyword TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY(set_id, normalized_keyword, tag),
  FOREIGN KEY(set_id, normalized_keyword)
    REFERENCES keyword_set_items(set_id, normalized_keyword) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_keyword_set_tags_lookup
  ON keyword_set_tags(set_id, tag, normalized_keyword);
`
