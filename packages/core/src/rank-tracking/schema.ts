export const RANK_TRACKING_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS rank_tracking_configs (
  id TEXT PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  keyword_set_id TEXT NOT NULL,
  target_domain TEXT NOT NULL,
  tag TEXT,
  market_json TEXT NOT NULL,
  devices_json TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('dataforseo', 'semrush', 'ahrefs')),
  collection_method TEXT NOT NULL CHECK(collection_method IN ('live', 'queued')),
  cadence TEXT NOT NULL CHECK(cadence IN ('manual', 'daily', 'weekly', 'monthly')),
  depth INTEGER NOT NULL CHECK(depth BETWEEN 1 AND 100),
  keyword_limit INTEGER NOT NULL CHECK(keyword_limit BETWEEN 1 AND 1000),
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(keyword_set_id) REFERENCES keyword_sets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rank_tracking_configs_project
  ON rank_tracking_configs(project_id, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_rank_tracking_configs_due
  ON rank_tracking_configs(cadence, next_run_at, id);

CREATE TABLE IF NOT EXISTS rank_tracking_runs (
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
CREATE INDEX IF NOT EXISTS idx_rank_tracking_runs_config
  ON rank_tracking_runs(config_id, started_at DESC, id DESC);
DROP INDEX IF EXISTS idx_rank_tracking_active_run;
CREATE UNIQUE INDEX idx_rank_tracking_active_run
  ON rank_tracking_runs(config_id)
  WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS rank_tracking_tasks (
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
CREATE INDEX IF NOT EXISTS idx_rank_tracking_tasks_run
  ON rank_tracking_tasks(run_id, state, normalized_keyword, device);
CREATE INDEX IF NOT EXISTS idx_rank_tracking_tasks_provider
  ON rank_tracking_tasks(provider_task_id, state);

CREATE TABLE IF NOT EXISTS rank_tracking_snapshots (
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
  provider TEXT NOT NULL CHECK(provider IN ('dataforseo', 'semrush', 'ahrefs')),
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
CREATE INDEX IF NOT EXISTS idx_rank_tracking_snapshots_run
  ON rank_tracking_snapshots(run_id, normalized_keyword, device);
`
