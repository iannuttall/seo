-- The scheduler and the index across sites. The site objects hold the
-- crawl data; D1 holds only what is needed to wake them and list them.

CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  property TEXT,
  max_pages INTEGER NOT NULL DEFAULT 500,
  inspect_limit INTEGER NOT NULL DEFAULT 0,
  -- When the next weekly run is due. Moved forward only after the site
  -- object accepted the start, so a failed wake is retried, not skipped.
  next_run_at INTEGER NOT NULL,
  last_requested_at INTEGER,
  last_finished_at INTEGER,
  -- Failed wakes in a row, for backoff.
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX sites_due ON sites (next_run_at);

-- One row per site, pushed by its object when a run ends.
CREATE TABLE site_summaries (
  site_id TEXT PRIMARY KEY REFERENCES sites (id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  complete INTEGER NOT NULL,
  finished_at INTEGER,
  pages_fetched INTEGER NOT NULL,
  open_findings INTEGER NOT NULL,
  new_findings INTEGER NOT NULL,
  resolved_findings INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
