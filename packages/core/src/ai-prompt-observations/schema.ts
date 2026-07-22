export const AI_PROMPT_OBSERVATION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ai_prompt_observations (
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
  provider TEXT NOT NULL CHECK(provider IN ('dataforseo', 'semrush', 'ahrefs')),
  provider_task_ids_json TEXT NOT NULL,
  completeness TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_observations_comparable
  ON ai_prompt_observations(comparison_key, checked_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_observations_created
  ON ai_prompt_observations(created_at DESC, id DESC);
`
