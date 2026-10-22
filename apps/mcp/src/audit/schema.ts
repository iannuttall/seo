// The site object's tables. Two kinds:
//
// Kept between runs, small and capped: the site, the current run, run
// history (52 runs), findings (resolved ones removed after 90 days) and the
// store of Google URL Inspection results.
//
// Disposable, one crawl only: pages and sitemaps. A new run renames pages to
// pages_prev (for "what changed since last week") and drops the older
// pages_prev, because DROP and RENAME are not billed per row and DELETE is.

export const KEPT = `
CREATE TABLE IF NOT EXISTS site (
  user_id TEXT NOT NULL,
  -- The Search Console property: sc-domain:example.com or a URL prefix.
  property TEXT PRIMARY KEY,
  -- Where the crawl starts and what it may fetch: one origin, and for a
  -- URL-prefix property only paths under its prefix.
  origin TEXT,
  scope TEXT NOT NULL DEFAULT '/'
);

CREATE TABLE IF NOT EXISTS run (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  concurrency INTEGER NOT NULL,
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
  -- Usage counters, written with each page.
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

-- The site's one store of Google URL Inspection results. Every hosted call
-- that inspects a URL of this site (the daily checks, seo index, seo page)
-- reads it first and writes its answer here. Known URLs come from the
-- sitemap and the weekly crawl (up to 50,000) and from Search Console pages
-- with clicks or impressions (up to 25,000 a 28-day window). A result is
-- fresh for 7 days, or until the weekly crawl sees the page change (live).
CREATE TABLE IF NOT EXISTS checks (
  url TEXT PRIMARY KEY,
  in_sitemap INTEGER NOT NULL DEFAULT 0,
  -- The last crawl that found it; a complete crawl drops URLs it did not
  -- find that have no Search Console clicks or impressions.
  seen_run TEXT,
  -- Search Console, refreshed once a day: the last 28 days, the 28 before,
  -- and whether the page lost its clicks (the seo index rule).
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  prev_clicks INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  -- Status, redirect, canonical and noindex at the last crawl, and when
  -- they last changed.
  live TEXT,
  live_changed_at INTEGER,
  checked_at INTEGER,
  -- The Search Console property whose quota checked it.
  property TEXT,
  verdict TEXT,
  coverage TEXT,
  -- Google's indexStatusResult as JSON, capped.
  result TEXT,
  -- Google's reason before it last changed, and when it changed.
  prev_coverage TEXT,
  changed_at INTEGER,
  error TEXT,
  -- When to check it next (see checks.ts), and whether it is a top page
  -- (checked daily), worked out once a day.
  due_at INTEGER,
  top INTEGER NOT NULL DEFAULT 0,
  -- Indexed at the last check (verdict PASS), a top page's drop waiting for
  -- its confirming check, and the last drop out of or return to the index.
  indexed INTEGER,
  pending_drop_at INTEGER,
  transition TEXT,
  transition_at INTEGER
);

-- Checks used per property on the current Search Console day (Pacific
-- time); other days' rows are removed once a day.
CREATE TABLE IF NOT EXISTS quota (
  property TEXT NOT NULL,
  day TEXT NOT NULL,
  used INTEGER NOT NULL,
  PRIMARY KEY (property, day)
);

-- One row: the properties that check this site's URLs, the folders worth
-- adding as properties (both worked out once a day), why checks last
-- stopped, and when the checks wake next.
CREATE TABLE IF NOT EXISTS check_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  day TEXT,
  properties TEXT,
  suggestions TEXT,
  stopped TEXT,
  next_at INTEGER,
  updated_at INTEGER
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

CREATE TABLE IF NOT EXISTS sitemaps (
  url TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('queued', 'fetched', 'failed')),
  status INTEGER,
  urls INTEGER,
  error TEXT
);
`

// Columns added to checks after it first shipped, for objects created
// before them. SQLite adds a column without rewriting rows.
export const CHECKS_ADDED: [string, string][] = [
  ['due_at', 'INTEGER'],
  ['top', 'INTEGER NOT NULL DEFAULT 0'],
  ['indexed', 'INTEGER'],
  ['pending_drop_at', 'INTEGER'],
  ['transition', 'TEXT'],
  ['transition_at', 'INTEGER'],
]
