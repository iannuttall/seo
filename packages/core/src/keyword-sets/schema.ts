export const KEYWORD_SET_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS keyword_sets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  market_json TEXT NOT NULL,
  provider TEXT CHECK(provider IS NULL OR provider IN ('dataforseo', 'semrush', 'ahrefs')),
  source_report TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_refreshed_at INTEGER,
  UNIQUE(project_id, name COLLATE NOCASE)
);
CREATE INDEX IF NOT EXISTS idx_keyword_sets_project
  ON keyword_sets(project_id, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS keyword_set_items (
  set_id TEXT NOT NULL,
  normalized_keyword TEXT NOT NULL,
  display_keyword TEXT NOT NULL,
  metric_json TEXT,
  metric_provider TEXT CHECK(metric_provider IS NULL OR metric_provider IN ('dataforseo', 'semrush', 'ahrefs')),
  metric_observed_at TEXT,
  page_kind TEXT CHECK(page_kind IS NULL OR page_kind IN ('target', 'proposed')),
  page_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(set_id, normalized_keyword),
  FOREIGN KEY(set_id) REFERENCES keyword_sets(id) ON DELETE CASCADE
) WITHOUT ROWID;
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
