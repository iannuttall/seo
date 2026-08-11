import { AI_PROMPT_OBSERVATION_SCHEMA_SQL } from '../ai-prompt-observations/schema.js'
import { KEYWORD_SET_SCHEMA_SQL } from '../keyword-sets/schema.js'
import { RANK_TRACKING_SCHEMA_SQL } from '../rank-tracking/schema.js'
import type Database from './sqlite.js'

const PROVIDER_TABLES = [
  'keyword_sets',
  'keyword_set_items',
  'rank_tracking_configs',
  'rank_tracking_snapshots',
  'ai_prompt_observations',
] as const

function tableSql(database: Database.Database, table: string): string {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { sql?: string } | undefined
  return row?.sql ?? ''
}

export function migrateSerpBaseProviderIds(
  database: Database.Database,
): boolean {
  const needsMigration = PROVIDER_TABLES.some((table) => {
    const sql = tableSql(database, table)
    return sql.includes("'dataforseo'") && !sql.includes("'serpbase'")
  })
  if (!needsMigration) return false

  database.pragma('foreign_keys = OFF')
  database.pragma('legacy_alter_table = ON')
  try {
    const migrate = database.transaction(() => {
      database.exec(`
CREATE TABLE keyword_sets_serpbase_next (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  market_json TEXT NOT NULL,
  provider TEXT CHECK(provider IS NULL OR provider IN ('dataforseo', 'semrush', 'ahrefs', 'serpbase')),
  source_report TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_refreshed_at INTEGER,
  UNIQUE(project_id, name COLLATE NOCASE)
);
INSERT INTO keyword_sets_serpbase_next SELECT * FROM keyword_sets;

CREATE TABLE keyword_set_items_serpbase_next (
  set_id TEXT NOT NULL,
  normalized_keyword TEXT NOT NULL,
  display_keyword TEXT NOT NULL,
  metric_json TEXT,
  metric_provider TEXT CHECK(metric_provider IS NULL OR metric_provider IN ('dataforseo', 'semrush', 'ahrefs', 'serpbase')),
  metric_observed_at TEXT,
  page_kind TEXT CHECK(page_kind IS NULL OR page_kind IN ('target', 'proposed')),
  page_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(set_id, normalized_keyword),
  FOREIGN KEY(set_id) REFERENCES keyword_sets(id) ON DELETE CASCADE
) WITHOUT ROWID;
INSERT INTO keyword_set_items_serpbase_next SELECT * FROM keyword_set_items;

CREATE TABLE keyword_set_tags_serpbase_next (
  set_id TEXT NOT NULL,
  normalized_keyword TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY(set_id, normalized_keyword, tag),
  FOREIGN KEY(set_id, normalized_keyword)
    REFERENCES keyword_set_items(set_id, normalized_keyword) ON DELETE CASCADE
) WITHOUT ROWID;
INSERT INTO keyword_set_tags_serpbase_next SELECT * FROM keyword_set_tags;

CREATE TABLE rank_tracking_configs_serpbase_next (
  id TEXT PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  keyword_set_id TEXT NOT NULL,
  target_domain TEXT NOT NULL,
  tag TEXT,
  market_json TEXT NOT NULL,
  devices_json TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('dataforseo', 'semrush', 'ahrefs', 'serpbase')),
  collection_method TEXT NOT NULL CHECK(collection_method IN ('live', 'queued')),
  cadence TEXT NOT NULL CHECK(cadence IN ('manual', 'daily', 'weekly', 'monthly')),
  depth INTEGER NOT NULL CHECK(depth BETWEEN 1 AND 100),
  keyword_limit INTEGER NOT NULL CHECK(keyword_limit BETWEEN 1 AND 1000),
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(keyword_set_id) REFERENCES keyword_sets(id) ON DELETE CASCADE
);
INSERT INTO rank_tracking_configs_serpbase_next SELECT * FROM rank_tracking_configs;

CREATE TABLE rank_tracking_runs_serpbase_next (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('pending', 'partial', 'failed', 'complete')),
  collection_method TEXT NOT NULL CHECK(collection_method IN ('live', 'queued')),
  scheduled_for INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  keyword_count INTEGER NOT NULL,
  task_count INTEGER NOT NULL,
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost_micros INTEGER,
  actual_cost_micros INTEGER,
  config_snapshot_json TEXT NOT NULL,
  error_summary TEXT,
  FOREIGN KEY(config_id) REFERENCES rank_tracking_configs(id) ON DELETE CASCADE
);
INSERT INTO rank_tracking_runs_serpbase_next SELECT * FROM rank_tracking_runs;

CREATE TABLE rank_tracking_tasks_serpbase_next (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  normalized_keyword TEXT NOT NULL,
  display_keyword TEXT NOT NULL,
  device TEXT NOT NULL CHECK(device IN ('desktop', 'mobile')),
  state TEXT NOT NULL CHECK(state IN ('pending', 'posting', 'posted', 'complete', 'failed')),
  provider_task_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  posted_at INTEGER,
  collected_at INTEGER,
  error_code TEXT,
  error_message TEXT,
  UNIQUE(run_id, normalized_keyword, device),
  UNIQUE(provider_task_id),
  FOREIGN KEY(run_id) REFERENCES rank_tracking_runs(id) ON DELETE CASCADE
);
INSERT INTO rank_tracking_tasks_serpbase_next SELECT * FROM rank_tracking_tasks;

CREATE TABLE rank_tracking_snapshots_serpbase_next (
  task_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  normalized_keyword TEXT NOT NULL,
  display_keyword TEXT NOT NULL,
  device TEXT NOT NULL CHECK(device IN ('desktop', 'mobile')),
  observation_state TEXT NOT NULL CHECK(observation_state IN ('observed', 'not_observed_within_depth')),
  organic_position INTEGER,
  absolute_position INTEGER,
  ranking_url TEXT,
  observed_features_json TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('dataforseo', 'semrush', 'ahrefs', 'serpbase')),
  provider_task_id TEXT,
  requested_depth INTEGER NOT NULL,
  returned_rows INTEGER,
  retained_rows INTEGER,
  invalid_rows INTEGER NOT NULL,
  completeness TEXT NOT NULL,
  estimated_cost_micros INTEGER,
  actual_cost_micros INTEGER,
  warnings_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(task_id) REFERENCES rank_tracking_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES rank_tracking_runs(id) ON DELETE CASCADE
);
INSERT INTO rank_tracking_snapshots_serpbase_next SELECT * FROM rank_tracking_snapshots;

CREATE TABLE ai_prompt_observations_serpbase_next (
  id TEXT PRIMARY KEY,
  comparison_key TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_group TEXT,
  prompt TEXT NOT NULL,
  surface TEXT NOT NULL CHECK(surface IN ('chatgpt', 'claude', 'gemini', 'perplexity')),
  requested_model TEXT NOT NULL,
  effective_model TEXT NOT NULL,
  country_code TEXT NOT NULL,
  language_code TEXT NOT NULL,
  web_search_requested INTEGER NOT NULL CHECK(web_search_requested IN (0, 1)),
  web_search_observed INTEGER CHECK(web_search_observed IN (0, 1)),
  max_output_tokens INTEGER NOT NULL CHECK(max_output_tokens BETWEEN 1 AND 4096),
  answer TEXT NOT NULL,
  answer_truncated INTEGER NOT NULL CHECK(answer_truncated IN (0, 1)),
  citations_json TEXT NOT NULL,
  fan_out_queries_json TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  model_cost_micros INTEGER,
  estimated_cost_micros INTEGER,
  actual_cost_micros INTEGER,
  checked_at TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('dataforseo', 'semrush', 'ahrefs', 'serpbase')),
  provider_task_ids_json TEXT NOT NULL,
  completeness TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO ai_prompt_observations_serpbase_next SELECT * FROM ai_prompt_observations;

DROP TABLE rank_tracking_snapshots;
DROP TABLE rank_tracking_tasks;
DROP TABLE rank_tracking_runs;
DROP TABLE rank_tracking_configs;
DROP TABLE keyword_set_tags;
DROP TABLE keyword_set_items;
DROP TABLE keyword_sets;
DROP TABLE ai_prompt_observations;

ALTER TABLE keyword_sets_serpbase_next RENAME TO keyword_sets;
ALTER TABLE keyword_set_items_serpbase_next RENAME TO keyword_set_items;
ALTER TABLE keyword_set_tags_serpbase_next RENAME TO keyword_set_tags;
ALTER TABLE rank_tracking_configs_serpbase_next RENAME TO rank_tracking_configs;
ALTER TABLE rank_tracking_runs_serpbase_next RENAME TO rank_tracking_runs;
ALTER TABLE rank_tracking_tasks_serpbase_next RENAME TO rank_tracking_tasks;
ALTER TABLE rank_tracking_snapshots_serpbase_next RENAME TO rank_tracking_snapshots;
ALTER TABLE ai_prompt_observations_serpbase_next RENAME TO ai_prompt_observations;
`)
      database.exec(KEYWORD_SET_SCHEMA_SQL)
      database.exec(RANK_TRACKING_SCHEMA_SQL)
      database.exec(AI_PROMPT_OBSERVATION_SCHEMA_SQL)
      const violations = database.pragma('foreign_key_check') as unknown[]
      if (violations.length > 0) {
        throw new Error('Provider id migration found invalid foreign keys.')
      }
    })
    migrate.immediate()
    return true
  } finally {
    database.pragma('legacy_alter_table = OFF')
    database.pragma('foreign_keys = ON')
  }
}
