import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AI_PROMPT_OBSERVATION_SCHEMA_SQL } from '../ai-prompt-observations/schema.js'
import { KEYWORD_SET_SCHEMA_SQL } from '../keyword-sets/schema.js'
import { RANK_TRACKING_SCHEMA_SQL } from '../rank-tracking/schema.js'
import { migrateProviderIds } from './provider-id-migration.js'
import Database from './sqlite.js'

function oldSchema(sql: string): string {
  return sql
    .replaceAll(
      'provider TEXT NOT NULL,',
      "provider TEXT NOT NULL CHECK(provider IN ('dataforseo', 'semrush', 'ahrefs')),",
    )
    .replaceAll(
      'metric_provider TEXT,',
      "metric_provider TEXT CHECK(metric_provider IS NULL OR metric_provider IN ('dataforseo', 'semrush', 'ahrefs')) ,",
    )
    .replaceAll(
      'provider TEXT,',
      "provider TEXT CHECK(provider IS NULL OR provider IN ('dataforseo', 'semrush', 'ahrefs')) ,",
    )
}

test('provider id migration preserves rows and accepts package provider ids', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(oldSchema(KEYWORD_SET_SCHEMA_SQL))
  db.exec(oldSchema(RANK_TRACKING_SCHEMA_SQL))
  db.exec(oldSchema(AI_PROMPT_OBSERVATION_SCHEMA_SQL))
  db.prepare(
    `INSERT INTO keyword_sets
     (id, project_id, name, market_json, provider, source_report, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'old-set',
    'project-1',
    'Old set',
    JSON.stringify({
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en',
    }),
    'dataforseo',
    null,
    1,
    1,
  )
  db.exec(`
    INSERT INTO keyword_set_items
      (set_id, normalized_keyword, display_keyword, metric_json, metric_provider,
       metric_observed_at, page_kind, page_url, created_at, updated_at)
    VALUES
      ('old-set', 'technical seo', 'Technical SEO', '{}', 'dataforseo',
       '2026-08-10T08:00:00.000Z', 'target', 'https://example.test/page', 1, 1);
    INSERT INTO keyword_set_tags
      (set_id, normalized_keyword, tag)
    VALUES ('old-set', 'technical seo', 'priority');

    INSERT INTO rank_tracking_configs
      (id, config_key, project_id, keyword_set_id, target_domain, tag,
       market_json, devices_json, provider, collection_method, cadence, depth,
       keyword_limit, next_run_at, created_at, updated_at)
    VALUES
      ('old-config', 'old-key', 'project-1', 'old-set', 'example.test', NULL,
       '{}', '["desktop"]', 'dataforseo', 'live', 'manual', 10, 1, NULL, 1, 1);
    INSERT INTO rank_tracking_runs
      (id, config_id, idempotency_key, state, collection_method, scheduled_for,
       started_at, completed_at, keyword_count, task_count, snapshot_count,
       pending_count, failed_count, estimated_cost_micros, actual_cost_micros,
       config_snapshot_json, error_summary)
    VALUES
      ('old-run', 'old-config', 'old-idempotency', 'complete', 'live', 1, 1, 2,
       1, 1, 1, 0, 0, 100, 100, '{}', NULL);
    INSERT INTO rank_tracking_tasks
      (id, run_id, normalized_keyword, display_keyword, device, state,
       provider_task_id, attempt_count, posted_at, collected_at, error_code,
       error_message)
    VALUES
      ('old-task', 'old-run', 'technical seo', 'Technical SEO', 'desktop',
       'complete', 'provider-task', 1, 1, 2, NULL, NULL);
    INSERT INTO rank_tracking_snapshots
      (task_id, run_id, normalized_keyword, display_keyword, device,
       observation_state, organic_position, absolute_position, ranking_url,
       observed_features_json, checked_at, provider, provider_task_id,
       requested_depth, returned_rows, retained_rows, invalid_rows,
       completeness, estimated_cost_micros, actual_cost_micros, warnings_json,
       created_at)
    VALUES
      ('old-task', 'old-run', 'technical seo', 'Technical SEO', 'desktop',
       'observed', 2, 2, 'https://example.test/page', '["organic"]',
       '2026-08-10T08:00:00.000Z', 'dataforseo', 'provider-task', 10, 10, 10,
       0, 'complete', 100, 100, '[]', 2);

    INSERT INTO ai_prompt_observations
      (id, comparison_key, prompt_id, prompt_group, prompt, surface,
       requested_model, effective_model, country_code, language_code,
       web_search_requested, web_search_observed, max_output_tokens, answer,
       answer_truncated, citations_json, fan_out_queries_json, input_tokens,
       output_tokens, reasoning_tokens, model_cost_micros,
       estimated_cost_micros, actual_cost_micros, checked_at, provider,
       provider_task_ids_json, completeness, warnings_json, created_at)
    VALUES
      ('old-observation', 'comparison', 'prompt', NULL, 'Question?', 'chatgpt',
       'model', 'model', 'GB', 'en', 1, 1, 100, 'Answer', 0, '[]', '[]', 1, 1,
       0, 1, 1, 1, '2026-08-10T08:00:00.000Z', 'dataforseo', '[]', 'complete',
       '[]', 2);
  `)

  assert.equal(migrateProviderIds(db), true)
  assert.equal(migrateProviderIds(db), false)
  assert.deepEqual(db.prepare('SELECT id, provider FROM keyword_sets').all(), [
    { id: 'old-set', provider: 'dataforseo' },
  ])
  assert.deepEqual(
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM keyword_set_items) AS items,
           (SELECT COUNT(*) FROM keyword_set_tags) AS tags,
           (SELECT COUNT(*) FROM rank_tracking_runs) AS runs,
           (SELECT COUNT(*) FROM rank_tracking_tasks) AS tasks,
           (SELECT COUNT(*) FROM rank_tracking_snapshots) AS snapshots,
           (SELECT COUNT(*) FROM ai_prompt_observations) AS observations`,
      )
      .get(),
    { items: 1, tags: 1, runs: 1, tasks: 1, snapshots: 1, observations: 1 },
  )
  db.prepare(
    `INSERT INTO rank_tracking_configs
     (id, config_key, project_id, keyword_set_id, target_domain, tag,
      market_json, devices_json, provider, collection_method, cadence, depth,
      keyword_limit, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'config-1',
    'key-1',
    'project-1',
    'old-set',
    'example.test',
    null,
    JSON.stringify({
      searchEngine: 'google',
      countryCode: 'GB',
      languageCode: 'en',
    }),
    JSON.stringify(['desktop']),
    'serpbase',
    'live',
    'weekly',
    10,
    25,
    null,
    2,
    2,
  )
  assert.equal(
    (
      db
        .prepare('SELECT provider FROM rank_tracking_configs WHERE id = ?')
        .get('config-1') as { provider: string }
    ).provider,
    'serpbase',
  )
  assert.deepEqual(db.pragma('foreign_key_check'), [])
})
