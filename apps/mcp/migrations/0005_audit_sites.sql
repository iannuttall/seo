-- Sites in the weekly-audit beta. The crawl data lives in one Durable
-- Object per row (SiteAudit, named by user_id and property); D1 keeps only
-- what is needed to wake it on schedule and list it without waking it.

CREATE TABLE audit_sites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The Search Console property: sc-domain:example.com or a URL prefix.
  property TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  -- When the next weekly run is due. Moved forward only after the site
  -- object accepted the start, so a failed wake is retried, not skipped.
  next_run_at INTEGER NOT NULL,
  last_requested_at INTEGER,
  -- Failed wakes in a row, for backoff, and the last error.
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  -- The last finished run, pushed by the site object.
  last_finished_at INTEGER,
  last_status TEXT,
  complete INTEGER,
  pages_fetched INTEGER,
  open_findings INTEGER,
  new_findings INTEGER,
  resolved_findings INTEGER,
  PRIMARY KEY (user_id, property)
);
CREATE INDEX audit_sites_due ON audit_sites(next_run_at);
