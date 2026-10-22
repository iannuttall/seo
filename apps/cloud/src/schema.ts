// The site object's tables. Two kinds:
//
// Kept between runs, small and capped: the site, the current run, run
// history (52 runs) and findings (resolved ones removed after 90 days).
//
// Disposable, one crawl only: pages, sitemaps and inspections. A new run renames pages to
// pages_prev (for "what changed since last week") and drops the old
// pages_prev, because DROP and RENAME are not billed per row and DELETE is.

export const KEPT = `
CREATE TABLE IF NOT EXISTS site (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  max_pages INTEGER NOT NULL,
  max_concurrency INTEGER NOT NULL,
  max_rps REAL NOT NULL,
  batch_pages INTEGER NOT NULL,
  wake_ms INTEGER NOT NULL,
  concurrency INTEGER NOT NULL,
  phase TEXT NOT NULL DEFAULT 'crawl' CHECK (phase IN ('crawl', 'inspect')),
  inspect_limit INTEGER NOT NULL DEFAULT 0,
  inspected INTEGER NOT NULL DEFAULT 0,
  seeded INTEGER NOT NULL DEFAULT 0,
  robots_status INTEGER,
  robots_txt TEXT,
  crawl_delay_ms INTEGER NOT NULL DEFAULT 0,
  pause_until INTEGER NOT NULL DEFAULT 0,
  -- URLs claimed by a wake that has not finished; retried, then given up.
  inflight TEXT,
  known_urls INTEGER NOT NULL DEFAULT 0,
  dropped_urls INTEGER NOT NULL DEFAULT 0,
  fetched INTEGER NOT NULL DEFAULT 0,
  -- Usage counters, saved at the end of every wake.
  wakes INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  throttled INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  rows_read INTEGER NOT NULL DEFAULT 0,
  alarms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  summary_pushed_at INTEGER
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL
);

-- The id is a hash of rule and subject, so the same problem keeps its id
-- from week to week. first_seen_run is how "new this week" is worked out.
-- An open finding is one the latest run saw, so a quiet week writes nothing.
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  rule TEXT NOT NULL,
  subject TEXT NOT NULL,
  details TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open', 'resolved')),
  first_seen_run TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  reopened_at INTEGER,
  resolved_at INTEGER
);
`

export const DISPOSABLE = `
CREATE TABLE IF NOT EXISTS pages (
  url TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('queued', 'fetched', 'failed', 'blocked')),
  depth INTEGER NOT NULL,
  in_sitemap INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  status INTEGER,
  location TEXT,
  content_type TEXT,
  x_robots TEXT,
  title TEXT,
  description TEXT,
  h1 TEXT,
  canonical TEXT,
  robots TEXT,
  words INTEGER,
  bytes INTEGER,
  ms INTEGER,
  -- JSON array of {u, a, n?}: one row per page, not one per link.
  links TEXT,
  external INTEGER,
  error TEXT
);

-- Google URL Inspection results for this run.
CREATE TABLE IF NOT EXISTS inspections (
  url TEXT PRIMARY KEY,
  verdict TEXT,
  coverage TEXT,
  indexing TEXT,
  robots_txt TEXT,
  google_canonical TEXT,
  last_crawl TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS sitemaps (
  url TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('queued', 'fetched', 'failed')),
  status INTEGER,
  urls INTEGER,
  error TEXT
);
`
