export const PROVIDER_SPEND_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS provider_spend_ledger (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  capability TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  project_id TEXT,
  report_id TEXT NOT NULL,
  report_run_id TEXT NOT NULL,
  requested_rows INTEGER NOT NULL CHECK(requested_rows >= 0),
  returned_rows INTEGER CHECK(returned_rows IS NULL OR returned_rows >= 0),
  estimated_cost_micros INTEGER NOT NULL CHECK(estimated_cost_micros >= 0),
  actual_cost_micros INTEGER CHECK(actual_cost_micros IS NULL OR actual_cost_micros >= 0),
  state TEXT NOT NULL CHECK(state IN ('reserved', 'succeeded', 'partial', 'failed', 'unknown')),
  task_ids_json TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  reservation_expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_provider_spend_period
  ON provider_spend_ledger(provider, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provider_spend_report
  ON provider_spend_ledger(provider, report_run_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_provider_spend_reservations
  ON provider_spend_ledger(state, reservation_expires_at);

CREATE TABLE IF NOT EXISTS provider_spend_notices (
  provider TEXT NOT NULL,
  threshold_micros INTEGER NOT NULL,
  period_start INTEGER NOT NULL,
  emitted_at INTEGER NOT NULL,
  PRIMARY KEY(provider, threshold_micros, period_start)
) WITHOUT ROWID;
`
