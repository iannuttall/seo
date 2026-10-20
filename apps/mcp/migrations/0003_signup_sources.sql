-- Where each person came from, written once when the person is created and
-- never updated. entry is how they signed up: 'mcp' (an MCP client's
-- sign-in), 'web' (the account page) or 'cli' (`seo login`). client is the
-- agent named by the MCP client name or found by the CLI. The site fields
-- come from the first-party seo_first cookie the site sets on a first visit:
-- the referrer's host only, the landing path without its query, and utm_*
-- values. No IP address, country or email.

CREATE TABLE signup_sources (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  entry TEXT NOT NULL,
  client TEXT,
  client_name TEXT,
  user_agent TEXT,
  referrer_host TEXT,
  landing_path TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT
);
CREATE INDEX signup_sources_created ON signup_sources(created_at);

-- A `seo login` waiting for approval keeps the CLI's agent and user agent
-- until the person approves it, so a first sign-in from its link can record
-- them. Both are cleared on approval.
ALTER TABLE cli_links ADD COLUMN agent TEXT;
ALTER TABLE cli_links ADD COLUMN user_agent TEXT;
